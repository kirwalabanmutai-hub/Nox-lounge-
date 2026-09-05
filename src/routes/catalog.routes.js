'use strict';

const express = require('express');
const { query, get, run } = require('../db');
const { authRequired, requireRole } = require('../auth');
const ah = require('../asyncHandler');

const router = express.Router();
router.use(authRequired);

const manager = requireRole('admin', 'manager');

/* ------------------------------- CATEGORIES ------------------------------ */
router.get('/categories', ah(async (req, res) => {
  res.json(await query('SELECT * FROM categories WHERE is_active = 1 ORDER BY name'));
}));

router.post('/categories', manager, ah(async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const info = await run('INSERT INTO categories (name, description) VALUES (?, ?)', [name.trim(), description || null]);
    res.status(201).json(await get('SELECT * FROM categories WHERE id = ?', [info.lastInsertRowid]));
  } catch (e) {
    res.status(409).json({ error: 'Category already exists' });
  }
}));

/* ------------------------------- SUPPLIERS ------------------------------- */
router.get('/suppliers', ah(async (req, res) => {
  res.json(await query('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name'));
}));

router.post('/suppliers', manager, ah(async (req, res) => {
  const { name, contact_person, phone, email, address, kra_pin } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = await run(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, kra_pin)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name.trim(), contact_person || null, phone || null, email || null, address || null, kra_pin || null]
  );
  res.status(201).json(await get('SELECT * FROM suppliers WHERE id = ?', [info.lastInsertRowid]));
}));

/* -------------------------------- PRODUCTS ------------------------------- */
const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name, s.name AS supplier_name,
         (p.stock_quantity <= p.reorder_level) AS is_low_stock,
         (p.selling_price - p.buying_price)    AS unit_margin
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id`;

router.get('/products', ah(async (req, res) => {
  const { search, category_id, low_stock } = req.query;
  const where = ['p.is_active = 1'];
  const params = [];
  if (search) {
    where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.barcode = ? OR p.sku = ?)');
    params.push(`%${search}%`, `%${search}%`, search, search);
  }
  if (category_id) { where.push('p.category_id = ?'); params.push(Number(category_id)); }
  if (low_stock === 'true') where.push('p.stock_quantity <= p.reorder_level');

  const sql = `${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.name`;
  res.json(await query(sql, params));
}));

router.get('/products/:id', ah(async (req, res) => {
  const product = await get(`${PRODUCT_SELECT} WHERE p.id = ?`, [Number(req.params.id)]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
}));

router.post('/products', manager, ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category_id) {
    return res.status(400).json({ error: 'name and category_id are required' });
  }
  try {
    const info = await run(
      `INSERT INTO products
         (category_id, supplier_id, sku, name, brand, size, barcode,
          buying_price, selling_price, stock_quantity, reorder_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(b.category_id), b.supplier_id ? Number(b.supplier_id) : null,
        b.sku || null, b.name.trim(), b.brand || null, b.size || null, b.barcode || null,
        Number(b.buying_price) || 0, Number(b.selling_price) || 0,
        Number(b.stock_quantity) || 0, Number(b.reorder_level) || 5,
      ]
    );
    const id = info.lastInsertRowid;
    if (Number(b.stock_quantity) > 0) {
      await run(
        `INSERT INTO inventory_transactions
           (product_id, user_id, transaction_type, quantity_change, stock_before, stock_after, notes)
         VALUES (?, ?, 'opening', ?, 0, ?, 'Initial stock on product creation')`,
        [id, req.user.sub, Number(b.stock_quantity), Number(b.stock_quantity)]
      );
    }
    res.status(201).json(await get(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]));
  } catch (e) {
    res.status(409).json({ error: 'Duplicate SKU or barcode' });
  }
}));

router.put('/products/:id', manager, ah(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get('SELECT * FROM products WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const b = req.body || {};
  const fields = ['category_id', 'supplier_id', 'sku', 'name', 'brand', 'size',
    'barcode', 'buying_price', 'selling_price', 'reorder_level'];
  const required = ['category_id', 'name']; // must never be set to null/empty
  const numeric = ['category_id', 'supplier_id', 'buying_price', 'selling_price', 'reorder_level'];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (b[f] === undefined) continue;
    let val = b[f] === '' ? null : b[f];
    if (val === null && required.includes(f)) {
      return res.status(400).json({ error: `${f} cannot be empty` });
    }
    if (val !== null && numeric.includes(f)) val = Number(val);
    sets.push(`${f} = ?`);
    params.push(val);
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  try {
    await run(`UPDATE products SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  } catch (e) {
    return res.status(409).json({ error: 'Duplicate SKU or barcode' });
  }
  res.json(await get(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]));
}));

router.delete('/products/:id', manager, ah(async (req, res) => {
  const id = Number(req.params.id);
  await run("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?", [id]);
  res.json({ ok: true });
}));

module.exports = router;
