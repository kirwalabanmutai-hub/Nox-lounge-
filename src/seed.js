'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, migrate, isEmpty, get, run, DB_FILE } = require('./db');

const RESET = process.argv.includes('--reset');
const FORCE = process.argv.includes('--force') || RESET;

function seed() {
  if (RESET) {
    console.log('Resetting all data...');
    const tables = [
      'payments', 'sale_items', 'sales', 'inventory_transactions',
      'purchase_items', 'purchases', 'expenses', 'audit_logs',
      'products', 'suppliers', 'categories', 'business_settings', 'users',
    ];
    db.exec('PRAGMA foreign_keys = OFF;');
    for (const t of tables) {
      try { db.exec(`DELETE FROM ${t}; DELETE FROM sqlite_sequence WHERE name='${t}';`); }
      catch { /* table may not exist yet */ }
    }
    db.exec('PRAGMA foreign_keys = ON;');
  }

  migrate();

  if (!isEmpty() && !FORCE) {
    console.log('Database already seeded. Use `npm run seed` to force or `npm run reset` to wipe.');
    return;
  }
  if (!isEmpty() && FORCE && !RESET) {
    console.log('Data present; skipping seed (use --reset to wipe first).');
    return;
  }

  console.log('Seeding demo data...');

  // ---- users -----------------------------------------------------------
  const users = [
    ['System Administrator', 'admin', 'admin@liquorpos.local', 'admin123', 'admin'],
    ['Jane Cashier', 'cashier', 'cashier@liquorpos.local', 'cashier123', 'cashier'],
  ];
  for (const [name, username, email, pw, role] of users) {
    run(
      `INSERT INTO users (name, username, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`,
      [name, username, email, bcrypt.hashSync(pw, 10), role]
    );
  }

  // ---- categories -----------------------------------------------------
  const categories = [
    ['Beer', 'Beer products'], ['Spirits', 'General spirits'], ['Vodka', 'Vodka products'],
    ['Whisky', 'Whisky products'], ['Gin', 'Gin products'], ['Rum', 'Rum products'],
    ['Brandy', 'Brandy products'], ['Wine', 'Wine products'], ['Cider', 'Cider products'],
    ['Other', 'Other alcoholic beverages'],
  ];
  for (const [name, description] of categories) {
    run('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description]);
  }

  // ---- settings -----------------------------------------------------
  run(
    `INSERT INTO business_settings
       (id, business_name, phone, address, currency, tax_enabled, tax_rate, receipt_footer)
     VALUES (1, ?, ?, ?, 'KES', 1, 16.00, ?)`,
    ['Nox Lounge', '0700 000 000', 'Eldoret, Kenya',
     'Thank you for shopping with us. Drink responsibly. 18+']
  );

  // ---- supplier -----------------------------------------------------
  run(
    `INSERT INTO suppliers (name, contact_person, phone, email, address)
     VALUES (?, ?, ?, ?, ?)`,
    ['Main Beverage Supplier', 'Peter K.', '0700 111 222', 'sales@mainbev.co.ke', 'Nairobi, Kenya']
  );

  // ---- products (+ opening stock ledger) --------------------------
  const products = [
    // cat, sku, name, brand, size, barcode, buy, sell, stock, reorder
    [3, 'VOD-SMR-750', 'Smirnoff Vodka', 'Smirnoff', '750ml', '100000000001', 900, 1200, 24, 5],
    [1, 'BEE-TSK-500', 'Tusker Lager', 'Tusker', '500ml', '100000000002', 160, 200, 60, 10],
    [5, 'GIN-GLB-750', 'Gilbeys Gin', 'Gilbeys', '750ml', '100000000003', 850, 1100, 18, 5],
    [3, 'VOD-CHR-750', 'Chrome Vodka', 'Chrome', '750ml', '100000000004', 700, 950, 32, 5],
    [4, 'WHK-JW-750', 'Johnnie Walker Red', 'Johnnie Walker', '750ml', '100000000005', 1800, 2400, 12, 4],
    [8, 'WIN-4TH-750', '4th Street Red', '4th Street', '750ml', '100000000006', 650, 900, 20, 6],
    [1, 'BEE-WHC-500', 'White Cap Lager', 'White Cap', '500ml', '100000000007', 160, 200, 48, 10],
    [6, 'RUM-CPT-750', 'Captain Morgan', 'Captain Morgan', '750ml', '100000000008', 1400, 1900, 9, 4],
  ];
  const insertProduct = db.prepare(
    `INSERT INTO products
       (category_id, supplier_id, sku, name, brand, size, barcode,
        buying_price, selling_price, stock_quantity, reorder_level)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLedger = db.prepare(
    `INSERT INTO inventory_transactions
       (product_id, user_id, transaction_type, quantity_change, stock_before, stock_after, notes)
     VALUES (?, 1, 'opening', ?, 0, ?, 'Opening balance')`
  );
  for (const [cat, sku, name, brand, size, barcode, buy, sell, stock, reorder] of products) {
    const info = insertProduct.run(cat, sku, name, brand, size, barcode, buy, sell, stock, reorder);
    insertLedger.run(info.lastInsertRowid, stock, stock);
  }

  console.log(`Done. Database at ${DB_FILE}`);
  console.log('Logins:  admin / admin123   ·   cashier / cashier123');
}

seed();
