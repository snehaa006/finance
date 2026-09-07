/**
 * Single-user password gate.
 *
 * The user posts the app password; if it matches the APP_PASSWORD secret we
 * hand back an HMAC-signed session token in an HttpOnly cookie. There is no
 * user table — the token payload is just an expiry.
 */
import type { Env } from "../types";

const COOKIE = "fin_session";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time string compare, so token/password checks don't leak timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createToken(env: Env): Promise<string> {
  const payload = String(Math.floor(Date.now() / 1000) + TTL_SECONDS);
  return `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
}

export async function verifyToken(env: Env, token: string | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(env.SESSION_SECRET, payload);
  if (!timingSafeEqual(sig, expected)) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
}

export function checkPassword(env: Env, given: string): boolean {
  if (!env.APP_PASSWORD) return false;
  return timingSafeEqual(given, env.APP_PASSWORD);
}

export function readCookie(req: Request): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE) return rest.join("=");
  }
  return null;
}

export function sessionCookie(token: string, url: URL): string {
  const secure = url.protocol === "https:" ? " Secure;" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

export function clearCookie(url: URL): string {
  const secure = url.protocol === "https:" ? " Secure;" : "";
  return `${COOKIE}=; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=0`;
}
