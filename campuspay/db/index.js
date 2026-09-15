const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'campuspay.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

// Money helpers — everything inside the app is paise.
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => Number((paise / 100).toFixed(2));

// Round-up: how much to sweep into savings to reach the next whole rupee ×10.
function roundUpAmount(paise, step = 1000) {
  const remainder = paise % step;
  return remainder === 0 ? 0 : step - remainder;
}

module.exports = { db, migrate, toPaise, toRupees, roundUpAmount, DB_PATH };
