'use strict';

/**
 * Vercel serverless entrypoint. vercel.json rewrites every request here, so
 * this one function serves both the API and the static frontend, exactly
 * like src/server.js does locally - just without a persistent process.
 */
const { app, ensureReady } = require('../src/app');

module.exports = async (req, res) => {
  await ensureReady();
  return app(req, res);
};
