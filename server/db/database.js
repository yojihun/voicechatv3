const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

function makeClient() {
  if (process.env.TURSO_DATABASE_URL) {
    return createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN || '',
    });
  }
  return createClient({ url: `file:${path.join(__dirname, 'voicechat.db')}` });
}

const db = makeClient();

let _ready = null;
function ensureReady() {
  if (_ready) return _ready;
  _ready = (async () => {
    await db.execute('PRAGMA foreign_keys = ON');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    for (const stmt of schema.split(';').filter(s => s.trim())) {
      await db.execute(stmt.trim());
    }
    try { await db.execute('ALTER TABLE sessions ADD COLUMN outline TEXT'); } catch (_) {}
    try { await db.execute('ALTER TABLE sessions ADD COLUMN feedback TEXT'); } catch (_) {}
    try { await db.execute('ALTER TABLE sessions ADD COLUMN scenario TEXT'); } catch (_) {}
  })();
  return _ready;
}

module.exports = { db, ensureReady };
