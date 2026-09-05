'use strict';

const express = require('express');
const { authRequired, requireRole } = require('../auth');
const sync = require('../services/sync');

const router = express.Router();
router.use(authRequired);

// GET /api/sync/status
router.get('/status', (req, res) => res.json(sync.status()));

// POST /api/sync/run  - "Sync now" button (admin only)
router.post('/run', requireRole('admin'), async (req, res) => {
  const result = await sync.runSync();
  res.json({ ...result, ...sync.status() });
});

module.exports = router;
