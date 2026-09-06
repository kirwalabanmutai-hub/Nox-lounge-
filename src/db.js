'use strict';

/**
 * Database connection - one driver, two destinations:
 *
 *   - No TURSO_DATABASE_URL set  -> a local SQLite file (till PC / npm start).
 *     Fully offline: no network involved at all.
 *   - TURSO_DATABASE_URL set     -> a remote Turso (libSQL) database over HTTPS.
 *     This is what a serverless deploy (Netlify / Vercel) uses, since a
 *     function has no persistent local disk.
 *
 * Same schema, same SQL dialect, same query API either way - callers `await`.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_FILE = path.resolve(ROOT, 'database/schema.sqlite.sql');
const isRemote = Boolean(process.env.TURSO_DATABASE_URL);
const isServerless = Boolean(
  process.env.NETLIFY || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT
);

// Misconfiguration: serverless with no cloud DB. Don't throw at import time
// (that would fail the whole function module before anything can report why) -
// stand up a stub whose first use throws a readable message that the request
// wrappers turn into a 503 JSON response.
const MISCONFIGURED = isServerless && !isRemote;
const CONFIG_HINT =
  'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set on this deploy ' +
  '(a serverless function has no writable disk for a local database). See DEPLOY.md.';

let client;
if (MISCONFIGURED) {
  const boom = () => { throw new Error(CONFIG_HINT); };
  client = { execute: boom, executeMultiple: boom, batch: boom, transaction: boom, close() {} };
} else {
  // Remote -> the pure-HTTP "web" client: no native binary, bundles cleanly
  // into a function. Local -> the default client, which can open a "file:" URL.
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
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
}

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

/**
 * Split a schema file into individual statements, keeping `CREATE TRIGGER ...
 * BEGIN ... END;` blocks whole (a naive ";" split would cut the trigger body).
 */
function splitStatements(sql) {
  const lines = sql.replace(/^\s*--.*$/gm, '').split('\n');
  const out = [];
  let buf = '';
  let inTrigger = false;
  for (const line of lines) {
    if (!line.trim() && !buf.trim()) continue;
    buf += line + '\n';
    if (/create\s+trigger/i.test(line)) inTrigger = true;
    if (inTrigger) {
      if (/^\s*end\s*;\s*$/i.test(line)) { out.push(buf.trim()); buf = ''; inTrigger = false; }
    } else if (line.trim().endsWith(';')) {
      out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => s && !/^;+$/.test(s) && !/^pragma\s/i.test(s));
}

/** Apply schema. Idempotent (IF NOT EXISTS everywhere). One round trip on remote. */
async function migrate() {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  await client.batch(splitStatements(sql), 'write');
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

/** Run an array of {sql, args} writes atomically in a single round trip. */
async function batch(statements) {
  await client.batch(statements.map((s) => (typeof s === 'string' ? s : { sql: s.sql, args: asArgs(s.args) })), 'write');
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

module.exports = { client, migrate, isEmpty, query, get, run, batch, tx, isRemote, isServerless };
