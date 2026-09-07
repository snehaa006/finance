# Deploying to Cloudflare

Everything ships as **one Worker**: it serves the API and the built React app
from the same origin, with D1 attached as a binding. No Pages project, no
separate backend host, no CORS.

Get the core app working locally first (see [README](./README.md)) — this guide
assumes `npm run dev` already works.

## 1. Authenticate

```bash
npx wrangler login
```

Opens a browser to authorise Wrangler against your Cloudflare account. On a
headless machine use an API token instead:

```bash
export CLOUDFLARE_API_TOKEN=...      # needs Workers Scripts:Edit + D1:Edit
export CLOUDFLARE_ACCOUNT_ID=...
```

Confirm with `npx wrangler whoami`.

## 2. Create the D1 database

```bash
npx wrangler d1 create finance-db
```

It prints a block like:

```
[[d1_databases]]
binding = "DB"
database_name = "finance-db"
database_id = "b1e4c0a2-1234-5678-9abc-def012345678"
```

Copy the `database_id` into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_D1_DATABASE_ID`. Leave `binding = "DB"` alone — the code
looks that name up.

This is safe to commit: a D1 database id is an identifier, not a credential.
Access is controlled by your Cloudflare account, not by knowing the id.

## 3. Run migrations against the real database

```bash
npx wrangler d1 migrations apply finance-db --remote
```

`--remote` is the important flag — without it you migrate the local emulated
copy again. Verify:

```bash
npx wrangler d1 execute finance-db --remote \
  --command "SELECT name FROM categories ORDER BY id"
```

You should see the eleven built-in categories.

## 4. Set the secrets

These are *secrets*, not `[vars]` — they never go in `wrangler.toml`.

```bash
npx wrangler secret put APP_PASSWORD      # the password you'll log in with
npx wrangler secret put SESSION_SECRET    # long random string, see below
```

Generate a strong session secret:

```bash
openssl rand -base64 48
```

`SESSION_SECRET` signs session cookies. Changing it invalidates every existing
session, which is also how you force-log-out every device.

| Name | Kind | Where it lives | Purpose |
|---|---|---|---|
| `APP_PASSWORD` | secret | `wrangler secret` | The login password |
| `SESSION_SECRET` | secret | `wrangler secret` | HMAC key for session cookies |
| `CURRENCY` | var | `wrangler.toml` | `INR` |
| `LOCALE` | var | `wrangler.toml` | `en-IN` |

Locally the two secrets come from `.dev.vars`, which is gitignored. Confirm with
`npx wrangler secret list`.

## 5. Deploy

```bash
npm run deploy
```

That runs `vite build` then `wrangler deploy` — the build must come first,
because `[assets]` in `wrangler.toml` uploads `./dist/client`, and deploying a
stale or missing build is the most common way to ship a blank page.

You'll get a URL like `https://finance-tracker.<subdomain>.workers.dev`. Open
it, enter `APP_PASSWORD`, and you're in.

## 6. Custom domain (optional)

In the dashboard: **Workers & Pages → finance-tracker → Settings → Domains &
Routes → Add custom domain**. The domain must be on a zone in the same account;
Cloudflare provisions the certificate. Or declare it in `wrangler.toml`:

```toml
[[routes]]
pattern = "money.example.com"
custom_domain = true
```

## 7. Add it to your phone's home screen

Mobile is the primary entry surface. Open the URL in Safari or Chrome and use
**Share → Add to Home Screen**. It launches full-screen and the quick-add button
lands under your thumb.

## Operations

**Back up.** Your data exists in exactly one place. D1 supports time-travel
restore for 30 days:

```bash
npx wrangler d1 time-travel info finance-db
npx wrangler d1 time-travel restore finance-db --timestamp <ISO-8601>
```

For a file you control, dump it periodically:

```bash
npx wrangler d1 export finance-db --remote --output backup-$(date +%F).sql
```

**Logs.** `npx wrangler tail` streams live requests and any `console.error` from
unhandled API errors.

**Schema changes.** Add a numbered file to `migrations/` (`0002_….sql`), apply it
locally first, then `--remote`. Never edit an applied migration — D1 tracks which
have run by filename.

**Cost.** Workers' free tier covers 100k requests/day and D1's covers 5M rows
read and 100k rows written per day. Single-user manual entry will not come close.

## Troubleshooting

**Blank page, API works** — `dist/client` wasn't built or is stale. Run
`npm run build` then redeploy; `npm run deploy` does both.

**`no such table: accounts`** — migrations only ran locally. Re-run step 3 with
`--remote`.

**Login always rejected** — `APP_PASSWORD` isn't set on the deployed Worker
(`.dev.vars` is local-only). Check `npx wrangler secret list`.

**Logged out on every request** — `SESSION_SECRET` is unset or changed between
deploys. Set it once and leave it.

**`D1_ERROR: no such column`** — a migration was edited after being applied.
Write a new migration instead of changing history.
