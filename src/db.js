'use strict';

/**
 * Database connection - one driver, two destinations:
 *
 *   - No TURSO_DATABASE_URL set  -> a local SQLite file (till PC / npm start).
 *     Fully offline: no network involved at all.
 *   - TURSO_DATABASE_URL set     -> a remote Turso (libSQL) database, reached
 *     over HTTPS. This is what a Vercel/cloud deployment uses, since a
 *     serverless function has no persistent local disk.
 *
 * Same schema, same SQL dialect (libSQL is a SQLite-compatible engine), same
 * query API either way - every call site just needs `await`.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_FILE = path.resolve(ROOT, 'database/schema.sqlite.sql');
const isRemote = Boolean(process.env.TURSO_DATABASE_URL);

// Remote (Turso) -> the pure-HTTP "web" client: no native binary, so it
// bundles cleanly into a serverless function. Local -> the default client,
// which can open a "file:" URL.
const { createClient } = isRemote
  ? require('@libsql/client/web')
  : require('@libsql/client');

let url;
if (isRemote) {
  url = process.env.TURSO_DATABASE_URL;
} else {
  const dbFile = path.resolve(ROOT, process.env.DB_FILE || './database/pos.db');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  url = `file:${dbFile.replace(/\\/g, '/')}`;
}

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

/** libSQL returns some numeric fields (lastInsertRowid, COUNT(*)...) as BigInt. Normalize to Number. */
function unwrap(v) {
  return typeof v === 'bigint' ? Number(v) : v;
}
function unwrapRow(row) {
  if (!row) return row;
  const out = {};
  for (const k of Object.keys(row)) out[k] = unwrap(row[k]);
  return out;
}

/** Apply schema (idempotent - uses IF NOT EXISTS everywhere). */
async function migrate() {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  await client.executeMultiple(sql);
}

/** True when the core tables have no rows yet. */
async function isEmpty() {
  const r = await client.execute('SELECT COUNT(*) AS n FROM users');
  return unwrap(r.rows[0].n) === 0;
}

const asArgs = (p) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);

async function query(sql, params) {
  const r = await client.execute({ sql, args: asArgs(params) });
  return r.rows.map(unwrapRow);
}
async function get(sql, params) {
  const r = await client.execute({ sql, args: asArgs(params) });
  return r.rows[0] ? unwrapRow(r.rows[0]) : undefined;
}
/** INSERT/UPDATE/DELETE - returns { changes, lastInsertRowid } (both plain numbers). */
async function run(sql, params) {
  const r = await client.execute({ sql, args: asArgs(params) });
  return { changes: unwrap(r.rowsAffected), lastInsertRowid: unwrap(r.lastInsertRowid) };
}

/**
 * Run fn(t) inside a real transaction, where `t` exposes the same
 * query/get/run shape but scoped to that transaction. Commits on success,
 * rolls back on any thrown error.
 */
async function tx(fn) {
  const t = await client.transaction('write');
  try {
    const scoped = {
      query: async (sql, params) => (await t.execute({ sql, args: asArgs(params) })).rows.map(unwrapRow),
      get: async (sql, params) => {
        const r = await t.execute({ sql, args: asArgs(params) });
        return r.rows[0] ? unwrapRow(r.rows[0]) : undefined;
      },
      run: async (sql, params) => {
        const r = await t.execute({ sql, args: asArgs(params) });
        return { changes: unwrap(r.rowsAffected), lastInsertRowid: unwrap(r.lastInsertRowid) };
      },
    };
    const result = await fn(scoped);
    await t.commit();
    return result;
  } catch (err) {
    try { await t.rollback(); } catch { /* connection may already be closed */ }
    throw err;
  }
}

module.exports = { client, migrate, isEmpty, query, get, run, tx, isRemote };
