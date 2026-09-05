# 🍾 Liquor POS

A professional point-of-sale system for a liquor store — **Node.js + Express REST API**, a
**SQLite** database (zero install), and a **single-page dashboard** front-end.

| | |
|---|---|
| Live URL (after `npm start`) | http://localhost:4000 |
| Default admin | `admin` / `admin123` |
| Default cashier | `cashier` / `cashier123` |

---

## Quick start

```bash
npm install
cp .env.example .env      # optional – sensible defaults are baked in
npm start
```

Then open **http://localhost:4000**.

> Installing on a real shop PC (auto-start, app window, **barcode scanner**,
> **receipt printer**)? See **[INSTALL.md](INSTALL.md)**.
>
> Want a shareable cloud link to demo/review before installing anything? See
> **[DEPLOY.md](DEPLOY.md)** (Vercel + a free Turso database).

On first run the database file `database/pos.db` is created, the schema is applied and
demo data (users, categories, 8 products, opening stock) is seeded automatically.

| Command | Does |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Run with auto-reload (`node --watch`) |
| `npm run seed` | Re-seed demo data (skips if data present) |
| `npm run reset` | **Wipe** everything and re-seed |

### Requirements
Node.js **≥ 18**. Uses `@libsql/client` (SQLite-compatible) — a local file by default
(no MySQL/XAMPP needed), or a remote [Turso](https://turso.tech) database when
`TURSO_DATABASE_URL` is set (required for a serverless deploy — see [DEPLOY.md](DEPLOY.md)).

### Works offline / during a network outage
The app has **no runtime dependency on the internet**:

* Tailwind CSS is vendored at [public/vendor/tailwind.js](public/vendor/tailwind.js) (no CDN).
* Fonts use the local system stack — no Google Fonts download.
* The database, API and UI are all served from `localhost`.
* `npm install` is the only step that needs the internet — once `node_modules/`
  exists the whole system runs air-gapped.
* If the server itself is unreachable the UI shows a red **“Offline”** bar and
  recovers automatically when it comes back.

---

## What's included

**POS terminal** – product grid with search / barcode-scanner / category filter, live cart,
discount, automatic tax, multi-tender checkout, printable receipt.
**M-Pesa STK Push** – checkout can send a PIN prompt straight to the customer's phone
(Safaricom Daraja) and auto-complete the sale once they pay — no code typed by the
cashier. Off by default; add Daraja keys to `.env` to enable (see [INSTALL.md](INSTALL.md)).
**Cloud sync / remote reporting** – offline-first: every sale saves locally first,
always. Whenever there's internet, a background job pushes newly-completed sales to a
webhook (a free Google Sheet by default) so the owner can check sales from anywhere;
while offline it just waits and catches up automatically. Off by default — see
[INSTALL.md](INSTALL.md) → *Remote reporting*. Status + a manual **Sync now** button
live in **Settings**.
**Dashboard** – today / month sales, gross profit, stock value, 7-day trend,
top products, low-stock alerts, recent sales.
**Products** – full CRUD (admin/manager), buying/selling price, reorder level, SKU, barcode.
**Inventory** – immutable stock ledger; stock-in / return / damage / adjustment; low-stock list.
Every sale writes a `sale` ledger row and a DB trigger keeps `products.stock_quantity` correct.
**Sales history** – filterable list, click any row to re-open the receipt.
**Settings** – business details, currency, tax rate, receipt footer (admin only).
**Auth** – JWT bearer tokens, bcrypt password hashes, role-based route guards
(`admin` / `manager` / `cashier`).

---

## Project layout

```
POS SYTEM/
├── mysql.sql                     Reference production schema (MySQL 8 / MariaDB) + views + trigger
├── vercel.json                   Routes every request to api/index.js (cloud deploy only)
├── api/
│   └── index.js                  Vercel serverless entrypoint (wraps src/app.js)
├── database/
│   ├── schema.sqlite.sql         Runtime schema (mirrors mysql.sql)
│   └── pos.db                    Created on first run (git-ignored, local mode only)
├── src/
│   ├── app.js                    Builds the Express app (routes, static, error handler) - shared by server.js and api/index.js
│   ├── server.js                 Local entrypoint: `npm start` -> app.listen()
│   ├── db.js                     @libsql/client connection (local file, or remote Turso if TURSO_DATABASE_URL is set) + query helpers + tx()
│   ├── asyncHandler.js           Wraps async route handlers so thrown/rejected errors reach Express's error handler
│   ├── auth.js                   JWT sign / verify / role middleware
│   ├── seed.js                   Demo data (npm run seed / reset) - also auto-runs on first request against an empty DB
│   └── routes/
│       ├── auth.routes.js        POST /login, GET /me
│       ├── catalog.routes.js     /products /categories /suppliers
│       ├── inventory.routes.js   /inventory/transactions /low-stock /adjust
│       ├── sales.routes.js       GET /sales, GET /sales/:id, POST /sales (checkout)
│       ├── dashboard.routes.js   GET /dashboard/summary
│       ├── settings.routes.js    GET/PUT /settings
│       ├── mpesa.routes.js       STK push, status polling, Daraja callback
│       └── sync.routes.js        GET /sync/status, POST /sync/run
└── public/                       Front-end SPA (Tailwind CDN + vanilla JS)
    ├── index.html
    ├── css/styles.css
    └── js/{api.js, app.js}
```

## REST API (all under `/api`, JWT required except `/auth/login` and `/health`)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | → `{ token, user }` |
| GET | `/auth/me` | current user |
| GET | `/products` | `?search= &category_id= &low_stock=true` |
| POST/PUT/DELETE | `/products` `/products/:id` | admin/manager |
| GET/POST | `/categories` `/suppliers` | |
| GET | `/inventory/transactions` `?limit=` | stock ledger |
| GET | `/inventory/low-stock` | |
| POST | `/inventory/adjust` | `{ product_id, transaction_type, quantity, notes }` |
| GET | `/sales` | `?from= &to= &user_id= &limit=` |
| GET | `/sales/:id` | full receipt (items + payments) |
| POST | `/sales` | checkout — see below |
| GET | `/dashboard/summary` | KPI bundle |
| GET/PUT | `/settings` | PUT = admin only |
| GET | `/mpesa/config` | `{ configured, environment }` |
| POST | `/mpesa/stkpush` | `{ phone, amount }` → sends a PIN prompt, returns `{ checkout_request_id }` |
| GET | `/mpesa/status/:checkoutRequestId` | poll for the outcome (`pending/success/failed/cancelled/timeout`) |
| POST | `/mpesa/callback` | Safaricom's push endpoint (no auth) — optional, polling is primary |
| GET | `/sync/status` | `{ configured, pending, last_status, last_synced_at, ... }` |
| POST | `/sync/run` | admin only — push pending sales to the sync webhook now |

**Checkout payload**

```json
{
  "customer_name": "Walk-in",
  "discount": 0,
  "items":    [{ "product_id": 1, "quantity": 2 }],
  "payments": [{ "payment_method": "cash", "amount": 2400, "amount_received": 2500 }]
}
```

The server validates stock, computes subtotal / discount / tax / total, writes the sale,
line items (with cost snapshot for profit reporting), payments, inventory ledger rows and
an audit-log entry — all in one transaction.

---

## Using the MySQL schema instead

`mysql.sql` is the production reference schema (InnoDB, FKs, CHECK constraints, a
stock-sync trigger and reporting views `v_product_stock`, `v_daily_sales`, `v_sale_profit`).
To run the app on MySQL you would swap `src/db.js` for a `mysql2` pool and adjust the
`datetime('now')` calls — the SQLite build ships by default so the demo boots with nothing
to install.
