'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { get, run } = require('../db');
const { signToken, authRequired } = require('../auth');
const ah = require('../asyncHandler');

const router = express.Router();

// POST /api/auth/login
router.post('/login', ah(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const user = await get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username.trim()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  await run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [user.id]);
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  });
}));

// GET /api/auth/me
router.get('/me', authRequired, ah(async (req, res) => {
  const user = await get('SELECT id, name, username, email, role, last_login_at FROM users WHERE id = ?', [req.user.sub]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}));

module.exports = router;
