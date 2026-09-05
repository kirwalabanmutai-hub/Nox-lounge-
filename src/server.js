'use strict';

require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { migrate, isEmpty } = require('./db');

// --- bootstrap database -------------------------------------------------
migrate();
if (isEmpty()) {
  console.log('Empty database detected - seeding demo data...');
  require('./seed');
}

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('\n  Liquor POS is running');
  console.log(`  ->  http://localhost:${PORT}\n`);
  console.log('  Default logins:  admin / admin123   ·   cashier / cashier123\n');

  const sync = require('./services/sync');
  if (sync.isConfigured()) {
    sync.startScheduler(process.env.SYNC_INTERVAL_SECONDS);
    console.log('  Cloud sync: enabled - pushing new sales in the background.\n');
  } else {
    console.log('  Cloud sync: off (set SYNC_WEBHOOK_URL in .env to enable - see INSTALL.md).\n');
  }
});
