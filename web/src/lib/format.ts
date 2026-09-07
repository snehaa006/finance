/**
 * All money in this app is an integer number of minor units (paise). Nothing
 * downstream should ever see a float rupee value except at render time.
 */
const CURRENCY = "INR";
const LOCALE = "en-IN";

const full = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
});

const compact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

export function formatMoney(minor: number, opts?: { signed?: boolean; compact?: boolean }): string {
  const fmt = opts?.compact ? compact : full;
  const text = fmt.format(Math.abs(minor) / 100);
  if (!opts?.signed) return minor < 0 ? `-${text}` : text;
  return `${minor < 0 ? "−" : "+"}${text}`;
}

/** "1234.5" (rupees, as typed) -> 123450 (paise). */
export function toMinor(input: string): number {
  const n = Number(String(input).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function toMajorString(minor: number): string {
  return (Math.abs(minor) / 100).toFixed(2);
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, { day: "2-digit", month: "short" });
}

export function formatMonth(ym: string): string {
  return new Date(`${ym}-01T00:00:00`).toLocaleDateString(LOCALE, {
    month: "short",
    year: "2-digit",
  });
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfMonth(): string {
  return `${today().slice(0, 7)}-01`;
}

export function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
