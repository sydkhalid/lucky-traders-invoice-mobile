const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const seedDbFile = path.resolve(process.env.SYNC_SEED_DB_FILE || process.argv[2] || path.join(__dirname, '..', 'sync-data', 'sync-db.json'));
const seedFileDir = path.resolve(process.env.SYNC_SEED_FILE_DIR || process.argv[3] || path.join(path.dirname(seedDbFile), 'files'));

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

async function main() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Example: $env:DATABASE_URL="postgresql://user:pass@localhost:5432/lucky_traders"; npm run seed:postgres');
  }

  if (!fs.existsSync(seedDbFile)) {
    throw new Error(`Seed JSON not found: ${seedDbFile}`);
  }

  const parsed = JSON.parse(fs.readFileSync(seedDbFile, 'utf8'));
  const store = {
    revision: Number.isFinite(parsed.revision) ? parsed.revision : 0,
    updatedAt: String(parsed.updatedAt || ''),
    updatedByDevice: String(parsed.updatedByDevice || ''),
    data: parsed.data || null,
  };

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: getPostgresSslConfig(DATABASE_URL),
  });

  try {
    await pool.query(`
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

    const existing = await pool.query('SELECT revision, data_json FROM sync_store WHERE id = 1');
    const existingRow = existing.rows[0];
    if (existingRow && (existingRow.data_json || Number(existingRow.revision) > 0)) {
      console.log(`PostgreSQL sync_store already has data at revision ${Number(existingRow.revision) || 0}. No changes made.`);
      return;
    }

    await pool.query(
      `
        INSERT INTO sync_store (id, revision, updated_at, updated_by_device, data_json)
        VALUES (1, $1, $2, $3, $4::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          updated_by_device = excluded.updated_by_device,
          data_json = excluded.data_json
      `,
      [
        store.revision,
        store.updatedAt,
        store.updatedByDevice,
        store.data ? JSON.stringify(store.data) : null,
      ],
    );

    let importedFiles = 0;
    const existingFileCount = Number((await pool.query('SELECT COUNT(*) AS count FROM sync_files')).rows[0].count) || 0;
    if (existingFileCount === 0 && fs.existsSync(seedFileDir)) {
      const metadataFiles = fs.readdirSync(seedFileDir).filter((fileName) => fileName.endsWith('.json'));
      for (const metadataFileName of metadataFiles) {
        const metaPath = path.join(seedFileDir, metadataFileName);
        const dataPath = path.join(seedFileDir, metadataFileName.replace(/\.json$/, '.bin'));
        if (!fs.existsSync(dataPath)) continue;

        const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const fileKey = `${metadata.kind}:${metadata.id}`;
        const base64 = fs.readFileSync(dataPath).toString('base64');
        await pool.query(
          `
            INSERT INTO sync_files (file_key, kind, record_id, file_name, mime_type, updated_at, data_base64, size)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT(file_key) DO UPDATE SET
              kind = excluded.kind,
              record_id = excluded.record_id,
              file_name = excluded.file_name,
              mime_type = excluded.mime_type,
              updated_at = excluded.updated_at,
              data_base64 = excluded.data_base64,
              size = excluded.size
          `,
          [
            fileKey,
            String(metadata.kind || ''),
            String(metadata.id || ''),
            String(metadata.fileName || ''),
            String(metadata.mimeType || 'application/octet-stream'),
            String(metadata.updatedAt || new Date().toISOString()),
            base64,
            Buffer.byteLength(base64, 'base64'),
          ],
        );
        importedFiles += 1;
      }
    }

    console.log(`Seeded PostgreSQL from ${seedDbFile}`);
    console.log(`Revision: ${store.revision}`);
    console.log(`Imported files: ${importedFiles}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
