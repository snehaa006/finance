/**
 * Bank-statement CSV parsing.
 *
 * Banks disagree about almost everything, so rather than requiring one exact
 * format we sniff the header row for the columns we need and accept the common
 * shapes: a single signed `amount` column, or separate debit/credit columns.
 */
import { bad } from "./http";

export interface ParsedRow {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // signed minor units; negative = money out
}

/** RFC4180-ish parser: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function findCol(header: string[], candidates: string[]): number {
  const normalized = header.map(norm);
  for (const cand of candidates) {
    const i = normalized.indexOf(norm(cand));
    if (i !== -1) return i;
  }
  // Fall back to a substring match ("transaction date" -> "date").
  for (const cand of candidates) {
    const i = normalized.findIndex((h) => h.includes(norm(cand)));
    if (i !== -1) return i;
  }
  return -1;
}

/** Money text -> integer minor units. Handles ₹, commas, (123.45) negatives, Dr/Cr. */
export function parseMoney(raw: string): number | null {
  let s = raw.trim();
  if (s === "") return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\bdr\b/i.test(s)) sign = -1;
  if (/\bcr\b/i.test(s)) sign = 1;
  s = s.replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  if (s.startsWith("-")) {
    sign *= -1;
    s = s.slice(1);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * sign;
}

/**
 * Normalise a date cell to YYYY-MM-DD. Accepts ISO, DD/MM/YYYY and DD-MM-YYYY
 * (the common Indian bank formats), plus `DD-Mon-YYYY`.
 * Ambiguous DD/MM vs MM/DD is resolved as DD/MM, matching the en-IN default.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return null;

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    if (Number(m) > 12) [d, m] = [m, d]; // clearly MM/DD, swap back
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const dMonY = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})/);
  if (dMonY) {
    const mi = MONTHS.indexOf(dMonY[2].slice(0, 3).toLowerCase());
    if (mi !== -1) {
      const y = dMonY[3].length === 2 ? `20${dMonY[3]}` : dMonY[3];
      return `${y}-${String(mi + 1).padStart(2, "0")}-${dMonY[1].padStart(2, "0")}`;
    }
  }
  return null;
}

const DATE_COLS = ["date", "transaction date", "txn date", "value date", "posted"];
const DESC_COLS = ["description", "narration", "particulars", "details", "remarks", "memo", "payee"];
const AMOUNT_COLS = ["amount", "value", "transaction amount"];
const DEBIT_COLS = ["debit", "withdrawal", "withdrawal amt", "paid out", "dr"];
const CREDIT_COLS = ["credit", "deposit", "deposit amt", "paid in", "cr"];

/**
 * Find the header row. ICICI's internet-banking export (and several others)
 * puts account number, name and a blank line above the real header, so the
 * first row of the file is often not it. Scan a short way in for the first row
 * that has both a date column and something amount-shaped.
 */
function findHeaderRow(table: string[][]): number {
  const limit = Math.min(table.length, 25);
  for (let i = 0; i < limit; i++) {
    const row = table[i];
    if (findCol(row, DATE_COLS) === -1) continue;
    const hasAmount =
      findCol(row, AMOUNT_COLS) !== -1 ||
      findCol(row, DEBIT_COLS) !== -1 ||
      findCol(row, CREDIT_COLS) !== -1;
    if (hasAmount) return i;
  }
  return 0;
}

export function parseStatementCsv(text: string): ParsedRow[] {
  const table = parseCsv(text.replace(/^﻿/, ""));
  if (table.length < 2) bad("Statement needs a header row and at least one transaction");

  const headerRow = findHeaderRow(table);
  const header = table[headerRow];
  const dateCol = findCol(header, DATE_COLS);
  const descCol = findCol(header, DESC_COLS);
  const amountCol = findCol(header, AMOUNT_COLS);
  const debitCol = findCol(header, DEBIT_COLS);
  const creditCol = findCol(header, CREDIT_COLS);

  if (dateCol === -1) bad("Could not find a date column in the statement");
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) {
    bad("Could not find an amount column (or debit/credit columns) in the statement");
  }

  const out: ParsedRow[] = [];
  for (const row of table.slice(headerRow + 1)) {
    const date = parseDate(row[dateCol] ?? "");
    if (!date) continue; // skip subtotal/footer junk rather than failing the import

    let amount: number | null = null;
    if (debitCol !== -1 || creditCol !== -1) {
      const debit = debitCol !== -1 ? parseMoney(row[debitCol] ?? "") : null;
      const credit = creditCol !== -1 ? parseMoney(row[creditCol] ?? "") : null;
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
      else if (amountCol !== -1) amount = parseMoney(row[amountCol] ?? "");
    } else {
      amount = parseMoney(row[amountCol] ?? "");
    }
    if (amount === null || amount === 0) continue;

    out.push({
      date,
      description: (descCol !== -1 ? row[descCol] ?? "" : "").trim().slice(0, 500),
      amount,
    });
  }

  if (out.length === 0) bad("No usable transaction rows found in the statement");
  return out;
}
