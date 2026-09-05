'use strict';

const express = require('express');
const { query, get, run, tx } = require('../db');
const { authRequired, requireRole } = require('../auth');

const router = express.Router();
router.use(authRequired);

// GET /api/inventory/transactions  - recent stock movements
router.get('/transactions', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = query(
    `SELECT it.*, p.name AS product_name, u.name AS user_name
     FROM inventory_transactions it
     JOIN products p ON p.id = it.product_id
     JOIN users u ON u.id = it.user_id
     ORDER BY it.id DESC LIMIT ?`,
    [limit]
  );
  res.json(rows);
});

// GET /api/inventory/low-stock
router.get('/low-stock', (req, res) => {
  res.json(query(
    `SELECT id, name, brand, size, stock_quantity, reorder_level, selling_price
     FROM products
     WHERE is_active = 1 AND stock_quantity <= reorder_level
     ORDER BY stock_quantity ASC`
  ));
});

// POST /api/inventory/adjust  - stock_in / damage / adjustment / return
router.post('/adjust', requireRole('admin', 'manager'), (req, res) => {
  const { product_id, transaction_type, quantity, notes } = req.body || {};
  const types = ['stock_in', 'return', 'damage', 'adjustment'];
  if (!product_id || !types.includes(transaction_type) || quantity === undefined) {
    return res.status(400).json({ error: `product_id, quantity and transaction_type (${types.join('|')}) are required` });
  }
  const product = get('SELECT * FROM products WHERE id = ? AND is_active = 1', [Number(product_id)]);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty === 0) {
    return res.status(400).json({ error: 'quantity must be a non-zero number' });
  }
  // stock_in / return add; damage subtracts; adjustment sets delta directly (can be +/-)
  let delta;
  if (transaction_type === 'damage') delta = -Math.abs(qty);
  else if (transaction_type === 'adjustment') delta = qty;
  else delta = Math.abs(qty);

  const before = product.stock_quantity;
  const after = before + delta;
  if (after < 0) return res.status(422).json({ error: 'Resulting stock cannot be negative' });

  const result = tx(() => {
    run(
      `INSERT INTO inventory_transactions
         (product_id, user_id, transaction_type, quantity_change, stock_before, stock_after, reference_type, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)`,
      [product.id, req.user.sub, transaction_type, delta, before, after, notes || null]
    );
    return get('SELECT * FROM products WHERE id = ?', [product.id]);
  });
  res.status(201).json(result);
});

module.exports = router;
