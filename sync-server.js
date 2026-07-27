const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.LUCKY_TRADERS_SYNC_PORT || process.env.PORT || 8095);
const DATA_DIR = process.env.SYNC_DATA_DIR
  ? path.resolve(process.env.SYNC_DATA_DIR)
  : path.join(__dirname, 'sync-data');
const DB_FILE = path.join(DATA_DIR, 'sync-db.json');
const SQLITE_DB_FILE = path.join(DATA_DIR, 'lucky-traders-sync.sqlite');
const FILE_DIR = path.join(DATA_DIR, 'files');
const MAX_BODY_BYTES = 80 * 1024 * 1024;
const SYNC_API_KEY = String(process.env.LUCKY_TRADERS_SYNC_API_KEY || process.env.SYNC_API_KEY || '').trim();
const REQUESTED_STORAGE = String(process.env.SYNC_STORAGE || '').trim().toLowerCase();
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
let sqliteDb = null;
let postgresPool = null;
let storageKind = 'json';

function makeEmptyStore() {
  return {
    revision: 0,
    updatedAt: '',
    updatedByDevice: '',
    data: null,
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function initializeStorage() {
  if (REQUESTED_STORAGE === 'postgres' || DATABASE_URL) {
    await initializePostgresStorage();
    return;
  }

  if (REQUESTED_STORAGE !== 'sqlite') {
    storageKind = 'json';
    return;
  }

  try {
    const { DatabaseSync } = require('node:sqlite');
    ensureDataDir();
    sqliteDb = new DatabaseSync(SQLITE_DB_FILE);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS sync_store (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT '',
        updated_by_device TEXT NOT NULL DEFAULT '',
        data_json TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_files (
        file_key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        record_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data_base64 TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_sync_files_kind_record
        ON sync_files (kind, record_id);
    `);
    storageKind = 'sqlite';
    migrateJsonStoreToSqlite();
    migrateFileStoreToSqlite();
  } catch (error) {
    sqliteDb = null;
    storageKind = 'json';
    console.warn('SQLite storage is unavailable. Falling back to JSON file storage:', error.message);
  }
}

function migrateJsonStoreToSqlite() {
  if (!sqliteDb || !fs.existsSync(DB_FILE)) return;

  const existing = readSqliteStore();
  if (existing.data || existing.revision > 0) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const migratedStore = {
      ...makeEmptyStore(),
      ...parsed,
      revision: Number.isFinite(parsed.revision) ? parsed.revision : 0,
      data: parsed.data || null,
    };
    if (migratedStore.data || migratedStore.revision > 0) {
      writeSqliteStore(migratedStore);
      console.log(`Migrated JSON sync store into SQLite: ${SQLITE_DB_FILE}`);
    }
  } catch (error) {
    console.warn('Unable to migrate JSON sync store into SQLite:', error.message);
  }
}

function migrateFileStoreToSqlite() {
  if (!sqliteDb || !fs.existsSync(FILE_DIR)) return;

  try {
    const existingCount = sqliteDb.prepare('SELECT COUNT(*) AS count FROM sync_files').get().count;
    if (existingCount > 0) return;

    const metadataFiles = fs.readdirSync(FILE_DIR).filter((fileName) => fileName.endsWith('.json'));
    metadataFiles.forEach((metadataFileName) => {
      const metaPath = path.join(FILE_DIR, metadataFileName);
      const dataPath = path.join(FILE_DIR, metadataFileName.replace(/\.json$/, '.bin'));
      if (!fs.existsSync(dataPath)) return;

      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      writeSyncFile({
        kind: metadata.kind,
        id: metadata.id,
        fileName: metadata.fileName,
        mimeType: metadata.mimeType,
        base64: fs.readFileSync(dataPath).toString('base64'),
        updatedAt: metadata.updatedAt,
      });
    });

    if (metadataFiles.length > 0) {
      console.log(`Migrated ${metadataFiles.length} sync file metadata records into SQLite.`);
    }
  } catch (error) {
    console.warn('Unable to migrate sync files into SQLite:', error.message);
  }
}

async function readStore() {
  if (storageKind === 'postgres' && postgresPool) {
    return readPostgresStore();
  }

  if (storageKind === 'sqlite' && sqliteDb) {
    return readSqliteStore();
  }

  return readJsonStore();
}

function readJsonStore() {
  try {
    if (!fs.existsSync(DB_FILE)) return makeEmptyStore();
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      ...makeEmptyStore(),
      ...parsed,
      revision: Number.isFinite(parsed.revision) ? parsed.revision : 0,
      data: parsed.data || null,
    };
  } catch (error) {
    console.error('Unable to read sync database:', error);
    return makeEmptyStore();
  }
}

async function writeStore(store) {
  if (storageKind === 'postgres' && postgresPool) {
    await writePostgresStore(store);
    return;
  }

  if (storageKind === 'sqlite' && sqliteDb) {
    writeSqliteStore(store);
    return;
  }

  writeJsonStore(store);
}

function writeJsonStore(store) {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
}

function readSqliteStore() {
  try {
    const row = sqliteDb.prepare('SELECT revision, updated_at, updated_by_device, data_json FROM sync_store WHERE id = 1').get();
    if (!row) return makeEmptyStore();

    return {
      revision: Number(row.revision) || 0,
      updatedAt: row.updated_at || '',
      updatedByDevice: row.updated_by_device || '',
      data: row.data_json ? JSON.parse(row.data_json) : null,
    };
  } catch (error) {
    console.error('Unable to read SQLite sync database:', error);
    return makeEmptyStore();
  }
}

function writeSqliteStore(store) {
  const normalizedStore = {
    ...makeEmptyStore(),
    ...store,
    data: store.data || null,
  };
  sqliteDb.prepare(`
    INSERT INTO sync_store (id, revision, updated_at, updated_by_device, data_json)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      revision = excluded.revision,
      updated_at = excluded.updated_at,
      updated_by_device = excluded.updated_by_device,
      data_json = excluded.data_json
  `).run(
    Number(normalizedStore.revision) || 0,
    String(normalizedStore.updatedAt || ''),
    String(normalizedStore.updatedByDevice || ''),
    normalizedStore.data ? JSON.stringify(normalizedStore.data) : null,
  );
}

async function initializePostgresStorage() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required when SYNC_STORAGE=postgres.');
  }

  const { Pool } = require('pg');
  postgresPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: getPostgresSslConfig(DATABASE_URL),
  });

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS sync_store (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      updated_by_device TEXT NOT NULL DEFAULT '',
      data_json JSONB
    );

    CREATE TABLE IF NOT EXISTS sync_files (
      file_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      record_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sync_files_kind_record
      ON sync_files (kind, record_id);
  `);

  storageKind = 'postgres';
  await migrateJsonStoreToPostgres();
  await migrateFileStoreToPostgres();
}

function getPostgresSslConfig(databaseUrl) {
  const sslMode = String(process.env.DATABASE_SSL || process.env.PGSSLMODE || '').trim().toLowerCase();
  if (['0', 'false', 'disable', 'disabled', 'no'].includes(sslMode)) return false;
  if (['1', 'true', 'require', 'required', 'no-verify', 'prefer'].includes(sslMode)) {
    return { rejectUnauthorized: false };
  }

  try {
    const host = new URL(databaseUrl).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return false;
  } catch {
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: false };
}

async function migrateJsonStoreToPostgres() {
  if (!postgresPool || !fs.existsSync(DB_FILE)) return;

  const existing = await readPostgresStore();
  if (existing.data || existing.revision > 0) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const migratedStore = {
      ...makeEmptyStore(),
      ...parsed,
      revision: Number.isFinite(parsed.revision) ? parsed.revision : 0,
      data: parsed.data || null,
    };
    if (migratedStore.data || migratedStore.revision > 0) {
      await writePostgresStore(migratedStore);
      console.log('Migrated JSON sync store into PostgreSQL.');
    }
  } catch (error) {
    console.warn('Unable to migrate JSON sync store into PostgreSQL:', error.message);
  }
}

async function migrateFileStoreToPostgres() {
  if (!postgresPool || !fs.existsSync(FILE_DIR)) return;

  try {
    const existingCount = Number((await postgresPool.query('SELECT COUNT(*) AS count FROM sync_files')).rows[0].count) || 0;
    if (existingCount > 0) return;

    const metadataFiles = fs.readdirSync(FILE_DIR).filter((fileName) => fileName.endsWith('.json'));
    for (const metadataFileName of metadataFiles) {
      const metaPath = path.join(FILE_DIR, metadataFileName);
      const dataPath = path.join(FILE_DIR, metadataFileName.replace(/\.json$/, '.bin'));
      if (!fs.existsSync(dataPath)) continue;

      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      await writePostgresSyncFile({
        kind: metadata.kind,
        id: metadata.id,
        fileName: metadata.fileName,
        mimeType: metadata.mimeType,
        base64: fs.readFileSync(dataPath).toString('base64'),
        updatedAt: metadata.updatedAt,
      });
    }

    if (metadataFiles.length > 0) {
      console.log(`Migrated ${metadataFiles.length} sync file metadata records into PostgreSQL.`);
    }
  } catch (error) {
    console.warn('Unable to migrate sync files into PostgreSQL:', error.message);
  }
}

async function readPostgresStore() {
  try {
    const result = await postgresPool.query('SELECT revision, updated_at, updated_by_device, data_json FROM sync_store WHERE id = 1');
    const row = result.rows[0];
    if (!row) return makeEmptyStore();

    return {
      revision: Number(row.revision) || 0,
      updatedAt: row.updated_at || '',
      updatedByDevice: row.updated_by_device || '',
      data: row.data_json || null,
    };
  } catch (error) {
    console.error('Unable to read PostgreSQL sync database:', error);
    return makeEmptyStore();
  }
}

async function writePostgresStore(store) {
  const normalizedStore = {
    ...makeEmptyStore(),
    ...store,
    data: store.data || null,
  };

  await postgresPool.query(
    `
      INSERT INTO sync_store (id, revision, updated_at, updated_by_device, data_json)
      VALUES (1, $1, $2, $3, $4::jsonb)
      ON CONFLICT(id) DO UPDATE SET
        revision = EXCLUDED.revision,
        updated_at = EXCLUDED.updated_at,
        updated_by_device = EXCLUDED.updated_by_device,
        data_json = EXCLUDED.data_json
    `,
    [
      Number(normalizedStore.revision) || 0,
      String(normalizedStore.updatedAt || ''),
      String(normalizedStore.updatedByDevice || ''),
      normalizedStore.data ? JSON.stringify(normalizedStore.data) : null,
    ],
  );
}

function getSyncFilePaths(kind, id) {
  const safeKind = safeSegment(kind);
  const safeId = safeSegment(id);
  const baseName = `${safeKind}-${safeId}`;
  return {
    dataPath: path.join(FILE_DIR, `${baseName}.bin`),
    metaPath: path.join(FILE_DIR, `${baseName}.json`),
  };
}

function getSyncFileKey(kind, id) {
  return `${safeSegment(kind)}-${safeSegment(id)}`;
}

async function readSyncFile(kind, id) {
  if (storageKind === 'postgres' && postgresPool) {
    return readPostgresSyncFile(kind, id);
  }

  if (storageKind === 'sqlite' && sqliteDb) {
    const row = sqliteDb.prepare(`
      SELECT kind, record_id, file_name, mime_type, updated_at, data_base64, size
      FROM sync_files
      WHERE file_key = ?
    `).get(getSyncFileKey(kind, id));

    if (!row) return null;

    return {
      kind: row.kind,
      id: row.record_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      updatedAt: row.updated_at,
      base64: row.data_base64,
      size: Number(row.size) || 0,
    };
  }

  const { dataPath, metaPath } = getSyncFilePaths(kind, id);
  if (!fs.existsSync(dataPath) || !fs.existsSync(metaPath)) return null;

  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const base64 = fs.readFileSync(dataPath).toString('base64');
  return {
    ...metadata,
    base64,
    size: fs.statSync(dataPath).size,
  };
}

async function writeSyncFile({ kind, id, fileName, mimeType, base64, updatedAt }) {
  if (storageKind === 'postgres' && postgresPool) {
    return writePostgresSyncFile({ kind, id, fileName, mimeType, base64, updatedAt });
  }

  const metadata = {
    kind: String(kind || ''),
    id: String(id || ''),
    fileName: String(fileName || `${kind}-${id}`),
    mimeType: String(mimeType || 'application/octet-stream'),
    updatedAt: String(updatedAt || new Date().toISOString()),
  };
  const buffer = Buffer.from(String(base64 || ''), 'base64');

  if (storageKind === 'sqlite' && sqliteDb) {
    sqliteDb.prepare(`
      INSERT INTO sync_files (file_key, kind, record_id, file_name, mime_type, updated_at, data_base64, size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_key) DO UPDATE SET
        kind = excluded.kind,
        record_id = excluded.record_id,
        file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        updated_at = excluded.updated_at,
        data_base64 = excluded.data_base64,
        size = excluded.size
    `).run(
      getSyncFileKey(metadata.kind, metadata.id),
      metadata.kind,
      metadata.id,
      metadata.fileName,
      metadata.mimeType,
      metadata.updatedAt,
      String(base64 || ''),
      buffer.length,
    );

    return {
      ...metadata,
      size: buffer.length,
    };
  }

  if (!fs.existsSync(FILE_DIR)) {
    fs.mkdirSync(FILE_DIR, { recursive: true });
  }

  const { dataPath, metaPath } = getSyncFilePaths(metadata.kind, metadata.id);
  fs.writeFileSync(dataPath, buffer);
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  return {
    ...metadata,
    size: fs.statSync(dataPath).size,
  };
}

async function readPostgresSyncFile(kind, id) {
  const result = await postgresPool.query(
    `
      SELECT kind, record_id, file_name, mime_type, updated_at, data_base64, size
      FROM sync_files
      WHERE file_key = $1
    `,
    [getSyncFileKey(kind, id)],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    kind: row.kind,
    id: row.record_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    updatedAt: row.updated_at,
    base64: row.data_base64,
    size: Number(row.size) || 0,
  };
}

async function writePostgresSyncFile({ kind, id, fileName, mimeType, base64, updatedAt }) {
  const metadata = {
    kind: String(kind || ''),
    id: String(id || ''),
    fileName: String(fileName || `${kind}-${id}`),
    mimeType: String(mimeType || 'application/octet-stream'),
    updatedAt: String(updatedAt || new Date().toISOString()),
  };
  const encodedData = String(base64 || '');
  const buffer = Buffer.from(encodedData, 'base64');

  await postgresPool.query(
    `
      INSERT INTO sync_files (file_key, kind, record_id, file_name, mime_type, updated_at, data_base64, size)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(file_key) DO UPDATE SET
        kind = EXCLUDED.kind,
        record_id = EXCLUDED.record_id,
        file_name = EXCLUDED.file_name,
        mime_type = EXCLUDED.mime_type,
        updated_at = EXCLUDED.updated_at,
        data_base64 = EXCLUDED.data_base64,
        size = EXCLUDED.size
    `,
    [
      getSyncFileKey(metadata.kind, metadata.id),
      metadata.kind,
      metadata.id,
      metadata.fileName,
      metadata.mimeType,
      metadata.updatedAt,
      encodedData,
      buffer.length,
    ],
  );

  return {
    ...metadata,
    size: buffer.length,
  };
}

async function getStoredFileCount() {
  if (storageKind === 'postgres' && postgresPool) {
    return Number((await postgresPool.query('SELECT COUNT(*) AS count FROM sync_files')).rows[0].count) || 0;
  }

  if (storageKind === 'sqlite' && sqliteDb) {
    return Number(sqliteDb.prepare('SELECT COUNT(*) AS count FROM sync_files').get().count) || 0;
  }

  if (!fs.existsSync(FILE_DIR)) return 0;
  return fs.readdirSync(FILE_DIR).filter((fileName) => fileName.endsWith('.json')).length;
}

function getDataCounts(snapshot) {
  const data = normalizeSnapshot(snapshot);
  return {
    users: Object.keys(data.userTable.admin_users).length + Object.keys(data.userTable.manager_users).length,
    clients: data.clients.length,
    suppliers: data.suppliers.length,
    products: data.products.length,
    purchases: data.purchases.length,
    employees: data.employees.length,
    salaries: data.salaries.length,
    expenses: data.expenses.length,
    payments: data.payments.length,
    supplierPayments: data.supplierPayments.length,
    savedInvoices: data.savedInvoices.length,
    managerCustomers: data.managerWorkbook.customers.length,
    managerBills: data.managerWorkbook.bills.length,
    managerCashbook: data.managerWorkbook.cashbook.length,
  };
}

async function getDatabaseStatus() {
  const store = await readStore();
  return {
    ok: true,
    storage: storageKind,
    database: getDatabaseLabel(),
    revision: store.revision,
    updatedAt: store.updatedAt,
    updatedByDevice: store.updatedByDevice,
    hasData: Boolean(store.data),
    counts: store.data ? getDataCounts(store.data) : null,
    syncedFileCount: await getStoredFileCount(),
  };
}

function getDatabaseLabel() {
  if (storageKind === 'postgres') return maskDatabaseUrl(DATABASE_URL);
  if (storageKind === 'sqlite') return SQLITE_DB_FILE;
  return DB_FILE;
}

function maskDatabaseUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = parsed.username ? '***' : '';
    return parsed.toString();
  } catch {
    return 'postgres';
  }
}

function safeSegment(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160) || 'file';
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept,X-API-Key,Authorization',
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(payload));
}

function isAuthorized(req) {
  if (!SYNC_API_KEY) return true;

  const apiKey = String(req.headers['x-api-key'] || '').trim();
  const authorization = String(req.headers.authorization || '').trim();
  return apiKey === SYNC_API_KEY || authorization === `Bearer ${SYNC_API_KEY}`;
}

function parseRequestUrl(req) {
  return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error('Sync payload is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeSnapshot(data) {
  const source = data && typeof data === 'object' ? data : {};
  const savedInvoices = asArray(source.savedInvoices);
  const sourceNextInvoiceSequence = Math.max(1, Number.parseInt(source.nextInvoiceSequence || '1', 10) || 1);

  return {
    userTable: normalizeUserTable(source.userTable),
    clients: asArray(source.clients),
    suppliers: asArray(source.suppliers),
    products: asArray(source.products),
    purchases: asArray(source.purchases),
    employees: asArray(source.employees),
    salaries: asArray(source.salaries),
    expenses: asArray(source.expenses),
    payments: asArray(source.payments),
    supplierPayments: asArray(source.supplierPayments),
    nextInvoiceSequence: getNextInvoiceSequenceFromInvoices(savedInvoices, sourceNextInvoiceSequence),
    savedInvoices,
    managerNonGstSequence: Math.max(1, Number.parseInt(source.managerNonGstSequence || '1', 10) || 1),
    managerWorkbook: normalizeManagerWorkbook(source.managerWorkbook),
  };
}

function normalizeManagerWorkbook(value) {
  const source = value && typeof value === 'object' ? value : {};
  const profitSettings = source.profitSettings && typeof source.profitSettings === 'object' ? source.profitSettings : {};

  return {
    customers: asArray(source.customers),
    bills: asArray(source.bills),
    stockEntries: asArray(source.stockEntries),
    sales: asArray(source.sales),
    credits: asArray(source.credits),
    cashbook: asArray(source.cashbook),
    investments: asArray(source.investments),
    loans: asArray(source.loans),
    expenses: asArray(source.expenses),
    profitSettings: {
      otherProfit: Number(profitSettings.otherProfit) || 0,
      totalExpense: Number(profitSettings.totalExpense) || 0,
    },
  };
}

function normalizeUserTable(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    admin_users: normalizeUserCollection(source.admin_users),
    manager_users: normalizeUserCollection(source.manager_users),
  };
}

function normalizeUserCollection(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, record]) => record && typeof record === 'object' && record.id),
  );
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function mergeSnapshots(serverData, clientData) {
  const server = normalizeSnapshot(serverData);
  const client = normalizeSnapshot(clientData);
  const savedInvoices = mergeList(server.savedInvoices, client.savedInvoices, 'id');

  return {
    userTable: mergeUserTables(server.userTable, client.userTable),
    clients: mergeList(server.clients, client.clients, 'id'),
    suppliers: mergeList(server.suppliers, client.suppliers, 'id'),
    products: mergeList(server.products, client.products, 'key'),
    purchases: mergeList(server.purchases, client.purchases, 'id'),
    employees: mergeList(server.employees, client.employees, 'id'),
    salaries: mergeList(server.salaries, client.salaries, 'id'),
    expenses: mergeList(server.expenses, client.expenses, 'id'),
    payments: mergeList(server.payments, client.payments, 'id'),
    supplierPayments: mergeList(server.supplierPayments, client.supplierPayments, 'id'),
    nextInvoiceSequence: getNextInvoiceSequenceFromInvoices(savedInvoices, Math.max(server.nextInvoiceSequence, client.nextInvoiceSequence)),
    savedInvoices,
    managerNonGstSequence: Math.max(server.managerNonGstSequence, client.managerNonGstSequence),
    managerWorkbook: mergeManagerWorkbooks(server.managerWorkbook, client.managerWorkbook),
  };
}

function getNextInvoiceSequenceFromInvoices(invoices, fallbackSequence) {
  const highest = invoices.reduce((max, invoice) => {
    return Math.max(
      max,
      getInvoiceSequenceNumber(invoice.invoiceNo),
      getInvoiceSequenceNumber(invoice.invoice && invoice.invoice.invoiceNo),
    );
  }, 0);

  return Math.max(1, fallbackSequence, highest + 1);
}

function getInvoiceSequenceNumber(invoiceNo) {
  if (!invoiceNo || typeof invoiceNo !== 'string') return 0;
  const match = invoiceNo.trim().toUpperCase().match(/^#LT0*(\d+)$/);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

function mergeManagerWorkbooks(serverWorkbook, clientWorkbook) {
  const server = normalizeManagerWorkbook(serverWorkbook);
  const client = normalizeManagerWorkbook(clientWorkbook);

  return {
    customers: mergeList(server.customers, client.customers, 'id'),
    bills: mergeList(server.bills, client.bills, 'id'),
    stockEntries: mergeList(server.stockEntries, client.stockEntries, 'id'),
    sales: mergeList(server.sales, client.sales, 'id'),
    credits: mergeList(server.credits, client.credits, 'id'),
    cashbook: mergeList(server.cashbook, client.cashbook, 'id'),
    investments: mergeList(server.investments, client.investments, 'id'),
    loans: mergeList(server.loans, client.loans, 'id'),
    expenses: mergeList(server.expenses, client.expenses, 'id'),
    profitSettings: {
      ...server.profitSettings,
      ...client.profitSettings,
    },
  };
}

function mergeUserTables(server, client) {
  return {
    admin_users: mergeUserCollection(server.admin_users, client.admin_users),
    manager_users: mergeUserCollection(server.manager_users, client.manager_users),
  };
}

function mergeUserCollection(server, client) {
  const next = { ...server };
  Object.entries(client).forEach(([id, record]) => {
    if (!next[id]) next[id] = record;
  });
  return next;
}

function mergeList(serverList, clientList, keyName) {
  const map = new Map();
  serverList.forEach((item) => {
    const key = getRecordKey(item, keyName);
    if (key) map.set(key, item);
  });
  clientList.forEach((item) => {
    const key = getRecordKey(item, keyName);
    if (!key) return;
    const existing = map.get(key);
    map.set(key, existing ? pickNewerRecord(existing, item) : item);
  });
  return Array.from(map.values());
}

function getRecordKey(item, keyName) {
  return String(item[keyName] || item.id || item.key || '').trim();
}

function pickNewerRecord(serverRecord, clientRecord) {
  if (clientRecord.updatedAt && !serverRecord.updatedAt) return clientRecord;
  if (serverRecord.updatedAt && !clientRecord.updatedAt) return serverRecord;

  const serverTime = getRecordTime(serverRecord);
  const clientTime = getRecordTime(clientRecord);
  if (clientTime > serverTime) return clientRecord;
  return serverRecord;
}

function getRecordTime(record) {
  return Math.max(
    parseRecordDate(record.updatedAt),
    parseRecordDate(record.savedAt),
    parseRecordDate(record.createdAt),
    parseRecordDate(record.paymentDate),
    parseRecordDate(record.invoiceDate),
    parseRecordDate(record.expenseDate),
    parseRecordDate(record.joinDate),
    parseRecordDate(record.date),
    0,
  );
}

function parseRecordDate(value) {
  if (!value || typeof value !== 'string') return 0;
  const displayMatch = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (displayMatch) {
    return new Date(Number(displayMatch[3]), Number(displayMatch[2]) - 1, Number(displayMatch[1])).getTime() || 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    const store = await readStore();
    sendJson(res, 200, {
      ok: true,
      storage: storageKind,
      revision: store.revision,
      updatedAt: store.updatedAt,
    });
    return;
  }

  const requestUrl = parseRequestUrl(req);

  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized.' });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/database') {
    sendJson(res, 200, await getDatabaseStatus());
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/file') {
    const kind = requestUrl.searchParams.get('kind');
    const id = requestUrl.searchParams.get('id');
    const storedFile = await readSyncFile(kind, id);

    if (!storedFile) {
      sendJson(res, 404, { error: 'File not found.' });
      return;
    }

    sendJson(res, 200, storedFile);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/file') {
    try {
      const payload = await readJsonBody(req);
      const kind = String(payload.kind || '');
      const id = String(payload.id || '');
      const base64 = String(payload.base64 || '');

      if (!kind || !id || !base64) {
        throw new Error('kind, id, and base64 are required.');
      }

      const metadata = await writeSyncFile({
        kind,
        id,
        fileName: String(payload.fileName || `${kind}-${id}`),
        mimeType: String(payload.mimeType || 'application/octet-stream'),
        base64,
      });
      sendJson(res, 200, {
        ok: true,
        ...metadata,
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'File sync failed.' });
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/sync') {
    const store = await readStore();
    sendJson(res, 200, {
      revision: store.revision,
      updatedAt: store.updatedAt,
      mode: 'read',
      data: store.data,
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/sync') {
    try {
      const payload = await readJsonBody(req);
      const clientData = normalizeSnapshot(payload.data);
      const store = await readStore();
      const baseRevision = Number.parseInt(payload.baseRevision || '0', 10) || 0;
      const canReplace = !store.data || store.revision === 0 || baseRevision === store.revision;
      const nextData = canReplace ? clientData : mergeSnapshots(store.data, clientData);
      const nextStore = {
        revision: store.revision + 1,
        updatedAt: new Date().toISOString(),
        updatedByDevice: String(payload.deviceId || ''),
        data: nextData,
      };

      await writeStore(nextStore);
      sendJson(res, 200, {
        revision: nextStore.revision,
        updatedAt: nextStore.updatedAt,
        mode: canReplace ? 'replace' : 'merge',
        data: nextStore.data,
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Sync failed.' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
});

async function startServer() {
  await initializeStorage();
  server.listen(PORT, '0.0.0.0', () => {
    const addresses = getLanAddresses();
    console.log(`Lucky Traders sync server running on port ${PORT}`);
    console.log(`Local:   http://127.0.0.1:${PORT}`);
    addresses.forEach((address) => console.log(`Network: http://${address}:${PORT}`));
    console.log(`Storage: ${storageKind}`);
    console.log(`Database: ${getDatabaseLabel()}`);
  });
}

startServer().catch((error) => {
  console.error('Unable to start Lucky Traders sync server:', error);
  process.exit(1);
});
