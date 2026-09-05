'use strict';

const { app, ensureReady, sync } = require('./app');

const PORT = process.env.PORT || 4000;

ensureReady()
  .then(() => {
    app.listen(PORT, () => {
      console.log('\n  Liquor POS is running');
      console.log(`  ->  http://localhost:${PORT}\n`);
      console.log('  Default logins:  admin / admin123   ·   cashier / cashier123\n');

      if (sync.isConfigured()) {
        sync.startScheduler(process.env.SYNC_INTERVAL_SECONDS);
        console.log('  Cloud sync: enabled - pushing new sales in the background.\n');
      } else {
        console.log('  Cloud sync: off (set SYNC_WEBHOOK_URL in .env to enable - see INSTALL.md).\n');
      }
    });
  })
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
