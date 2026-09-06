# Deploying the cloud demo

This gives you a public `https://…` link to send the owner for review, before
anything is installed on the shop PC. It's optional and separate — the real till
still runs locally per [INSTALL.md](INSTALL.md).

**Why there are extra steps:** a host like Netlify or Vercel has no persistent disk,
so the local SQLite file the till uses can't live there. The app already supports
pointing at a hosted database instead — you just create one (free) and set three
environment variables.

The repo is wired for **both Netlify and Vercel**. Pick one.

---

## Step 1 — Create a free cloud database (Turso) — *needed either way*

1. Go to **<https://turso.tech>** → sign up (GitHub login, no card for the free tier).
2. Create a database (dashboard → *Create Database*, name it e.g. `nox-lounge`).
3. Copy two values:
   - **Database URL** — `libsql://nox-lounge-<you>.turso.io`
   - **Auth token** — dashboard → *Create Token* for that database

*(CLI alternative: `turso db create nox-lounge`, then `turso db show nox-lounge --url`
and `turso db tokens create nox-lounge`.)*

You'll also need a **JWT secret** — any long random string. Generate one:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Step 2A — Deploy on Netlify

1. **app.netlify.com → Add new site → Import from Git** → pick the
   `kirwalabanmutai-hub/Nox-lounge-` repo.
2. Netlify reads `netlify.toml` automatically — leave the build settings as detected
   (publish dir `public`, functions dir `netlify/functions`). Deploy.
3. **Site configuration → Environment variables → Add a variable** (three of them):

   | Key | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | the `libsql://…` URL from Step 1 |
   | `TURSO_AUTH_TOKEN` | the token from Step 1 |
   | `JWT_SECRET` | your random string |

   *(Optional, only if you want them live on the demo too: `MPESA_CONSUMER_KEY`,
   `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `SYNC_WEBHOOK_URL`,
   `SYNC_WEBHOOK_TOKEN` — see INSTALL.md.)*
4. **Deploys → Trigger deploy → Deploy site** (so it picks up the new env vars).
5. Open the site URL. The first request finds an empty database and **seeds itself
   automatically** (admin/admin123, cashier/cashier123, sample products). Done.

**Troubleshooting**
- **502 on login** = the function ran but crashed. Almost always the three env
  vars aren't set (or the deploy ran before you added them). Set them, then
  **Deploys → Trigger deploy**. Confirm the exact error under **Logs → Functions →
  `api`** — with the vars missing it logs *"TURSO_DATABASE_URL … must be set on a
  serverless deploy"*.
- **404 on login** = the redirect isn't applying; make sure `netlify.toml` is at the
  repo root (it is) and the site's base directory is the repo root.
- Turso URL must start with `libsql://` (not `https://`), and the auth token is the
  long one from *Create Token*, not the database name.

---

## Step 2B — Deploy on Vercel (alternative)

1. **vercel.com → Add New → Project** → import the same repo. It reads `vercel.json`.
2. **Settings → Environment Variables** → add the same three
   (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`) to **Production**.
3. **Deployments → Redeploy**.
4. Open the `*.vercel.app` URL — same self-seeding behaviour as above.

---

## Step 3 — Check it, then share

Open the URL, log in `admin` / `admin123`. Dashboard, Sell, Products should all work.
That URL is what you send the owner.

**Don't run the actual shop off this link.** The cloud copy needs internet to do
anything — the opposite of the offline till. It's for demo/review only. For the owner
to watch real sales from the real till, use the offline-first **cloud sync** feature
instead (INSTALL.md → *Remote reporting*).

---

## Local development is unaffected

With `TURSO_DATABASE_URL` unset in `.env`, `npm start` on the till PC always uses the
local SQLite file and never touches Turso or the internet.
