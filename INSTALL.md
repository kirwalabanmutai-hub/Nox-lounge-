# Installing Nox Lounge POS on a shop PC

The POS is a small local web server + browser UI. "Installing" it means:

1. Put the folder on the PC and install Node.js once.
2. Make the server start by itself.
3. Open it as a full-screen app.
4. (Optional) Plug in a barcode scanner and a receipt printer.

Everything runs on `http://localhost:4000` — **no internet needed** after step 1.

---

## 1. One-time setup

1. Copy the whole **`POS SYTEM`** folder to the PC, e.g. `C:\NoxLoungePOS`.
   (Avoid OneDrive/synced folders for the live copy — the database changes constantly.)
2. Install **Node.js LTS** from <https://nodejs.org> (v22.5 or newer). Accept defaults.
3. Double-click **`start-pos.bat`**. The first run downloads dependencies (needs
   internet *this once*), then prints:
   ```
   Nox Lounge POS  ->  http://localhost:4000
   ```
4. Open a browser to <http://localhost:4000> and log in with `admin` / `admin123`.
   Change the admin password later via `npm run adduser -- admin <newpass> admin "Owner"`.

---

## 2. Start automatically at power-on

Open **PowerShell** in the folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
```

This registers a Task Scheduler job (**`NoxLoungePOS`**) that launches the server every
time the user signs in. Start it right away without rebooting:

```
schtasks /Run /TN "NoxLoungePOS"
```

Undo any time: `schtasks /Delete /TN "NoxLoungePOS" /F`

---

## 3. Open it as an "app" (recommended for the till)

Double-click **`open-pos.bat`** — it launches Chrome (or Edge) in **app mode**
(no tabs, no address bar), maximised, with **silent receipt printing** enabled
(`--kiosk-printing`).

To pin it: right-click `open-pos.bat` → *Send to → Desktop (create shortcut)*,
rename the shortcut to **Nox Lounge POS**, change its icon if you like, and drag it
to the taskbar / Start.

---

## 4. Barcode scanner

Almost every USB barcode scanner is a **"keyboard-wedge" (HID)** device — it needs
**no driver and no configuration**. Windows sees it as a keyboard.

**Test it:** open Notepad, scan a product — the digits should appear followed by a
new line.

**Use it in the POS:**
* Go to the **Sell** screen. The search box is focused automatically.
* Scan a bottle. The scanner types the barcode and sends *Enter*; the app finds the
  product by its `barcode` and drops it straight into the cart. Scan again to add more.
* First, make sure each product has its real barcode saved:
  **Products → Edit → Barcode** (or set it when creating the product).

Scanner tips:
* If codes come out garbled, set the scanner to **US keyboard layout** (scan the
  "USA" setup barcode in its manual).
* Make sure it's in **"HID Keyboard"** mode, not "USB-COM/serial".
* A suffix of **Enter/CR** must be enabled (it usually is by default).

---

## 5. Receipt printer

### A. Thermal 58 mm / 80 mm printer (Epson TM-T20, XPrinter, etc.)

1. Install the printer's **Windows driver** (from the CD or the maker's site — download
   on another PC if this one is offline). It then shows up under
   *Settings → Bluetooth & devices → Printers & scanners*.
2. Set the paper width in the driver to **80 mm (72 mm printable)** or **58 mm**.
3. Make this printer the **default printer** (Windows → Printers & scanners → select it
   → *Set as default*). `--kiosk-printing` always prints to the default.
4. In the POS, open **Settings** and fill in business name, address, KRA PIN and the
   receipt footer — these print on every receipt.
5. Do a sale → **Print**. The page CSS is already tuned to a ~72 mm slip
   (`@media print` in `public/css/styles.css`); adjust the `width` / `@page size`
   there if your printer cuts text.

If a Windows *"Print"* dialog still pops up, you launched the browser normally —
use `open-pos.bat` (kiosk printing) instead, or in Chrome set
*Settings → Printing* and pick the printer as default destination.

### B. Ordinary A4 inkjet/laser

Works with no changes — the receipt just prints on the top of an A4 sheet. Use `Ctrl+P`
and choose the printer.

### C. M-Pesa STK Push ("prompt the customer's phone")

At checkout, choosing **M-Pesa** shows a phone number field and a **📲 Send prompt to
customer's phone** button — the customer gets Safaricom's standard PIN prompt on
their own phone, pays, and the sale completes automatically with the real M-Pesa
receipt number. No code is ever typed by the cashier.

**Setup (one time):**
1. Register at <https://developer.safaricom.co.ke> and create an app — this gives you
   free **sandbox** `Consumer Key` / `Consumer Secret` immediately.
2. Put them in `.env`:
   ```
   MPESA_ENV=sandbox
   MPESA_CONSUMER_KEY=xxxxxxxx
   MPESA_CONSUMER_SECRET=xxxxxxxx
   MPESA_SHORTCODE=174379                 # sandbox test paybill (already set)
   MPESA_PASSKEY=bfb279f9aa9bdbcf...       # sandbox passkey (already set)
   ```
3. Restart the server (`start-pos.bat`). The **Send prompt** button appears on the
   checkout screen once `MPESA_CONSUMER_KEY`/`SECRET` are filled in — until then it
   shows a note and the till just uses Cash/Card/Bank.
4. Test with Safaricom's sandbox test phone number (see their docs) — the sandbox
   auto-approves the prompt after a few seconds.

**Going live:** apply for a **Paybill or Till number** with Safaricom, get
*production* keys, set `MPESA_ENV=production` and your real `MPESA_SHORTCODE` /
`MPESA_PASSKEY`.

**About `MPESA_CALLBACK_URL` (optional):** Safaricom can push the result to a public
HTTPS URL, but a shop PC behind a home/office router has no public address. The app
doesn't need one — it polls Safaricom directly for the result every 3 seconds
(`stkpushquery`), so it works from any internet connection. Set the callback URL
only if you later host the server somewhere public (or tunnel it with ngrok) and want
instant push instead of polling.

Note: STK push needs **internet** (it talks to Safaricom's cloud) — cash sales and
everything else keep working during an outage; M-Pesa prompts simply pause until the
connection is back.

### D. Remote reporting (offline-first cloud sync)

```
INTERNET
    │
┌───┴───┐
ONLINE  OFFLINE
│         │
▼         ▼
Push to   Stays in the
the Sheet local database
│         │
└────┬────┘
     ▼
 SYNC LATER (auto-retry)
```

Every sale is written to the local database **first, always** — that never depends on
the internet. Whenever the till *does* have a connection, a background job pushes
newly-completed sales to a free **Google Sheet**, so you (the owner) can open the
Sheets app on your phone from anywhere and see sales as they come in. No server to
rent, no monthly cost. While offline it just waits and catches up automatically —
nothing is ever lost or duplicated (it tracks exactly which sale it last sent).

**One-time setup (~5 minutes):**
1. Create a new Google Sheet (sheets.google.com → Blank).
2. **Extensions → Apps Script**, delete the sample code and paste:
   ```javascript
   const TOKEN = 'pick-a-secret-string-here'; // must match SYNC_WEBHOOK_TOKEN below

   function doPost(e) {
     const body = JSON.parse(e.postData.contents);
     if (body.token !== TOKEN) {
       return ContentService.createTextOutput('forbidden').setMimeType(ContentService.MimeType.TEXT);
     }
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const sheet = ss.getSheetByName('Sales') || ss.insertSheet('Sales');
     if (sheet.getLastRow() === 0) {
       sheet.appendRow(['ID','Receipt','Date','Cashier','Subtotal','Discount','Tax',
                         'Total','Paid','Payment status','Items','Methods']);
     }
     (body.sales || []).forEach(s => sheet.appendRow([
       s.id, s.receipt_number, s.created_at, s.cashier_name, s.subtotal, s.discount,
       s.tax, s.total_amount, s.amount_paid, s.payment_status, s.item_count, s.payment_methods,
     ]));
     return ContentService.createTextOutput(JSON.stringify({ ok: true, received: (body.sales || []).length }))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```
3. **Deploy → New deployment → type "Web app"** → Execute as **Me** → Who has access
   **Anyone** → Deploy. Copy the `/exec` URL it gives you.
4. In `.env` on the POS PC:
   ```
   SYNC_WEBHOOK_URL=https://script.google.com/macros/s/XXXXX/exec
   SYNC_WEBHOOK_TOKEN=pick-a-secret-string-here   # same string as TOKEN above
   ```
5. Restart the server (`start-pos.bat`). Check **Settings → Cloud sync** in the app —
   it shows *Synced* / *Waiting for internet* / pending count, plus a **Sync now**
   button (admin only).

Open the Sheet on your phone (Google Sheets app) any time to see the sales feed —
that's your "remote reporting", from anywhere, for free.

*Want a proper live database instead of a spreadsheet later (Supabase/Postgres,
multi-till, dashboards)? The `sync_state` cursor design supports swapping the webhook
target without changing anything else — ask and it can be pointed there instead.*

### E. Exact ESC/POS control (cash-drawer kick, auto-cut)

Not built in. If you need it later, add a helper that sends raw ESC/POS bytes to the
printer's share name (`\\localhost\EPSON_TM`), or run a small
`@point-of-sale/network-receipt-printer` bridge. Ask and it can be added.

---

## Everyday use

| Action | How |
|---|---|
| Start the server | auto at logon, or `start-pos.bat`, or `schtasks /Run /TN "NoxLoungePOS"` |
| Open the till UI | `open-pos.bat` / the desktop shortcut |
| Stop the server | close the `start-pos.bat` window (or End task) |
| Back up data | copy `database\pos.db` somewhere safe (do it daily) |
| Add a cashier | `npm run adduser -- <username> <password> cashier "Full Name"` |
| Wipe & re-seed demo data | `npm run reset` |

## Multiple tills on the same counter network (optional)

Run the server on one "main" PC. On the others, open
`http://<main-pc-IP>:4000` instead of `localhost`. Allow port 4000 through Windows
Firewall on the main PC (*Private* network only). All tills then share one database.
