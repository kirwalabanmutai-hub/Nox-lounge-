'use strict';

/**
 * SQLite connection using Node's built-in `node:sqlite` (Node >= 22.5).
 * No native build step required.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.resolve(ROOT, process.env.DB_FILE || './database/pos.db');
const SCHEMA_FILE = path.resolve(ROOT, 'database/schema.sqlite.sql');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

/** Apply schema (idempotent - uses IF NOT EXISTS everywhere). */
function migrate() {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  db.exec(sql);
}

/** True when the core tables have no rows yet. */
function isEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  return row.n === 0;
}

// ---- small query helpers -------------------------------------------------
// Accepts either an array (positional `?`) or an object (named `:name`).
const args = (p) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);
const query = (sql, params) => db.prepare(sql).all(...args(params));
const get = (sql, params) => db.prepare(sql).get(...args(params));
const run = (sql, params) => db.prepare(sql).run(...args(params));

/** Run fn() inside a transaction. */
function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, migrate, isEmpty, query, get, run, tx, DB_FILE, SCHEMA_FILE };
