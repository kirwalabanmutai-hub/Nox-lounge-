'use strict';

/**
 * Netlify Functions entrypoint. netlify.toml redirects `/api/*` here; every
 * request is handed to the same Express app that src/server.js runs locally.
 *
 * Netlify invokes this function at `/.netlify/functions/api/<rest>` - we
 * rewrite the path back to `/api/<rest>` so the Express routes (which are
 * defined as `/api/...`) match.
 */
const serverless = require('serverless-http');
const { app, ensureReady } = require('../../src/app');

const wrapped = serverless(app);
const FN_PREFIX = '/.netlify/functions/api';

exports.handler = async (event, context) => {
  await ensureReady();

  if (typeof event.path === 'string' && event.path.startsWith(FN_PREFIX)) {
    const rest = event.path.slice(FN_PREFIX.length);
    event.path = '/api' + (rest.startsWith('/') ? rest : `/${rest}`);
  }
  if (typeof event.rawUrl === 'string') {
    event.rawUrl = event.rawUrl.replace(FN_PREFIX, '/api');
  }

  return wrapped(event, context);
};
