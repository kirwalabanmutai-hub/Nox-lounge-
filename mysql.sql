-- =========================================================
--  LIQUOR POS SYSTEM  ·  PROFESSIONAL DATABASE SCHEMA
--  Engine : MySQL 8.0+ / MariaDB 10.5+
--  Charset: utf8mb4 / utf8mb4_unicode_ci
--
--  This is the reference (production) schema. The bundled
--  Node.js demo app runs on an equivalent SQLite schema
--  (see database/schema.sqlite.sql) so it can boot with
--  zero external services.
-- =========================================================

CREATE DATABASE IF NOT EXISTS liquor_pos
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE liquor_pos;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS mpesa_requests;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS purchase_items;
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS inventory_transactions;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS business_settings;

SET FOREIGN_KEY_CHECKS = 1;


-- =========================================================
-- 1. USERS  ·  staff accounts & access control
-- =========================================================
CREATE TABLE users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100)  NOT NULL,
    username      VARCHAR(50)   NOT NULL,
    email         VARCHAR(150)  NULL,
    password_hash VARCHAR(255)  NOT NULL,
    role          ENUM('admin','manager','cashier') NOT NULL DEFAULT 'cashier',
    is_active     TINYINT(1)    NOT NULL DEFAULT 1,
    last_login_at DATETIME      NULL,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;


-- =========================================================
-- 2. CATEGORIES
-- =========================================================
CREATE TABLE categories (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;


-- =========================================================
-- 3. SUPPLIERS
-- =========================================================
CREATE TABLE suppliers (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100) NULL,
    phone          VARCHAR(30)  NULL,
    email          VARCHAR(150) NULL,
    address        VARCHAR(255) NULL,
    kra_pin        VARCHAR(50)  NULL,
    is_active      TINYINT(1)   NOT NULL DEFAULT 1,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_suppliers_name (name)
) ENGINE=InnoDB;


-- =========================================================
-- 4. PRODUCTS  ·  stock catalogue
-- =========================================================
CREATE TABLE products (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id    INT UNSIGNED NOT NULL,
    supplier_id    INT UNSIGNED NULL,
    sku            VARCHAR(50)  NULL,
    name           VARCHAR(150) NOT NULL,
    brand          VARCHAR(100) NULL,
    size           VARCHAR(50)  NULL,
    barcode        VARCHAR(100) NULL,
    buying_price   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    selling_price  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    stock_quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    reorder_level  DECIMAL(12,2) NOT NULL DEFAULT 5.00,
    is_active      TINYINT(1)   NOT NULL DEFAULT 1,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_products_barcode (barcode),
    UNIQUE KEY uq_products_sku (sku),
    KEY idx_products_name (name),
    KEY idx_products_category (category_id),
    KEY idx_products_supplier (supplier_id),
    CONSTRAINT chk_products_prices CHECK (buying_price >= 0 AND selling_price >= 0),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;


-- =========================================================
-- 5. SALES  ·  receipt header
-- =========================================================
CREATE TABLE sales (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    receipt_number VARCHAR(50)  NOT NULL,
    user_id        INT UNSIGNED NOT NULL,
    customer_name  VARCHAR(150) NULL,
    subtotal       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount_paid    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    change_due     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    payment_status ENUM('pending','paid','partial','refunded','void') NOT NULL DEFAULT 'pending',
    sale_status    ENUM('completed','held','cancelled','refunded')    NOT NULL DEFAULT 'completed',
    note           VARCHAR(255) NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sales_receipt (receipt_number),
    KEY idx_sales_date (created_at),
    KEY idx_sales_user (user_id),
    KEY idx_sales_status (sale_status, payment_status),
    CONSTRAINT fk_sales_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =========================================================
-- 6. SALE ITEMS  ·  receipt lines (product snapshot kept)
-- =========================================================
CREATE TABLE sale_items (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sale_id      BIGINT UNSIGNED NOT NULL,
    product_id   INT UNSIGNED NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    product_size VARCHAR(50)  NULL,
    unit_price   DECIMAL(12,2) NOT NULL,
    unit_cost    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    quantity     DECIMAL(12,2) NOT NULL,
    discount     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    line_total   DECIMAL(12,2) NOT NULL,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sale_items_sale (sale_id),
    KEY idx_sale_items_product (product_id),
    CONSTRAINT chk_sale_items_qty CHECK (quantity > 0),
    CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =========================================================
-- 7. PAYMENTS  ·  one or more tenders per sale
-- =========================================================
CREATE TABLE payments (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sale_id               BIGINT UNSIGNED NOT NULL,
    payment_method        ENUM('cash','mpesa','card','bank','credit') NOT NULL,
    amount                DECIMAL(12,2) NOT NULL,
    amount_received       DECIMAL(12,2) NULL,
    change_amount         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    transaction_reference VARCHAR(100) NULL,
    mpesa_phone           VARCHAR(30)  NULL,
    payment_status        ENUM('pending','confirmed','failed','cancelled','refunded') NOT NULL DEFAULT 'confirmed',
    paid_at               DATETIME     NULL,
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_payments_sale (sale_id),
    KEY idx_payments_reference (transaction_reference),
    CONSTRAINT fk_payments_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 8. INVENTORY TRANSACTIONS  ·  immutable stock ledger
-- =========================================================
CREATE TABLE inventory_transactions (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id       INT UNSIGNED NOT NULL,
    user_id          INT UNSIGNED NOT NULL,
    transaction_type ENUM('stock_in','sale','return','damage','adjustment','opening') NOT NULL,
    quantity_change  DECIMAL(12,2) NOT NULL,   -- signed: +in / -out
    stock_before     DECIMAL(12,2) NOT NULL,
    stock_after      DECIMAL(12,2) NOT NULL,
    reference_type   VARCHAR(50)  NULL,        -- 'sale' | 'purchase' | ...
    reference_id     BIGINT UNSIGNED NULL,
    notes            VARCHAR(255) NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_inventory_product (product_id),
    KEY idx_inventory_date (created_at),
    KEY idx_inventory_reference (reference_type, reference_id),
    CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =========================================================
-- 9. PURCHASES  ·  goods received from suppliers
-- =========================================================
CREATE TABLE purchases (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    supplier_id     INT UNSIGNED NOT NULL,
    user_id         INT UNSIGNED NOT NULL,
    invoice_number  VARCHAR(100) NULL,
    total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount_paid     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    purchase_status ENUM('pending','received','partially_received','cancelled') NOT NULL DEFAULT 'pending',
    purchase_date   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes           VARCHAR(255) NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_purchases_supplier (supplier_id),
    KEY idx_purchases_date (purchase_date),
    CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_purchases_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =========================================================
-- 10. PURCHASE ITEMS
-- =========================================================
CREATE TABLE purchase_items (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_id BIGINT UNSIGNED NOT NULL,
    product_id  INT UNSIGNED NOT NULL,
    quantity    DECIMAL(12,2) NOT NULL,
    unit_cost   DECIMAL(12,2) NOT NULL,
    line_total  DECIMAL(12,2) NOT NULL,
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_purchase_items_purchase (purchase_id),
    KEY idx_purchase_items_product (product_id),
    CONSTRAINT fk_purchase_items_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_purchase_items_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =========================================================
-- 10b. MPESA REQUESTS  ·  STK Push (Daraja) tracking
-- =========================================================
CREATE TABLE mpesa_requests (
    id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    checkout_request_id  VARCHAR(50)  NOT NULL,
    merchant_request_id  VARCHAR(50)  NULL,
    phone                VARCHAR(15)  NOT NULL,
    amount               DECIMAL(12,2) NOT NULL,
    account_reference    VARCHAR(50)  NULL,
    status               ENUM('pending','success','failed','cancelled','timeout') NOT NULL DEFAULT 'pending',
    result_code          INT NULL,
    result_desc          VARCHAR(255) NULL,
    mpesa_receipt        VARCHAR(50)  NULL,
    sale_id              BIGINT UNSIGNED NULL,
    user_id              INT UNSIGNED NOT NULL,
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mpesa_checkout (checkout_request_id),
    KEY idx_mpesa_status (status),
    CONSTRAINT fk_mpesa_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_mpesa_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =========================================================
-- 10c. SYNC STATE  ·  cloud backup / remote-reporting progress
-- =========================================================
CREATE TABLE sync_state (
    id                   INT UNSIGNED PRIMARY KEY DEFAULT 1,
    last_synced_sale_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    last_synced_at       DATETIME NULL,
    last_attempt_at      DATETIME NULL,
    last_status          ENUM('never','ok','error','offline') NOT NULL DEFAULT 'never',
    last_error           VARCHAR(255) NULL,
    CONSTRAINT chk_sync_state_singleton CHECK (id = 1)
) ENGINE=InnoDB;

INSERT INTO sync_state (id) VALUES (1);


-- =========================================================
-- 11. EXPENSES
-- =========================================================
CREATE TABLE expenses (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED NOT NULL,
    category     VARCHAR(100) NOT NULL,
    description  VARCHAR(255) NOT NULL,
    amount       DECIMAL(12,2) NOT NULL,
    expense_date DATE         NOT NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_expenses_date (expense_date),
    CONSTRAINT fk_expenses_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =========================================================
-- 12. AUDIT LOGS
-- =========================================================
CREATE TABLE audit_logs (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NULL,
    action     VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NULL,
    record_id  BIGINT UNSIGNED NULL,
    old_value  JSON NULL,
    new_value  JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_user (user_id),
    KEY idx_audit_table (table_name, record_id),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;


-- =========================================================
-- 13. BUSINESS SETTINGS  ·  single-row config (id = 1)
-- =========================================================
CREATE TABLE business_settings (
    id             INT UNSIGNED PRIMARY KEY DEFAULT 1,
    business_name  VARCHAR(150) NOT NULL,
    phone          VARCHAR(50)  NULL,
    email          VARCHAR(150) NULL,
    address        VARCHAR(255) NULL,
    kra_pin        VARCHAR(50)  NULL,
    receipt_footer VARCHAR(255) NULL,
    currency       VARCHAR(10)  NOT NULL DEFAULT 'KES',
    tax_enabled    TINYINT(1)   NOT NULL DEFAULT 0,
    tax_rate       DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    low_stock_alert TINYINT(1)  NOT NULL DEFAULT 1,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB;


-- =========================================================
-- TRIGGERS  ·  keep products.stock_quantity in sync with
--              the inventory ledger automatically
-- =========================================================
DELIMITER $$

CREATE TRIGGER trg_inventory_after_insert
AFTER INSERT ON inventory_transactions
FOR EACH ROW
BEGIN
    UPDATE products
       SET stock_quantity = NEW.stock_after
     WHERE id = NEW.product_id;
END$$

DELIMITER ;


-- =========================================================
-- REPORTING VIEWS
-- =========================================================
CREATE OR REPLACE VIEW v_product_stock AS
SELECT p.id, p.name, p.brand, p.size, c.name AS category,
       p.stock_quantity, p.reorder_level,
       (p.stock_quantity <= p.reorder_level) AS is_low_stock,
       p.selling_price, p.buying_price,
       (p.selling_price - p.buying_price) AS unit_margin
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.is_active = 1;

CREATE OR REPLACE VIEW v_daily_sales AS
SELECT DATE(s.created_at)                AS sale_day,
       COUNT(*)                          AS receipts,
       SUM(s.total_amount)               AS gross_sales,
       SUM(s.discount)                   AS total_discount,
       SUM(s.tax)                        AS total_tax
FROM sales s
WHERE s.sale_status = 'completed'
GROUP BY DATE(s.created_at);

CREATE OR REPLACE VIEW v_sale_profit AS
SELECT s.id AS sale_id, s.receipt_number, s.created_at,
       SUM(si.line_total)                          AS revenue,
       SUM(si.unit_cost * si.quantity)             AS cost,
       SUM(si.line_total - si.unit_cost * si.quantity) AS gross_profit
FROM sales s
JOIN sale_items si ON si.sale_id = s.id
WHERE s.sale_status = 'completed'
GROUP BY s.id, s.receipt_number, s.created_at;


-- =========================================================
-- SEED DATA
-- =========================================================

-- Default admin  ·  username: admin  ·  password: admin123
-- (real bcrypt hash for 'admin123' - generated with bcryptjs, cost 10)
INSERT INTO users (name, username, email, password_hash, role) VALUES
('System Administrator', 'admin', 'admin@liquorpos.local',
 '$2a$10$g/d4Y/zGCpWb3CnSlZtcLOjiSWYA.MyqHq6YbSRneFkrVlOkivQmy', 'admin'),
('Jane Cashier', 'cashier', 'cashier@liquorpos.local',
 '$2a$10$Uk0eFwo1qqumMTth0g.Fk.XpFMpw3AOyG3mXIbHtdmeRk0SO0OrvK', 'cashier');
-- cashier password: cashier123

INSERT INTO categories (name, description) VALUES
('Beer',    'Beer products'),
('Spirits', 'General spirits'),
('Vodka',   'Vodka products'),
('Whisky',  'Whisky products'),
('Gin',     'Gin products'),
('Rum',     'Rum products'),
('Brandy',  'Brandy products'),
('Wine',    'Wine products'),
('Cider',   'Cider products'),
('Other',   'Other alcoholic beverages');

INSERT INTO business_settings
    (id, business_name, phone, address, currency, tax_enabled, tax_rate, receipt_footer)
VALUES
    (1, 'Nox Lounge', '', 'Eldoret, Kenya', 'KES', 0, 0.00,
     'Thank you for shopping with us. Drink responsibly. 18+');

INSERT INTO suppliers (name, phone, email, address) VALUES
('Main Beverage Supplier', '0700000000', '', 'Nairobi, Kenya');

INSERT INTO products
    (category_id, supplier_id, sku, name, brand, size, barcode,
     buying_price, selling_price, stock_quantity, reorder_level)
VALUES
(3, 1, 'VOD-SMR-750', 'Smirnoff Vodka', 'Smirnoff', '750ml', '100000000001',  900.00, 1200.00, 24, 5),
(1, 1, 'BEE-TSK-500', 'Tusker Lager',   'Tusker',   '500ml', '100000000002',  160.00,  200.00, 60, 10),
(5, 1, 'GIN-GLB-750', 'Gilbeys Gin',    'Gilbeys',  '750ml', '100000000003',  850.00, 1100.00, 18, 5),
(3, 1, 'VOD-CHR-750', 'Chrome Vodka',   'Chrome',   '750ml', '100000000004',  700.00,  950.00, 32, 5),
(4, 1, 'WHK-JW-750',  'Johnnie Walker Red','Johnnie Walker','750ml','100000000005', 1800.00, 2400.00, 12, 4),
(8, 1, 'WIN-4TH-750', '4th Street Red', '4th Street','750ml', '100000000006',  650.00,  900.00, 20, 6);

-- Record opening stock in the ledger
INSERT INTO inventory_transactions
    (product_id, user_id, transaction_type, quantity_change, stock_before, stock_after, notes)
SELECT id, 1, 'opening', stock_quantity, 0, stock_quantity, 'Opening balance'
FROM products;

-- =========================================================
-- END OF SCHEMA
-- =========================================================
