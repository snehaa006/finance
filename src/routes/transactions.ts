import { Hono } from "hono";
import type { Env } from "../types";
import { ApiError, bad, notFound, oneOf, optStr, reqDate, reqInt, reqStr } from "../lib/http";

const app = new Hono<{ Bindings: Env }>();

const SELECT = `
  SELECT t.id, t.account_id, t.category_id, t.amount, t.type, t.date, t.note,
         t.source, t.reconciliation_status, t.transfer_group_id, t.created_at,
         a.name AS account_name, a.type AS account_type,
         c.name AS category_name
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id`;

/** GET /api/transactions — filterable, paginated list. */
app.get("/", async (c) => {
  const q = c.req.query();
  const where: string[] = [];
  const binds: unknown[] = [];

  if (q.start) {
    where.push("t.date >= ?");
    binds.push(q.start);
  }
  if (q.end) {
    where.push("t.date <= ?");
    binds.push(q.end);
  }
  if (q.account_id) {
    where.push("t.account_id = ?");
    binds.push(Number(q.account_id));
  }
  if (q.category_id) {
    where.push("t.category_id = ?");
    binds.push(Number(q.category_id));
  }
  if (q.type) {
    where.push("t.type = ?");
    binds.push(q.type);
  }
  if (q.account_type) {
    where.push("a.type = ?");
    binds.push(q.account_type);
  }
  if (q.search) {
    where.push("(t.note LIKE ? OR c.name LIKE ? OR a.name LIKE ?)");
    const like = `%${q.search}%`;
    binds.push(like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Number(q.limit) || 100, 500);
  const offset = Number(q.offset) || 0;

  const [list, total] = await Promise.all([
    c.env.DB.prepare(
      `${SELECT} ${clause} ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`,
    )
      .bind(...binds, limit, offset)
      .all(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount END), 0) AS inflow,
              COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount END), 0) AS outflow
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id ${clause}`,
    )
      .bind(...binds)
      .first<{ n: number; inflow: number; outflow: number }>(),
  ]);

  return c.json({
    transactions: list.results,
    total: total?.n ?? 0,
    inflow: total?.inflow ?? 0,
    outflow: total?.outflow ?? 0,
    limit,
    offset,
  });
});

/**
 * Amounts arrive from the client as a positive magnitude; the sign is derived
 * from the transaction type so the DB invariant (negative = money out) holds no
 * matter which form submitted it.
 */
function signedAmount(magnitude: number, type: string): number {
  const abs = Math.abs(magnitude);
  if (abs === 0) bad("amount must be greater than zero");
  return type === "income" ? abs : -abs;
}

async function assertAccount(env: Env, id: number): Promise<void> {
  const found = await env.DB.prepare(`SELECT id FROM accounts WHERE id = ?`).bind(id).first();
  if (!found) notFound(`Account ${id}`);
}

app.post("/", async (c) => {
  const body = await c.req.json();
  const type = oneOf(body.type, ["income", "expense", "transfer"] as const, "type");
  const accountId = reqInt(body.account_id, "account_id");
  const amount = reqInt(body.amount, "amount");
  const date = reqDate(body.date, "date");
  const note = optStr(body.note);
  const categoryId = body.category_id ? reqInt(body.category_id, "category_id") : null;
  await assertAccount(c.env, accountId);

  if (type === "transfer") {
    const toId = reqInt(body.to_account_id, "to_account_id");
    if (toId === accountId) bad("A transfer needs two different accounts");
    await assertAccount(c.env, toId);
    const group = crypto.randomUUID();
    const abs = Math.abs(amount);
    if (abs === 0) bad("amount must be greater than zero");
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO transactions (account_id, category_id, amount, type, date, note, transfer_group_id)
         VALUES (?, ?, ?, 'transfer', ?, ?, ?)`,
      ).bind(accountId, categoryId, -abs, date, note, group),
      c.env.DB.prepare(
        `INSERT INTO transactions (account_id, category_id, amount, type, date, note, transfer_group_id)
         VALUES (?, ?, ?, 'transfer', ?, ?, ?)`,
      ).bind(toId, categoryId, abs, date, note, group),
    ]);
    const { results } = await c.env.DB.prepare(
      `${SELECT} WHERE t.transfer_group_id = ? ORDER BY t.amount ASC`,
    )
      .bind(group)
      .all();
    return c.json(results, 201);
  }

  const row = await c.env.DB.prepare(
    `INSERT INTO transactions (account_id, category_id, amount, type, date, note, source)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      accountId,
      categoryId,
      signedAmount(amount, type),
      type,
      date,
      note,
      body.source === "statement_import" ? "statement_import" : "manual",
    )
    .first<{ id: number }>();

  const created = await c.env.DB.prepare(`${SELECT} WHERE t.id = ?`).bind(row!.id).first();
  return c.json(created, 201);
});

app.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const existing = await c.env.DB.prepare(`SELECT * FROM transactions WHERE id = ?`)
    .bind(id)
    .first<{ type: string; transfer_group_id: string | null; amount: number }>();
  if (!existing) notFound("Transaction");

  const date = reqDate(body.date, "date");
  const note = optStr(body.note);
  const categoryId = body.category_id ? reqInt(body.category_id, "category_id") : null;
  const amount = reqInt(body.amount, "amount");

  // Both legs of a transfer must stay in lockstep, so edit them as a unit.
  if (existing.transfer_group_id) {
    const abs = Math.abs(amount);
    if (abs === 0) bad("amount must be greater than zero");
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE transactions SET amount = ?, date = ?, note = ?, category_id = ?
          WHERE transfer_group_id = ? AND amount < 0`,
      ).bind(-abs, date, note, categoryId, existing.transfer_group_id),
      c.env.DB.prepare(
        `UPDATE transactions SET amount = ?, date = ?, note = ?, category_id = ?
          WHERE transfer_group_id = ? AND amount > 0`,
      ).bind(abs, date, note, categoryId, existing.transfer_group_id),
    ]);
    const updated = await c.env.DB.prepare(`${SELECT} WHERE t.id = ?`).bind(id).first();
    return c.json(updated);
  }

  const type = oneOf(body.type, ["income", "expense"] as const, "type");
  const accountId = reqInt(body.account_id, "account_id");
  await assertAccount(c.env, accountId);
  await c.env.DB.prepare(
    `UPDATE transactions
        SET account_id = ?, category_id = ?, amount = ?, type = ?, date = ?, note = ?
      WHERE id = ?`,
  )
    .bind(accountId, categoryId, signedAmount(amount, type), type, date, note, id)
    .run();
  const updated = await c.env.DB.prepare(`${SELECT} WHERE t.id = ?`).bind(id).first();
  return c.json(updated);
});

app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare(
    `SELECT transfer_group_id FROM transactions WHERE id = ?`,
  )
    .bind(id)
    .first<{ transfer_group_id: string | null }>();
  if (!existing) notFound("Transaction");

  if (existing.transfer_group_id) {
    await c.env.DB.prepare(`DELETE FROM transactions WHERE transfer_group_id = ?`)
      .bind(existing.transfer_group_id)
      .run();
  } else {
    await c.env.DB.prepare(`DELETE FROM transactions WHERE id = ?`).bind(id).run();
  }
  return c.json({ ok: true });
});

export default app;
