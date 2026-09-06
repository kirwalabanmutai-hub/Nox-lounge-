'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { get, run } = require('../db');
const { signToken, authRequired } = require('../auth');
const ah = require('../asyncHandler');

const router = express.Router();

/** "admin" tab covers admin + manager accounts; "cashier" tab covers only cashier. */
function roleMatchesTab(actualRole, tab) {
  if (!tab) return true;
  return tab === 'admin' ? actualRole === 'admin' || actualRole === 'manager' : actualRole === tab;
}

// POST /api/auth/login
router.post('/login', ah(async (req, res) => {
  const { username, password, expected_role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const user = await get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username.trim()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!roleMatchesTab(user.role, expected_role)) {
    return res.status(403).json({
      error: `That account is a ${user.role} account — switch to the ${user.role === 'cashier' ? 'Cashier' : 'Admin'} tab.`,
    });
  }
  await run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [user.id]);
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  });
}));

/**
 * POST /api/auth/register  - self-service account creation from the login screen.
 * - "cashier" accounts can always be created this way (staff onboarding).
 * - "admin" can only be self-created while NO admin/manager account exists yet
 *   (first-run bootstrap) - after that, new admins must be added by an admin
 *   (npm run adduser, or a future Users screen), not from the public login page.
 */
router.post('/register', ah(async (req, res) => {
  const { name, username, password, role } = req.body || {};
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'name, username and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const wantRole = role === 'admin' ? 'admin' : 'cashier';

  if (wantRole === 'admin') {
    const existingAdmin = await get("SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = 1");
    if (existingAdmin) {
      return res.status(403).json({
        error: 'An admin account already exists. Ask your admin to create your login instead.',
      });
    }
  }

  const taken = await get('SELECT id FROM users WHERE username = ?', [username.trim()]);
  if (taken) return res.status(409).json({ error: 'That username is already taken' });

  const hash = bcrypt.hashSync(password, 10);
  const info = await run(
    'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)',
    [name.trim(), username.trim(), hash, wantRole]
  );
  const user = { id: info.lastInsertRowid, name: name.trim(), username: username.trim(), role: wantRole };
  res.status(201).json({ token: signToken(user), user });
}));

// GET /api/auth/me
router.get('/me', authRequired, ah(async (req, res) => {
  const user = await get('SELECT id, name, username, email, role, last_login_at FROM users WHERE id = ?', [req.user.sub]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}));

module.exports = router;
