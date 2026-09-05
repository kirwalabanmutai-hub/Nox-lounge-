'use strict';

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, name: user.name },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

/** Require a valid Bearer token. Attaches req.user. */
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/** Restrict a route to specific roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { signToken, authRequired, requireRole, SECRET };
