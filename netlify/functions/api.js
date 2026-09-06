'use strict';

/**
 * Netlify Functions entrypoint. netlify.toml redirects `/api/*` here; every
 * request is handed to the same Express app that src/server.js runs locally.
 *
 * Netlify invokes this function at `/.netlify/functions/api/<rest>` - we
 * rewrite the path back to `/api/<rest>` so the Express routes match.
 *
 * Everything is wrapped so that ANY failure (a missing bundled dependency, a
 * config error, a DB outage) comes back as a readable JSON body the login
 * screen can display - never a bare 502.
 */
const FN_PREFIX = '/.netlify/functions/api';

function jsonError(status, message) {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: message }) };
}

let serverless, app, ensureReady, wrapped, loadError;
try {
  serverless = require('serverless-http');
  ({ app, ensureReady } = require('../../src/app'));
  wrapped = serverless(app);
} catch (err) {
  loadError = err;
}

exports.handler = async (event, context) => {
  if (loadError) return jsonError(500, `Function failed to load: ${loadError.message || loadError}`);

  try {
    await ensureReady();
  } catch (err) {
    return jsonError(503, `Server not ready: ${err && err.message ? err.message : err}`);
  }

  if (typeof event.path === 'string' && event.path.startsWith(FN_PREFIX)) {
    const rest = event.path.slice(FN_PREFIX.length);
    event.path = '/api' + (rest.startsWith('/') ? rest : `/${rest}`);
  }
  if (typeof event.rawUrl === 'string') {
    event.rawUrl = event.rawUrl.replace(FN_PREFIX, '/api');
  }

  try {
    return await wrapped(event, context);
  } catch (err) {
    return jsonError(500, `Request failed: ${err && err.message ? err.message : err}`);
  }
};
