import { Hono } from "hono";
import type { Env } from "../types";
import { ApiError, notFound, reqStr } from "../lib/http";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, COUNT(t.id) AS transaction_count
       FROM categories c
       LEFT JOIN transactions t ON t.category_id = c.id
      GROUP BY c.id
      ORDER BY c.is_custom ASC, c.name ASC`,
  ).all();
  return c.json(results);
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const name = reqStr(body.name, "name", 60);
  const existing = await c.env.DB.prepare(
    `SELECT id FROM categories WHERE lower(name) = lower(?)`,
  )
    .bind(name)
    .first();
  if (existing) throw new ApiError(409, "A category with that name already exists");
  const row = await c.env.DB.prepare(
    `INSERT INTO categories (name, is_custom) VALUES (?, 1) RETURNING *`,
  )
    .bind(name)
    .first();
  return c.json(row, 201);
});

app.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const name = reqStr((await c.req.json()).name, "name", 60);
  const row = await c.env.DB.prepare(
    `UPDATE categories SET name = ? WHERE id = ? RETURNING *`,
  )
    .bind(name, id)
    .first();
  if (!row) notFound("Category");
  return c.json(row);
});

/** Only custom categories can be removed; transactions fall back to uncategorised. */
app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const cat = await c.env.DB.prepare(`SELECT is_custom FROM categories WHERE id = ?`)
    .bind(id)
    .first<{ is_custom: number }>();
  if (!cat) notFound("Category");
  if (!cat.is_custom) throw new ApiError(400, "Built-in categories cannot be deleted");
  await c.env.DB.prepare(`DELETE FROM categories WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

export default app;
