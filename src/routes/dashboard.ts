import { Hono } from "hono";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();

function defaultRange(q: Record<string, string>) {
  const end = q.end || new Date().toISOString().slice(0, 10);
  // Default window is the last 12 months, which is what the trend charts want.
  const start =
    q.start ||
    (() => {
      const d = new Date(`${end}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 11);
      d.setUTCDate(1);
      return d.toISOString().slice(0, 10);
    })();
  return { start, end };
}

app.get("/", async (c) => {
  const { start, end } = defaultRange(c.req.query());
  const db = c.env.DB;

  const [accounts, priorRow, deltas, byCategory, byMonth, topThisMonth] = await Promise.all([
    // Per-account balances, which also give the cash-vs-bank split and net worth.
    db
      .prepare(
        `SELECT a.id, a.name, a.type, a.starting_balance,
                a.starting_balance + COALESCE(SUM(t.amount), 0) AS balance
           FROM accounts a
           LEFT JOIN transactions t ON t.account_id = a.id
          WHERE a.archived = 0
          GROUP BY a.id
          ORDER BY a.type, a.name`,
      )
      .all(),

    // Everything that happened before the window, folded into the opening balance.
    db
      .prepare(
        `SELECT (SELECT COALESCE(SUM(starting_balance), 0) FROM accounts WHERE archived = 0)
              + (SELECT COALESCE(SUM(t.amount), 0)
                   FROM transactions t JOIN accounts a ON a.id = t.account_id
                  WHERE a.archived = 0 AND t.date < ?) AS opening`,
      )
      .bind(start)
      .first<{ opening: number }>(),

    db
      .prepare(
        `SELECT t.date, SUM(t.amount) AS delta
           FROM transactions t JOIN accounts a ON a.id = t.account_id
          WHERE a.archived = 0 AND t.date >= ? AND t.date <= ?
          GROUP BY t.date ORDER BY t.date`,
      )
      .bind(start, end)
      .all<{ date: string; delta: number }>(),

    // Spending only: transfers are internal movement, not expenditure.
    db
      .prepare(
        `SELECT COALESCE(c.name, 'Uncategorised') AS category,
                c.id AS category_id, SUM(-t.amount) AS total, COUNT(*) AS count
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
           JOIN accounts a ON a.id = t.account_id
          WHERE t.type = 'expense' AND a.archived = 0 AND t.date >= ? AND t.date <= ?
          GROUP BY c.id ORDER BY total DESC`,
      )
      .bind(start, end)
      .all(),

    db
      .prepare(
        `SELECT strftime('%Y-%m', t.date) AS month,
                COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount END), 0)  AS income,
                COALESCE(SUM(CASE WHEN t.type = 'expense' THEN -t.amount END), 0) AS expense
           FROM transactions t JOIN accounts a ON a.id = t.account_id
          WHERE a.archived = 0 AND t.date >= ? AND t.date <= ?
          GROUP BY month ORDER BY month`,
      )
      .bind(start, end)
      .all(),

    db
      .prepare(
        `SELECT COALESCE(c.name, 'Uncategorised') AS category, SUM(-t.amount) AS total
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
           JOIN accounts a ON a.id = t.account_id
          WHERE t.type = 'expense' AND a.archived = 0
            AND strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
          GROUP BY c.id ORDER BY total DESC LIMIT 5`,
      )
      .all(),
  ]);

  // Running net worth across the window.
  let running = priorRow?.opening ?? 0;
  const netWorthSeries: { date: string; value: number }[] = [
    { date: start, value: running },
  ];
  for (const d of deltas.results) {
    running += d.delta;
    netWorthSeries.push({ date: d.date, value: running });
  }
  if (netWorthSeries[netWorthSeries.length - 1].date !== end) {
    netWorthSeries.push({ date: end, value: running });
  }

  const accountRows = accounts.results as { type: string; balance: number }[];
  const sumWhere = (t: string) =>
    accountRows.filter((a) => a.type === t).reduce((s, a) => s + a.balance, 0);

  // This month and the one before it, so the headline figures can carry a
  // "compared with last month" delta instead of standing on their own.
  // Archived accounts are excluded here exactly as they are everywhere else.
  const monthTotals = (offset: 0 | 1) =>
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount END), 0)  AS income,
                COALESCE(SUM(CASE WHEN t.type = 'expense' THEN -t.amount END), 0) AS expense
           FROM transactions t JOIN accounts a ON a.id = t.account_id
          WHERE a.archived = 0
            AND strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now', 'start of month', ?)`,
      )
      .bind(offset === 0 ? "+0 months" : "-1 months")
      .first<{ income: number; expense: number }>();

  const [thisMonth, prevMonth] = await Promise.all([monthTotals(0), monthTotals(1)]);

  return c.json({
    range: { start, end },
    net_worth: running,
    bank_total: sumWhere("bank"),
    cash_total: sumWhere("cash"),
    accounts: accounts.results,
    net_worth_series: netWorthSeries,
    spending_by_category: byCategory.results,
    monthly: byMonth.results,
    top_categories_this_month: topThisMonth.results,
    this_month: thisMonth,
    prev_month: prevMonth,
  });
});

export default app;
