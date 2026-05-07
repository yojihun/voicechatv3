const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'voicechat.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrations for existing databases
try { db.exec('ALTER TABLE sessions ADD COLUMN outline TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN feedback TEXT'); } catch (_) {}

module.exports = db;
