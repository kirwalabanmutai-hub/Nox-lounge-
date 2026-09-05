'use strict';

/**
 * Add or update a staff account without wiping the database.
 *
 *   node src/adduser.js <username> <password> [role] [full name]
 *
 * role defaults to "cashier" (admin | manager | cashier).
 * If the username already exists its password / role / name are updated.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { get, run } = require('./db');

const [, , username, password, role = 'cashier', ...nameParts] = process.argv;

if (!username || !password) {
  console.error('Usage: node src/adduser.js <username> <password> [role] [full name]');
  process.exit(1);
}
if (!['admin', 'manager', 'cashier'].includes(role)) {
  console.error(`Invalid role "${role}" - use admin | manager | cashier`);
  process.exit(1);
}

const name = nameParts.join(' ') || username;
const hash = bcrypt.hashSync(password, 10);
const existing = get('SELECT id FROM users WHERE username = ?', [username]);

if (existing) {
  run(
    `UPDATE users SET name = ?, password_hash = ?, role = ?, is_active = 1,
                      updated_at = datetime('now') WHERE username = ?`,
    [name, hash, role, username]
  );
  console.log(`Updated "${username}" (role: ${role}).`);
} else {
  run(
    'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, username, hash, role]
  );
  console.log(`Created "${username}" (role: ${role}).`);
}
