import { Hono } from "hono";
import type { Env } from "../types";
import { notFound, oneOf, reqInt, reqStr } from "../lib/http";

const app = new Hono<{ Bindings: Env }>();

/** Accounts with their live balance (starting balance + sum of transactions). */
app.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.name, a.type, a.starting_balance, a.archived, a.created_at,
            a.starting_balance + COALESCE(SUM(t.amount), 0) AS balance,
            COUNT(t.id) AS transaction_count
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
      GROUP BY a.id
      ORDER BY a.archived ASC, a.type ASC, a.name ASC`,
  ).all();
  return c.json(results);
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const name = reqStr(body.name, "name", 100);
  const type = oneOf(body.type, ["bank", "cash"] as const, "type");
  const starting = reqInt(body.starting_balance ?? 0, "starting_balance");
  const row = await c.env.DB.prepare(
    `INSERT INTO accounts (name, type, starting_balance) VALUES (?, ?, ?) RETURNING *`,
  )
    .bind(name, type, starting)
    .first();
  return c.json(row, 201);
});

app.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const name = reqStr(body.name, "name", 100);
  const type = oneOf(body.type, ["bank", "cash"] as const, "type");
  const starting = reqInt(body.starting_balance ?? 0, "starting_balance");
  const archived = body.archived ? 1 : 0;
  const row = await c.env.DB.prepare(
    `UPDATE accounts SET name = ?, type = ?, starting_balance = ?, archived = ?
      WHERE id = ? RETURNING *`,
  )
    .bind(name, type, starting, archived, id)
    .first();
  if (!row) notFound("Account");
  return c.json(row);
});

/** Deleting an account cascades to its transactions and statement imports. */
app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const res = await c.env.DB.prepare(`DELETE FROM accounts WHERE id = ?`).bind(id).run();
  if (!res.meta.changes) notFound("Account");
  return c.json({ ok: true });
});

export default app;
