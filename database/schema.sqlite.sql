-- =========================================================
--  LIQUOR POS  ·  SQLite schema (demo runtime)
--  Mirrors mysql.sql. Applied automatically on first boot.
-- =========================================================
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin','manager','cashier')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    contact_person TEXT,
    phone          TEXT,
    email          TEXT,
    address        TEXT,
    kra_pin        TEXT,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id    INTEGER NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    supplier_id    INTEGER REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE SET NULL,
    sku            TEXT UNIQUE,
    name           TEXT NOT NULL,
    brand          TEXT,
    size           TEXT,
    barcode        TEXT UNIQUE,
    buying_price   REAL NOT NULL DEFAULT 0 CHECK (buying_price >= 0),
    selling_price  REAL NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    stock_quantity REAL NOT NULL DEFAULT 0,
    reorder_level  REAL NOT NULL DEFAULT 5,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_name     ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode  ON products(barcode);

CREATE TABLE IF NOT EXISTS sales (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT NOT NULL UNIQUE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    customer_name  TEXT,
    subtotal       REAL NOT NULL DEFAULT 0,
    discount       REAL NOT NULL DEFAULT 0,
    tax            REAL NOT NULL DEFAULT 0,
    total_amount   REAL NOT NULL DEFAULT 0,
    amount_paid    REAL NOT NULL DEFAULT 0,
    change_due     REAL NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','partial','refunded','void')),
    sale_status    TEXT NOT NULL DEFAULT 'completed' CHECK (sale_status IN ('completed','held','cancelled','refunded')),
    note           TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);

CREATE TABLE IF NOT EXISTS sale_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id      INTEGER NOT NULL REFERENCES sales(id) ON UPDATE CASCADE ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    product_size TEXT,
    unit_price   REAL NOT NULL,
    unit_cost    REAL NOT NULL DEFAULT 0,
    quantity     REAL NOT NULL CHECK (quantity > 0),
    discount     REAL NOT NULL DEFAULT 0,
    line_total   REAL NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

CREATE TABLE IF NOT EXISTS payments (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id               INTEGER NOT NULL REFERENCES sales(id) ON UPDATE CASCADE ON DELETE CASCADE,
    payment_method        TEXT NOT NULL CHECK (payment_method IN ('cash','mpesa','card','bank','credit')),
    amount                REAL NOT NULL,
    amount_received       REAL,
    change_amount         REAL NOT NULL DEFAULT 0,
    transaction_reference TEXT,
    mpesa_phone           TEXT,
    payment_status        TEXT NOT NULL DEFAULT 'confirmed' CHECK (payment_status IN ('pending','confirmed','failed','cancelled','refunded')),
    paid_at               TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id       INTEGER NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('stock_in','sale','return','damage','adjustment','opening')),
    quantity_change  REAL NOT NULL,
    stock_before     REAL NOT NULL,
    stock_after      REAL NOT NULL,
    reference_type   TEXT,
    reference_id     INTEGER,
    notes            TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_date    ON inventory_transactions(created_at);

-- M-Pesa STK Push (Daraja) tracking - one row per "prompt sent to phone"
CREATE TABLE IF NOT EXISTS mpesa_requests (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    checkout_request_id  TEXT NOT NULL UNIQUE,
    merchant_request_id  TEXT,
    phone                TEXT NOT NULL,
    amount               REAL NOT NULL,
    account_reference    TEXT,
    status               TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','success','failed','cancelled','timeout')),
    result_code          INTEGER,
    result_desc          TEXT,
    mpesa_receipt        TEXT,
    sale_id              INTEGER REFERENCES sales(id) ON UPDATE CASCADE ON DELETE SET NULL,
    user_id              INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mpesa_checkout ON mpesa_requests(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_status   ON mpesa_requests(status);

-- Cloud sync state (see src/services/sync.js) - one row, tracks progress
-- of pushing completed sales to the owner's remote spreadsheet/webhook.
CREATE TABLE IF NOT EXISTS sync_state (
    id                   INTEGER PRIMARY KEY CHECK (id = 1),
    last_synced_sale_id  INTEGER NOT NULL DEFAULT 0,
    last_synced_at       TEXT,
    last_attempt_at      TEXT,
    last_status          TEXT NOT NULL DEFAULT 'never' CHECK (last_status IN ('never','ok','error','offline')),
    last_error           TEXT
);
INSERT OR IGNORE INTO sync_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    category     TEXT NOT NULL,
    description  TEXT NOT NULL,
    amount       REAL NOT NULL,
    expense_date TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    action     TEXT NOT NULL,
    table_name TEXT,
    record_id  INTEGER,
    old_value  TEXT,
    new_value  TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

CREATE TABLE IF NOT EXISTS business_settings (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    business_name   TEXT NOT NULL,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    kra_pin         TEXT,
    receipt_footer  TEXT,
    currency        TEXT NOT NULL DEFAULT 'KES',
    tax_enabled     INTEGER NOT NULL DEFAULT 0,
    tax_rate        REAL NOT NULL DEFAULT 0,
    low_stock_alert INTEGER NOT NULL DEFAULT 1,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Keep products.stock_quantity in sync with the ledger
CREATE TRIGGER IF NOT EXISTS trg_inventory_after_insert
AFTER INSERT ON inventory_transactions
BEGIN
    UPDATE products SET stock_quantity = NEW.stock_after, updated_at = datetime('now')
    WHERE id = NEW.product_id;
END;

-- Reporting views
CREATE VIEW IF NOT EXISTS v_product_stock AS
SELECT p.id, p.name, p.brand, p.size, c.name AS category,
       p.stock_quantity, p.reorder_level,
       (p.stock_quantity <= p.reorder_level) AS is_low_stock,
       p.selling_price, p.buying_price,
       (p.selling_price - p.buying_price) AS unit_margin
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.is_active = 1;
