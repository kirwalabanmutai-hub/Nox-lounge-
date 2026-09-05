# Deploying the cloud demo (Vercel)

This gives you a real `https://your-project.vercel.app` link you can send the owner
to try out in a browser, before anything is installed on the shop PC. It's a separate,
optional deployment — the till itself still runs locally per [INSTALL.md](INSTALL.md)
and doesn't need any of this.

**Why extra steps are needed:** Vercel has no persistent disk, so the local SQLite
file the till PC uses can't work there. The app already supports swapping in a real
hosted database for exactly this case — you just need to create one and tell Vercel
about it.

## 1. Create a free cloud database (Turso)

1. Go to **<https://turso.tech>** → sign up (GitHub login is fine, no card needed for
   the free tier).
2. Create a database (from their dashboard, name it e.g. `nox-lounge`).
3. Get two values from it:
   - **Database URL** — looks like `libsql://nox-lounge-yourname.turso.io`
   - **Auth token** — create one for the database (dashboard → *Tokens* / *Create Token*)

*(If you prefer the CLI: `turso db create nox-lounge`, then
`turso db show nox-lounge --url` and `turso db tokens create nox-lounge`.)*

## 2. Add environment variables in Vercel

Open your Vercel project (the one already connected to this GitHub repo) →
**Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | the `libsql://...` URL from step 1 |
| `TURSO_AUTH_TOKEN` | the token from step 1 |
| `JWT_SECRET` | any long random string (e.g. generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |

Optional, only if you also want these live on the cloud copy:
`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`,
`SYNC_WEBHOOK_URL`, `SYNC_WEBHOOK_TOKEN` (same meaning as in `.env` — see INSTALL.md).

Apply them to **Production** (and Preview if you want branch previews to work too).

## 3. Redeploy

Vercel → **Deployments** → **Redeploy** on the latest one (or just push any commit —
it redeploys automatically). The first request after that will find an empty database
and **seed itself automatically** (same demo data as local: admin/admin123,
cashier/cashier123, sample products) — nothing extra to run by hand.

## 4. Check it and share the link

Open your `https://xxxxx.vercel.app` URL, log in with `admin` / `admin123` — it should
work exactly like the local app (dashboard, Sell screen, products, etc.). That URL is
what you send the owner to review.

**What won't work the same on the cloud copy** (all still fine on the local till):
receipt printing still uses whatever printer is on the reviewer's own PC (that part is
browser-side, so it's fine); barcode scanning also still works the same way. What's
genuinely different is that the cloud copy **needs internet to work at all** — that's
the opposite of the offline till, so don't run the actual shop off this link, only use
it for remote review/demo. If you want the owner to see live sales from the real
till, that's what the M-Pesa/Google-Sheet **cloud sync** feature is for instead (see
INSTALL.md → *Remote reporting*) — the till stays offline-first and just reports out.

## Rolling back / going local-only again

Local development is unaffected by any of this — with `TURSO_DATABASE_URL` unset in
`.env`, `npm start` on the till PC always uses the local SQLite file, never Turso.
