import { Hono } from "hono";
import type { Env } from "../types";
import { ApiError, bad, notFound, reqInt } from "../lib/http";
import { parseStatementCsv } from "../lib/csv";
import { matchRows, type Candidate, type Row } from "../lib/match";

const app = new Hono<{ Bindings: Env }>();

/** Re-run matching for an import and persist the outcome. Idempotent. */
async function runMatching(env: Env, importId: number): Promise<void> {
  const imp = await env.DB.prepare(`SELECT * FROM statement_imports WHERE id = ?`)
    .bind(importId)
    .first<{ account_id: number }>();
  if (!imp) notFound("Import");

  const { results: rowRecords } = await env.DB.prepare(
    `SELECT id, date, amount, description, match_status FROM statement_rows WHERE import_id = ?`,
  )
    .bind(importId)
    .all<Row & { match_status: string }>();

  // Rows the user explicitly dismissed stay dismissed across re-runs.
  const active = rowRecords.filter((r) => r.match_status !== "ignored");
  if (active.length === 0) return;

  const dates = active.map((r) => r.date).sort();
  const lo = shiftDate(dates[0], -7);
  const hi = shiftDate(dates[dates.length - 1], 7);

  const { results: candidates } = await env.DB.prepare(
    `SELECT t.id, t.date, t.amount,
            COALESCE(t.note, '') || ' ' || COALESCE(c.name, '') AS text
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.account_id = ? AND t.date >= ? AND t.date <= ?
        AND t.reconciliation_status != 'ignored'`,
  )
    .bind(imp.account_id, lo, hi)
    .all<Candidate>();

  const matches = matchRows(active, candidates);

  const stmts = [
    // Reset before re-applying so a re-run can also *unmatch* things.
    env.DB.prepare(
      `UPDATE statement_rows SET match_status = 'unmatched', matched_transaction_id = NULL,
              match_confidence = 0
        WHERE import_id = ? AND match_status != 'ignored'`,
    ).bind(importId),
    env.DB.prepare(
      `UPDATE transactions SET reconciliation_status = 'unreconciled'
        WHERE account_id = ? AND reconciliation_status = 'matched'`,
    ).bind(imp.account_id),
  ];
  for (const m of matches) {
    stmts.push(
      env.DB.prepare(
        `UPDATE statement_rows SET match_status = 'matched', matched_transaction_id = ?,
                match_confidence = ? WHERE id = ?`,
      ).bind(m.transactionId, Number(m.confidence.toFixed(3)), m.rowId),
      env.DB.prepare(
        `UPDATE transactions SET reconciliation_status = 'matched' WHERE id = ?`,
      ).bind(m.transactionId),
    );
  }
  await env.DB.batch(stmts);
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** POST /api/reconcile/imports — upload and parse a CSV statement. */
app.post("/imports", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file") as unknown as { name?: string; text(): Promise<string> } | null;
  const accountId = Number(form.get("account_id"));
  if (!file || typeof file.text !== "function") bad("A CSV file is required");
  if (!Number.isInteger(accountId)) bad("account_id is required");

  const account = await c.env.DB.prepare(`SELECT id, type FROM accounts WHERE id = ?`)
    .bind(accountId)
    .first();
  if (!account) notFound("Account");

  const name = file.name || "statement.csv";
  if (/\.pdf$/i.test(name)) {
    throw new ApiError(
      415,
      "PDF statements aren't supported yet — export your statement as CSV and upload that.",
    );
  }

  const rows = parseStatementCsv(await file.text());

  const imp = await c.env.DB.prepare(
    `INSERT INTO statement_imports (account_id, filename, row_count) VALUES (?, ?, ?) RETURNING id`,
  )
    .bind(accountId, name.slice(0, 200), rows.length)
    .first<{ id: number }>();

  // D1 caps statements per batch, so insert in chunks for large statements.
  for (let i = 0; i < rows.length; i += 50) {
    await c.env.DB.batch(
      rows.slice(i, i + 50).map((r) =>
        c.env.DB.prepare(
          `INSERT INTO statement_rows (import_id, date, description, amount) VALUES (?, ?, ?, ?)`,
        ).bind(imp!.id, r.date, r.description, r.amount),
      ),
    );
  }

  await runMatching(c.env, imp!.id);
  return c.json({ id: imp!.id, row_count: rows.length }, 201);
});

app.get("/imports", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.*, a.name AS account_name,
            (SELECT COUNT(*) FROM statement_rows r
              WHERE r.import_id = i.id AND r.match_status = 'unmatched') AS unmatched_count
       FROM statement_imports i JOIN accounts a ON a.id = i.account_id
      ORDER BY i.uploaded_at DESC, i.id DESC`,
  ).all();
  return c.json(results);
});

/** GET /api/reconcile/imports/:id — the three reconciliation buckets. */
app.get("/imports/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const imp = await c.env.DB.prepare(
    `SELECT i.*, a.name AS account_name, a.type AS account_type
       FROM statement_imports i JOIN accounts a ON a.id = i.account_id WHERE i.id = ?`,
  )
    .bind(id)
    .first<{ account_id: number }>();
  if (!imp) notFound("Import");

  const { results: rows } = await c.env.DB.prepare(
    `SELECT r.*, t.note AS matched_note, t.date AS matched_date, t.amount AS matched_amount,
            c.name AS matched_category
       FROM statement_rows r
       LEFT JOIN transactions t ON t.id = r.matched_transaction_id
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE r.import_id = ? ORDER BY r.date, r.id`,
  )
    .bind(id)
    .all<{ id: number; date: string; match_status: string; matched_transaction_id: number | null }>();

  const dates = rows.map((r) => r.date).sort();
  const lo = dates[0] ?? "9999-12-31";
  const hi = dates[dates.length - 1] ?? "0000-01-01";
  const matchedIds = rows.map((r) => r.matched_transaction_id).filter((x): x is number => !!x);

  // Bucket 3: entries the user logged for this account inside the statement's
  // date span that no statement row claimed — a possible duplicate or typo.
  const placeholders = matchedIds.length ? matchedIds.map(() => "?").join(",") : "NULL";
  const { results: unmatchedInApp } = await c.env.DB.prepare(
    `SELECT t.id, t.date, t.amount, t.note, t.type, t.reconciliation_status,
            c.name AS category_name
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.account_id = ? AND t.date >= ? AND t.date <= ?
        AND t.reconciliation_status != 'ignored'
        AND t.id NOT IN (${placeholders})
      ORDER BY t.date, t.id`,
  )
    .bind(imp.account_id, lo, hi, ...matchedIds)
    .all();

  return c.json({
    import: imp,
    matched: rows.filter((r) => r.match_status === "matched"),
    missing_in_app: rows.filter((r) => r.match_status === "unmatched"),
    ignored_rows: rows.filter((r) => r.match_status === "ignored"),
    missing_in_statement: unmatchedInApp,
  });
});

app.post("/imports/:id/rematch", async (c) => {
  await runMatching(c.env, Number(c.req.param("id")));
  return c.json({ ok: true });
});

app.delete("/imports/:id", async (c) => {
  const res = await c.env.DB.prepare(`DELETE FROM statement_imports WHERE id = ?`)
    .bind(Number(c.req.param("id")))
    .run();
  if (!res.meta.changes) notFound("Import");
  return c.json({ ok: true });
});

/** Turn a statement row the user never logged into a real transaction. */
app.post("/rows/:id/create-entry", async (c) => {
  const rowId = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const row = await c.env.DB.prepare(
    `SELECT r.*, i.account_id FROM statement_rows r
       JOIN statement_imports i ON i.id = r.import_id WHERE r.id = ?`,
  )
    .bind(rowId)
    .first<{ id: number; date: string; description: string; amount: number; account_id: number }>();
  if (!row) notFound("Statement row");

  const categoryId = body.category_id ? reqInt(body.category_id, "category_id") : null;
  const created = await c.env.DB.prepare(
    `INSERT INTO transactions
       (account_id, category_id, amount, type, date, note, source, reconciliation_status)
     VALUES (?, ?, ?, ?, ?, ?, 'statement_import', 'matched') RETURNING id`,
  )
    .bind(
      row.account_id,
      categoryId,
      row.amount,
      row.amount > 0 ? "income" : "expense",
      row.date,
      body.note ?? row.description,
    )
    .first<{ id: number }>();

  await c.env.DB.prepare(
    `UPDATE statement_rows SET match_status = 'matched', matched_transaction_id = ?,
            match_confidence = 1 WHERE id = ?`,
  )
    .bind(created!.id, rowId)
    .run();
  return c.json({ ok: true, transaction_id: created!.id }, 201);
});

/** Manually link a statement row to an existing transaction. */
app.post("/rows/:id/link", async (c) => {
  const rowId = Number(c.req.param("id"));
  const txId = reqInt((await c.req.json()).transaction_id, "transaction_id");
  const tx = await c.env.DB.prepare(`SELECT id FROM transactions WHERE id = ?`).bind(txId).first();
  if (!tx) notFound("Transaction");
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE statement_rows SET match_status = 'matched', matched_transaction_id = ?,
              match_confidence = 1 WHERE id = ?`,
    ).bind(txId, rowId),
    c.env.DB.prepare(
      `UPDATE transactions SET reconciliation_status = 'matched' WHERE id = ?`,
    ).bind(txId),
  ]);
  return c.json({ ok: true });
});

app.post("/rows/:id/ignore", async (c) => {
  const res = await c.env.DB.prepare(
    `UPDATE statement_rows SET match_status = 'ignored', matched_transaction_id = NULL WHERE id = ?`,
  )
    .bind(Number(c.req.param("id")))
    .run();
  if (!res.meta.changes) notFound("Statement row");
  return c.json({ ok: true });
});

app.post("/rows/:id/unignore", async (c) => {
  await c.env.DB.prepare(`UPDATE statement_rows SET match_status = 'unmatched' WHERE id = ?`)
    .bind(Number(c.req.param("id")))
    .run();
  return c.json({ ok: true });
});

/** Dismiss a "logged but not in the statement" flag. */
app.post("/transactions/:id/ignore", async (c) => {
  const res = await c.env.DB.prepare(
    `UPDATE transactions SET reconciliation_status = 'ignored' WHERE id = ?`,
  )
    .bind(Number(c.req.param("id")))
    .run();
  if (!res.meta.changes) notFound("Transaction");
  return c.json({ ok: true });
});

export default app;
