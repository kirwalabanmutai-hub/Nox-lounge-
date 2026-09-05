'use strict';

/**
 * Builds the Express app. Shared by:
 *   - src/server.js  -> `npm start` on the till PC (calls app.listen)
 *   - api/index.js   -> Vercel serverless entrypoint (no listen; Vercel
 *                       invokes the exported handler per request instead)
 *
 * Same routes, same static frontend, same behaviour either way - only the
 * database target changes (local file vs. remote Turso), via src/db.js.
 */

require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { migrate, isEmpty } = require('./db');
const seed = require('./seed');
const sync = require('./services/sync');

const app = express();
app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// --- API --------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api', require('./routes/catalog.routes'));
app.use('/api/inventory', require('./routes/inventory.routes'));
app.use('/api/sales', require('./routes/sales.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/mpesa', require('./routes/mpesa.routes'));
app.use('/api/sync', require('./routes/sync.routes'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// --- static SPA ------------------------------------------------------
const publicDir = path.resolve(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// --- error handler --------------------------------------------------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Migrate + seed-if-empty, memoized so it only runs once per process
 * (important on serverless, where this module can be invoked concurrently
 * on a cold start - every request awaits the same in-flight promise
 * instead of racing to create the schema/seed data twice).
 */
let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await migrate();
      if (await isEmpty()) {
        console.log('Empty database detected - seeding demo data...');
        await seed();
      }
    })();
  }
  return readyPromise;
}

module.exports = { app, ensureReady, sync };
