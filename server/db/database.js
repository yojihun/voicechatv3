const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.VERCEL
  ? '/tmp/voicechat.db'
  : path.join(__dirname, 'voicechat.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrations for existing databases
try { db.exec('ALTER TABLE sessions ADD COLUMN outline TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN feedback TEXT'); } catch (_) {}

module.exports = db;
