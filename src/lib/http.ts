/** Small helpers for consistent error handling across routes. */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function bad(message: string): never {
  throw new ApiError(400, message);
}

export function notFound(what: string): never {
  throw new ApiError(404, `${what} not found`);
}

/** Parse+validate an integer that must be present. */
export function reqInt(v: unknown, field: string): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    bad(`${field} must be an integer`);
  }
  return n as number;
}

export function reqStr(v: unknown, field: string, max = 500): string {
  if (typeof v !== "string" || v.trim() === "") bad(`${field} is required`);
  const s = (v as string).trim();
  if (s.length > max) bad(`${field} is too long`);
  return s;
}

export function optStr(v: unknown, max = 2000): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  return v.trim().slice(0, max);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function reqDate(v: unknown, field: string): string {
  const s = reqStr(v, field, 10);
  if (!DATE_RE.test(s)) bad(`${field} must be YYYY-MM-DD`);
  return s;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    bad(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return v as T;
}
