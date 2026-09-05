'use strict';

const express = require('express');
const { get, run } = require('../db');
const { authRequired, requireRole } = require('../auth');
const ah = require('../asyncHandler');

const router = express.Router();
router.use(authRequired);

router.get('/', ah(async (req, res) => {
  res.json(await get('SELECT * FROM business_settings WHERE id = 1'));
}));

router.put('/', requireRole('admin'), ah(async (req, res) => {
  const b = req.body || {};
  const fields = ['business_name', 'phone', 'email', 'address', 'kra_pin',
    'receipt_footer', 'currency', 'tax_enabled', 'tax_rate', 'low_stock_alert'];
  const flags = ['tax_enabled', 'low_stock_alert'];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (b[f] === undefined) continue;
    let val = b[f];
    if (flags.includes(f)) val = val ? 1 : 0;                 // accept true/false/1/0
    else if (f === 'tax_rate') val = Number(val) || 0;
    else if (typeof val === 'boolean') val = val ? 1 : 0;     // the DB driver rejects raw booleans
    sets.push(`${f} = ?`);
    params.push(val);
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  await run(`UPDATE business_settings SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = 1`, params);
  res.json(await get('SELECT * FROM business_settings WHERE id = 1'));
}));

module.exports = router;
