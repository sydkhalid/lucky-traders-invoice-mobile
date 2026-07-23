const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.LUCKY_TRADERS_SYNC_PORT || process.env.PORT || 8095);
const DATA_DIR = process.env.SYNC_DATA_DIR
  ? path.resolve(process.env.SYNC_DATA_DIR)
  : path.join(__dirname, 'sync-data');
const DB_FILE = path.join(DATA_DIR, 'sync-db.json');
const FILE_DIR = path.join(DATA_DIR, 'files');
const MAX_BODY_BYTES = 80 * 1024 * 1024;
const SYNC_API_KEY = String(process.env.LUCKY_TRADERS_SYNC_API_KEY || process.env.SYNC_API_KEY || '').trim();

function makeEmptyStore() {
  return {
    revision: 0,
    updatedAt: '',
    updatedByDevice: '',
    data: null,
  };
}

function readStore() {
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

function writeStore(store) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
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
    const store = readStore();
    sendJson(res, 200, {
      ok: true,
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

  if (req.method === 'GET' && requestUrl.pathname === '/file') {
    const kind = requestUrl.searchParams.get('kind');
    const id = requestUrl.searchParams.get('id');
    const { dataPath, metaPath } = getSyncFilePaths(kind, id);

    if (!fs.existsSync(dataPath) || !fs.existsSync(metaPath)) {
      sendJson(res, 404, { error: 'File not found.' });
      return;
    }

    const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const base64 = fs.readFileSync(dataPath).toString('base64');
    sendJson(res, 200, {
      ...metadata,
      base64,
      size: fs.statSync(dataPath).size,
    });
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

      if (!fs.existsSync(FILE_DIR)) {
        fs.mkdirSync(FILE_DIR, { recursive: true });
      }

      const { dataPath, metaPath } = getSyncFilePaths(kind, id);
      const metadata = {
        kind,
        id,
        fileName: String(payload.fileName || `${kind}-${id}`),
        mimeType: String(payload.mimeType || 'application/octet-stream'),
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(dataPath, Buffer.from(base64, 'base64'));
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
      sendJson(res, 200, {
        ok: true,
        ...metadata,
        size: fs.statSync(dataPath).size,
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'File sync failed.' });
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/sync') {
    const store = readStore();
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
      const store = readStore();
      const baseRevision = Number.parseInt(payload.baseRevision || '0', 10) || 0;
      const canReplace = !store.data || store.revision === 0 || baseRevision === store.revision;
      const nextData = canReplace ? clientData : mergeSnapshots(store.data, clientData);
      const nextStore = {
        revision: store.revision + 1,
        updatedAt: new Date().toISOString(),
        updatedByDevice: String(payload.deviceId || ''),
        data: nextData,
      };

      writeStore(nextStore);
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

server.listen(PORT, '0.0.0.0', () => {
  const addresses = getLanAddresses();
  console.log(`Lucky Traders sync server running on port ${PORT}`);
  console.log(`Local:   http://127.0.0.1:${PORT}`);
  addresses.forEach((address) => console.log(`Network: http://${address}:${PORT}`));
  console.log(`Data:    ${DB_FILE}`);
});
