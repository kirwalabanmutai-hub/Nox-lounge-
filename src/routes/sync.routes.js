'use strict';

const express = require('express');
const { authRequired, requireRole } = require('../auth');
const sync = require('../services/sync');
const ah = require('../asyncHandler');

const router = express.Router();
router.use(authRequired);

// GET /api/sync/status
router.get('/status', ah(async (req, res) => res.json(await sync.status())));

// POST /api/sync/run  - "Sync now" button (admin only)
router.post('/run', requireRole('admin'), ah(async (req, res) => {
  const result = await sync.runSync();
  res.json({ ...result, ...(await sync.status()) });
}));

module.exports = router;
