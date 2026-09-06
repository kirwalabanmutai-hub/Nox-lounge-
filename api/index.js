'use strict';

/**
 * Vercel serverless entrypoint. vercel.json rewrites every request here.
 * Wrapped so any load/config/DB failure returns readable JSON, not a bare 502.
 */
let app, ensureReady, loadError;
try {
  ({ app, ensureReady } = require('../src/app'));
} catch (err) {
  loadError = err;
}

function fail(res, status, message) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

module.exports = async (req, res) => {
  if (loadError) return fail(res, 500, `Function failed to load: ${loadError.message || loadError}`);
  try {
    await ensureReady();
  } catch (err) {
    return fail(res, 503, `Server not ready: ${err && err.message ? err.message : err}`);
  }
  return app(req, res);
};
