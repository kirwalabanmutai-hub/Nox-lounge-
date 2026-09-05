'use strict';

const express = require('express');
const { query, get, run, tx } = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

function receiptNumber() {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, '');
  // ms-of-day + 2 random digits -> effectively collision-free for a single store
  const seq = (d.getUTCHours() * 3600000 + d.getUTCMinutes() * 60000 +
               d.getUTCSeconds() * 1000 + d.getUTCMilliseconds()).toString().padStart(8, '0');
  const rand = Math.floor(10 + Math.random() * 90);
  return `RCP-${stamp}-${seq}${rand}`;
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// GET /api/sales  - list with filters
router.get('/', (req, res) => {
  const { from, to, user_id, limit } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('s.created_at >= ?'); params.push(from); }
  if (to) { where.push('s.created_at <= ?'); params.push(`${to} 23:59:59`); }
  if (user_id) { where.push('s.user_id = ?'); params.push(Number(user_id)); }
  const sql = `
    SELECT s.*, u.name AS cashier_name,
           (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
    FROM sales s JOIN users u ON u.id = s.user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY s.id DESC LIMIT ?`;
  params.push(Math.min(Number(limit) || 50, 200));
  res.json(query(sql, params));
});

// GET /api/sales/:id  - full receipt
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const sale = get(
    `SELECT s.*, u.name AS cashier_name FROM sales s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [id]
  );
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  sale.items = query('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [id]);
  sale.payments = query('SELECT * FROM payments WHERE sale_id = ? ORDER BY id', [id]);
  res.json(sale);
});

/**
 * POST /api/sales  - create a completed sale (checkout)
 * body: {
 *   customer_name?, discount?, note?,
 *   items: [{ product_id, quantity, discount? }],
 *   payments: [{ payment_method, amount, amount_received?, transaction_reference?, mpesa_phone? }]
 * }
 */
router.post('/', (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required' });
  }

  const settings = get('SELECT * FROM business_settings WHERE id = 1') || { tax_enabled: 0, tax_rate: 0 };

  try {
    const out = tx(() => {
      let subtotal = 0;
      const lines = [];

      for (const raw of b.items) {
        const pid = Number(raw.product_id);
        const qty = Number(raw.quantity);
        if (!pid || !(qty > 0)) throw httpError(400, 'Each item needs product_id and quantity > 0');

        const product = get('SELECT * FROM products WHERE id = ? AND is_active = 1', [pid]);
        if (!product) throw httpError(404, `Product ${pid} not found`);
        if (product.stock_quantity < qty) {
          throw httpError(422, `Insufficient stock for ${product.name} (have ${product.stock_quantity}, need ${qty})`);
        }
        const lineDiscount = round2(Number(raw.discount) || 0);
        const lineTotal = round2(product.selling_price * qty - lineDiscount);
        subtotal += lineTotal;
        lines.push({ product, qty, lineDiscount, lineTotal });
      }

      subtotal = round2(subtotal);
      const discount = round2(Number(b.discount) || 0);
      const taxable = Math.max(subtotal - discount, 0);
      const tax = settings.tax_enabled ? round2(taxable * (settings.tax_rate / 100)) : 0;
      const total = round2(taxable + tax);

      const methods = ['cash', 'mpesa', 'card', 'bank', 'credit'];
      const payments = Array.isArray(b.payments) ? b.payments : [];
      for (const p of payments) {
        if (p.payment_method && !methods.includes(p.payment_method)) {
          throw httpError(400, `Invalid payment method "${p.payment_method}"`);
        }
      }
      const amountPaid = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
      const changeDue = round2(Math.max(amountPaid - total, 0));
      let paymentStatus = 'pending';
      if (amountPaid >= total && total > 0) paymentStatus = 'paid';
      else if (amountPaid > 0) paymentStatus = 'partial';

      const receipt = receiptNumber();
      const saleInfo = run(
        `INSERT INTO sales
           (receipt_number, user_id, customer_name, subtotal, discount, tax,
            total_amount, amount_paid, change_due, payment_status, sale_status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
        [receipt, req.user.sub, b.customer_name || null, subtotal, discount, tax,
          total, amountPaid, changeDue, paymentStatus, b.note || null]
      );
      const saleId = saleInfo.lastInsertRowid;

      for (const { product, qty, lineDiscount, lineTotal } of lines) {
        run(
          `INSERT INTO sale_items
             (sale_id, product_id, product_name, product_size, unit_price, unit_cost, quantity, discount, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [saleId, product.id, product.name, product.size, product.selling_price,
            product.buying_price, qty, lineDiscount, lineTotal]
        );
        const before = product.stock_quantity;
        const after = round2(before - qty);
        run(
          `INSERT INTO inventory_transactions
             (product_id, user_id, transaction_type, quantity_change, stock_before, stock_after, reference_type, reference_id, notes)
           VALUES (?, ?, 'sale', ?, ?, ?, 'sale', ?, ?)`,
          [product.id, req.user.sub, -qty, before, after, saleId, `Receipt ${receipt}`]
        );
      }

      for (const p of payments) {
        const amt = Number(p.amount) || 0;
        run(
          `INSERT INTO payments
             (sale_id, payment_method, amount, amount_received, change_amount,
              transaction_reference, mpesa_phone, payment_status, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', datetime('now'))`,
          [saleId, p.payment_method || 'cash', amt,
            p.amount_received != null ? Number(p.amount_received) : null,
            Number(p.change_amount) || 0,
            p.transaction_reference || null, p.mpesa_phone || null]
        );
      }

      run(
        `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
         VALUES (?, 'sale.create', 'sales', ?, ?)`,
        [req.user.sub, saleId, JSON.stringify({ receipt, total })]
      );

      return saleId;
    });

    const sale = get('SELECT * FROM sales WHERE id = ?', [out]);
    sale.items = query('SELECT * FROM sale_items WHERE sale_id = ?', [out]);
    sale.payments = query('SELECT * FROM payments WHERE sale_id = ?', [out]);
    res.status(201).json(sale);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to record sale' });
  }
});

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = router;
