const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'love-and-peace.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function safeAddColumn(table, column, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    // 列已存在 — 忽略
    if (!err.message.includes('duplicate')) throw err;
  }
}

module.exports = { db, dataDir, safeAddColumn };
