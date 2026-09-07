# Finance Tracker

A single-user manual expense and net-worth tracker. No bank API integration —
everything is entered by hand, but entering it should take under ten seconds.

- **Frontend** — React + TypeScript, React Router, Tailwind, shadcn/ui, Recharts
- **Backend** — Hono on Cloudflare Workers
- **Database** — Cloudflare D1 (SQLite)
- **Currency** — INR, `en-IN` formatting

## Why not FastAPI?

The original spec asked for Python/FastAPI with everything hosted on Cloudflare.
Those two don't fit together: Workers runs V8 isolates, not CPython. Python
Workers exist but run CPython compiled to WASM via Pyodide — beta, heavy cold
starts, a restricted package set, and D1 access only through JS interop shims.

Rather than split the app across two hosts or write every endpoint twice, the
backend is a TypeScript Worker using Hono. The API surface is the same shape a
FastAPI app would have had, and the whole thing — API, database, and static
frontend — deploys as one Cloudflare Worker.

**The tradeoff:** you give up Python. In exchange you get one deploy target, one
language, native D1 bindings, and no cold-start penalty. If Python is a hard
requirement later, the closest option that keeps the DB on Cloudflare is running
FastAPI on Fly.io/Render and talking to D1 over its HTTP API — slower per query,
and two things to deploy.

## Project layout

```
src/                  Cloudflare Worker (API)
  index.ts            entrypoint, auth gate, route mounting
  lib/auth.ts         password check + HMAC-signed session cookie
  lib/csv.ts          bank statement CSV parsing (column sniffing)
  lib/match.ts        reconciliation matching engine
  lib/http.ts         validation helpers and ApiError
  routes/             accounts, categories, transactions, dashboard, reconcile
web/                  React frontend
  src/components/ui/  shadcn/ui components
  src/pages/          Dashboard, Transactions, Accounts, Reconcile, Settings
  src/lib/            API client, formatters, contexts
migrations/           D1 schema (wrangler runs every .sql here as a migration)
samples/              an example bank statement CSV to try reconciliation with
```

## Money representation

Every amount is a **signed integer in paise**. Negative means money left the
account; positive means it arrived. So an account balance is just:

```sql
starting_balance + SUM(amount)
```

No per-type branching, no floating-point rounding drift. Rupee values exist only
at the input and render boundaries (`toMinor` / `formatMoney`).

A transfer is two rows sharing a `transfer_group_id` — negative on the source
account, positive on the destination. Editing or deleting either leg applies to
both, so the pair can never drift apart.

## Local development

**1. Install and configure**

```bash
npm install
cp .dev.vars.example .dev.vars   # then edit APP_PASSWORD and SESSION_SECRET
```

`.dev.vars` is gitignored. `APP_PASSWORD` is what you type at the login screen;
`SESSION_SECRET` signs the session cookie.

**2. Create the local database**

```bash
npm run db:migrate:local
npm run db:seed:local    # optional sample accounts and transactions (samples/seed.sql)
```

**3. Run it**

```bash
npm run dev
```

This starts the Worker on `:8787` and Vite on `:5173`. **Open
http://localhost:5173** — Vite proxies `/api` to the Worker, so you get hot
reload on the frontend and live reload on the API.

To exercise the production path instead (Worker serving the built frontend):

```bash
npm run build && npx wrangler dev
```

Then open http://localhost:8787.

## Features

**Entries** — money in, money out, and (only when you keep more than one
account) moving money between your own accounts. Each has an account, category,
date and optional note. Filter by date range, account, category, direction, or a
text search across notes/categories/accounts.

**Add money in or out** — the floating `+` on mobile (or the sidebar button on
desktop) opens a sheet that asks two questions in plain words: did money come in
or go out, and which pocket did it touch — bank or cash. The amount field is
focused on open, the last-used account is preselected, and a read-back line
("₹450 went out of ICICI Bank") spells out what saving will do. Date defaults to
today and the note is tucked behind a link, so the common case is: type amount,
tap category, save. Transfers stay behind a link and disappear entirely when
there is only one account.

**Home** — total money as a step chart (a balance holds flat until the next
transaction, so no interpolated curve invents movement), money in vs money out per month, where the money went
ranked as a bar chart, the biggest spends this month, and the cash-vs-bank
split. Money in is teal and money out is crimson everywhere in the
app; teal rather than green because green-vs-red is the pairing red-green
colour blindness destroys. Both steps were checked with a palette validator
in each theme.

**Bank & cash** — create bank or cash accounts with a starting balance (ICICI
names are offered as one-tap suggestions); each shows a running balance. Hiding
an account keeps its history but drops it from the add screen and the home
page.

**Categories** — eleven built-ins that can't be deleted, plus your own in
Settings.

## Bank statement reconciliation

Upload a CSV export for an account, and the app matches its rows against what
you logged.

**Column detection** — the header row is located by scanning the first rows for
one that has both a date and an amount, so exports that put an account summary
above the table (ICICI internet banking does) work as downloaded. Columns are
then sniffed rather than fixed, so most bank exports work as-is. It finds a date column (`Date`, `Txn Date`, `Value Date`…), a
description column (`Narration`, `Particulars`, `Description`, `Memo`…), and
either a single signed `Amount` column or separate debit/credit columns
(`Withdrawal Amt`/`Deposit Amt`, `Debit`/`Credit`, `Paid Out`/`Paid In`).
Amounts handle `₹`, Indian digit grouping, `(123.45)` and `Dr`/`Cr` suffixes;
dates handle ISO, `DD/MM/YYYY` and `DD-Mon-YYYY`. Rows without a parseable date
(subtotals, footers) are skipped rather than failing the import.

**Matching** — an exact amount match is required; two different amounts are
never the same event. Among candidates with the same amount, the winner is
scored on date proximity (within 5 days) and description similarity against your
note (Dice coefficient over character bigrams). Assignment is greedy over the
best-scoring pairs, so each statement row claims at most one transaction.

**Three buckets**

| Bucket | Meaning | What you can do |
|---|---|---|
| Matched | The statement row found your entry | Nothing — shows the confidence score |
| Missing entry | Bank has it, you never logged it | Create the entry (optionally categorised), or dismiss the row |
| Not in statement | You logged it, the bank doesn't have it | Possible duplicate or typo — review it in Transactions, or dismiss the flag |

Re-match is idempotent and re-runs against current data; dismissed rows stay
dismissed.

Try it with `samples/statement-example.csv` against a bank account.

### Adding PDF parsing later

PDF uploads are rejected today with a message pointing at CSV. To add them:

1. **Extract text.** Workers has no PDF library that runs in an isolate cheaply.
   The realistic options are `unpdf` (a Workers-targeted build of pdf.js) bundled
   into the Worker, or an R2 + queue setup that hands the file to a separate
   service. Start with `unpdf` — text-layer PDFs from banks are usually simple.
2. **Recover the table.** Bank PDFs are laid out as positioned text runs, not
   rows. Cluster the extracted items by y-coordinate into lines, then by
   x-coordinate into columns, and emit the same `ParsedRow[]` that
   `parseStatementCsv` produces.
3. **Wire it in.** Everything downstream — matching, buckets, resolution — works
   on `ParsedRow[]` and needs no changes. Only `src/lib/csv.ts`'s entrypoint and
   the `415` guard in `src/routes/reconcile.ts` change.
4. **Scanned statements** need OCR, which is not viable inside a Worker. Those
   would have to go to an external service (or Workers AI) first.

## Authentication

Single-user password gate. You POST the password; if it matches the
`APP_PASSWORD` secret the Worker returns an HMAC-signed token in an HttpOnly,
SameSite=Lax cookie (30-day expiry, `Secure` over HTTPS). There is no user
table — the token payload is just an expiry. Password and token comparisons are
constant-time. Every `/api` route except `/api/auth/*` requires a valid cookie.

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for D1 setup, secrets, and going live.
