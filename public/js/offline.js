/* ============================================================
   Offline support for the hosted (cloud) copy of the app.
   - Keeps a local snapshot of products/categories/settings so the Sell
     screen still has something to show with no connection.
   - Queues a sale locally when it can't reach the server, and flushes the
     queue automatically once the connection is back - nothing is lost,
     nothing is double-charged (each queued item is only ever sent once).
   ============================================================ */

const OfflineStore = {
  _get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  _set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage full/disabled - degrade silently */ } },

  cacheProducts(list) { this._set('pos_cache_products', list); },
  cacheCategories(list) { this._set('pos_cache_categories', list); },
  cacheSettings(s) { this._set('pos_cache_settings', s); },
  getProducts() { return this._get('pos_cache_products', []); },
  getCategories() { return this._get('pos_cache_categories', []); },
  getSettings() { return this._get('pos_cache_settings', null); },

  getQueue() { return this._get('pos_pending_sales', []); },
  setQueue(q) { this._set('pos_pending_sales', q); },
  queueCount() { return this.getQueue().length; },

  /** Save a sale payload to retry later. Returns a local-only id for the receipt. */
  queueSale(payload) {
    const q = this.getQueue();
    const localId = `OFFLINE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    q.push({ localId, payload, queuedAt: new Date().toISOString() });
    this.setQueue(q);
    return localId;
  },
  removeFromQueue(localId) {
    this.setQueue(this.getQueue().filter((x) => x.localId !== localId));
  },

  /** Optimistically reduce cached stock after an offline sale, so the Sell
   *  screen doesn't let the same last unit be sold twice before this
   *  device is back online and gets the real numbers. */
  applyLocalStock(items) {
    const products = this.getProducts();
    for (const it of items) {
      const p = products.find((x) => x.id === it.product_id);
      if (p) p.stock_quantity = Math.max(0, (p.stock_quantity || 0) - it.quantity);
    }
    this.cacheProducts(products);
  },
};

/** Build a receipt-shaped object from a queued payload, using cached prices - for display only until it syncs. */
function buildOfflineSale(localId, payload, payment) {
  const settings = OfflineStore.getSettings() || {};
  const products = OfflineStore.getProducts();
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const items = payload.items.map((it) => {
    const p = products.find((x) => x.id === it.product_id) || {};
    const lineTotal = round2((p.selling_price || 0) * it.quantity);
    return {
      product_name: p.name || `Product #${it.product_id}`, product_size: p.size || '',
      quantity: it.quantity, unit_price: p.selling_price || 0, line_total: lineTotal,
    };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.line_total, 0));
  const discount = round2(payload.discount || 0);
  const taxable = Math.max(subtotal - discount, 0);
  const tax = settings.tax_enabled ? round2(taxable * (Number(settings.tax_rate) || 0) / 100) : 0;
  const total = round2(taxable + tax);

  return {
    id: null,
    receipt_number: localId,
    created_at: new Date().toISOString(),
    cashier_name: (typeof API !== 'undefined' && API.user && API.user.name) || '',
    subtotal, discount, tax, total_amount: total,
    amount_paid: payment.amount, change_due: Math.max((payment.amount_received || 0) - total, 0),
    items, payments: [payment],
    _offline: true,
  };
}

/** Try to send every queued sale, in order. Stops at the first failure and retries later. */
let _flushing = false;
async function flushOfflineQueue() {
  if (_flushing || typeof API === 'undefined') return;
  const queue = OfflineStore.getQueue();
  if (!queue.length) return;
  _flushing = true;
  try {
    for (const item of queue) {
      try {
        const sale = await API.post('/sales', item.payload);
        OfflineStore.removeFromQueue(item.localId);
        if (typeof toast === 'function') toast(`Synced offline sale as ${sale.receipt_number}`, 'success');
        if (typeof refreshQueueBadge === 'function') refreshQueueBadge();
        if (typeof route === 'function' && location.hash === '#sell') route();
      } catch (err) {
        break; // still offline, or a real rejection (e.g. now out of stock) - leave it queued, try again later
      }
    }
  } finally {
    _flushing = false;
  }
}

window.addEventListener('online', () => flushOfflineQueue());
setInterval(() => { if (navigator.onLine) flushOfflineQueue(); }, 30000);
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support just won't be available */ });
  }
  if (navigator.onLine) flushOfflineQueue();
});
