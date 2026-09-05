'use strict';

/**
 * Offline-first cloud sync.
 *
 *   ONLINE  -> push newly-completed sales to a remote webhook (a free
 *              Google Sheet, by default - see INSTALL.md)
 *   OFFLINE -> nothing to do; sales are already safe in the local database
 *              (every sale is written there first, always - this module
 *              only ever reads what's already committed)
 *   LATER   -> the next scheduled tick / next sale / "Sync now" retries
 *              from wherever it left off, using sync_state.last_synced_sale_id
 *              as a durable cursor - nothing is ever lost or duplicated.
 *
 * Disabled entirely (no attempts, no errors) unless SYNC_WEBHOOK_URL is set.
 *
 * On a till PC (npm start) a background timer also runs this periodically.
 * On serverless (Vercel etc.) there is no persistent process for a timer to
 * live in, so runSync() is instead triggered from sales.routes.js right
 * after each checkout - see the caller for why it's awaited, not fired off.
 */

const { get, query, run } = require('../db');

const WEBHOOK_URL = process.env.SYNC_WEBHOOK_URL || '';
const WEBHOOK_TOKEN = process.env.SYNC_WEBHOOK_TOKEN || '';
const BATCH_SIZE = Number(process.env.SYNC_BATCH_SIZE) || 25;
const TIMEOUT_MS = 10000;

function isConfigured() {
  return Boolean(WEBHOOK_URL);
}

async function getState() {
  return (await get('SELECT * FROM sync_state WHERE id = 1')) || { last_synced_sale_id: 0, last_status: 'never' };
}

async function pendingCount(sinceId) {
  const r = await get(
    "SELECT COUNT(*) AS n FROM sales WHERE id > ? AND sale_status = 'completed'",
    [sinceId]
  );
  return r.n;
}

async function status() {
  const s = await getState();
  return {
    configured: isConfigured(),
    last_synced_sale_id: s.last_synced_sale_id,
    last_synced_at: s.last_synced_at,
    last_attempt_at: s.last_attempt_at,
    last_status: s.last_status,
    last_error: s.last_error,
    pending: await pendingCount(s.last_synced_sale_id),
  };
}

let running = false;

/** Push up to BATCH_SIZE unsynced sales. Safe to call any time (manual "Sync now", the scheduler, or after a sale). */
async function runSync() {
  if (!isConfigured()) return { status: 'not_configured' };
  if (running) return { status: 'busy' };
  running = true;
  try {
    const state = await getState();
    const rows = await query(
      `SELECT s.id, s.receipt_number, s.created_at, s.subtotal, s.discount, s.tax,
              s.total_amount, s.amount_paid, s.payment_status, s.sale_status,
              u.name AS cashier_name,
              (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count,
              (SELECT GROUP_CONCAT(DISTINCT payment_method) FROM payments p WHERE p.sale_id = s.id) AS payment_methods
       FROM sales s JOIN users u ON u.id = s.user_id
       WHERE s.id > ? AND s.sale_status = 'completed'
       ORDER BY s.id ASC LIMIT ?`,
      [state.last_synced_sale_id, BATCH_SIZE]
    );

    if (rows.length === 0) {
      await run(`UPDATE sync_state SET last_attempt_at = datetime('now'), last_status = 'ok', last_error = NULL WHERE id = 1`);
      return { status: 'ok', pushed: 0 };
    }

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: WEBHOOK_TOKEN, source: 'nox-lounge-pos', sales: rows }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Webhook returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }

    const maxId = rows[rows.length - 1].id;
    await run(
      `UPDATE sync_state
         SET last_synced_sale_id = ?, last_synced_at = datetime('now'),
             last_attempt_at = datetime('now'), last_status = 'ok', last_error = NULL
       WHERE id = 1`,
      [maxId]
    );
    return { status: 'ok', pushed: rows.length };
  } catch (err) {
    // Network failure / timeout usually means "no internet right now" - not a real error,
    // just try again on the next tick. Distinguish it from a genuine webhook rejection.
    const offline = err.name === 'TimeoutError' || err.name === 'AbortError' ||
      /fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(err.message || '');
    await run(
      `UPDATE sync_state SET last_attempt_at = datetime('now'), last_status = ?, last_error = ? WHERE id = 1`,
      [offline ? 'offline' : 'error', String(err.message || err).slice(0, 255)]
    ).catch(() => {}); // best-effort: don't let a status-write failure mask the original error
    return { status: offline ? 'offline' : 'error', error: err.message };
  } finally {
    running = false;
  }
}

let timer = null;
/** Only meaningful on a long-running process (the till PC). No-op on serverless. */
function startScheduler(intervalSeconds) {
  if (timer || !isConfigured() || process.env.VERCEL) return;
  const ms = Math.max(15, Number(intervalSeconds) || 60) * 1000;
  timer = setInterval(() => { runSync().catch(() => {}); }, ms);
  timer.unref?.(); // don't keep the process alive just for this
  runSync().catch(() => {}); // try once immediately at boot
}

module.exports = { isConfigured, status, runSync, startScheduler };
