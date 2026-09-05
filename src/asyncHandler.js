'use strict';

/**
 * Express 4 doesn't catch rejected promises from async route handlers on its
 * own - wrap every async handler with this so a thrown/rejected error reaches
 * the error-handling middleware instead of hanging the request.
 */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
