import { Hono } from "hono";
import type { Env } from "./types";
import { ApiError } from "./lib/http";
import {
  checkPassword,
  clearCookie,
  createToken,
  readCookie,
  sessionCookie,
  verifyToken,
} from "./lib/auth";
import accounts from "./routes/accounts";
import categories from "./routes/categories";
import transactions from "./routes/transactions";
import dashboard from "./routes/dashboard";
import reconcile from "./routes/reconcile";

const app = new Hono<{ Bindings: Env }>();
const api = new Hono<{ Bindings: Env }>();

api.post("/auth/login", async (c) => {
  const { password } = await c.req.json().catch(() => ({ password: "" }));
  if (typeof password !== "string" || !checkPassword(c.env, password)) {
    return c.json({ error: "Incorrect password" }, 401);
  }
  const token = await createToken(c.env);
  c.header("Set-Cookie", sessionCookie(token, new URL(c.req.url)));
  return c.json({ ok: true });
});

api.post("/auth/logout", (c) => {
  c.header("Set-Cookie", clearCookie(new URL(c.req.url)));
  return c.json({ ok: true });
});

api.get("/auth/session", async (c) => {
  const ok = await verifyToken(c.env, readCookie(c.req.raw));
  return c.json({
    authenticated: ok,
    currency: c.env.CURRENCY || "INR",
    locale: c.env.LOCALE || "en-IN",
  });
});

// Everything past this point requires a valid session cookie.
api.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/")) return next();
  if (!(await verifyToken(c.env, readCookie(c.req.raw)))) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  await next();
});

api.route("/accounts", accounts);
api.route("/categories", categories);
api.route("/transactions", transactions);
api.route("/dashboard", dashboard);
api.route("/reconcile", reconcile);

api.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message }, err.status as 400);
  console.error("Unhandled API error:", err);
  return c.json({ error: "Something went wrong on the server" }, 500);
});

api.notFound((c) => c.json({ error: "No such endpoint" }, 404));

app.route("/api", api);

// Anything that isn't an API call is the React SPA, served from the assets
// binding (which handles the single-page-application fallback itself).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
