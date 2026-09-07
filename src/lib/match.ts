/**
 * Reconciliation matcher.
 *
 * Amount equality is treated as a hard requirement — two transactions for
 * different amounts are never the same event — while date proximity and
 * description similarity decide *which* candidate wins when several manual
 * entries share an amount. Assignment is greedy over the best-scoring pairs so
 * every statement row claims at most one transaction and vice versa.
 */

export interface Candidate {
  id: number;
  date: string;
  amount: number;
  text: string; // note + category, whatever we can compare against
}

export interface Row {
  id: number;
  date: string;
  amount: number;
  description: string;
}

export interface Match {
  rowId: number;
  transactionId: number;
  confidence: number;
}

const MAX_DAY_GAP = 5;

function daysApart(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Math.round(ms / 86_400_000);
}

/** Dice coefficient over character bigrams — cheap, no deps, good enough for payee strings. */
export function similarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      set.set(g, (set.get(g) ?? 0) + 1);
    }
    return set;
  };
  const bx = bigrams(x);
  const by = bigrams(y);
  let hits = 0;
  let total = 0;
  for (const n of bx.values()) total += n;
  for (const [g, n] of by) {
    total += n;
    hits += Math.min(n, bx.get(g) ?? 0);
  }
  return total === 0 ? 0 : (2 * hits) / total;
}

function score(row: Row, cand: Candidate): number | null {
  if (row.amount !== cand.amount) return null;
  const gap = daysApart(row.date, cand.date);
  if (gap > MAX_DAY_GAP) return null;
  // 0.6 baseline for an exact amount inside the window, decaying with date gap,
  // plus up to 0.3 for a description that looks like the note the user typed.
  const dateScore = 0.6 * (1 - gap / (MAX_DAY_GAP + 1));
  const textScore = 0.3 * similarity(row.description, cand.text);
  return 0.1 + dateScore + textScore;
}

export function matchRows(rows: Row[], candidates: Candidate[]): Match[] {
  const pairs: Match[] = [];
  for (const row of rows) {
    for (const cand of candidates) {
      const s = score(row, cand);
      if (s !== null) pairs.push({ rowId: row.id, transactionId: cand.id, confidence: s });
    }
  }
  pairs.sort((a, b) => b.confidence - a.confidence);

  const usedRows = new Set<number>();
  const usedTx = new Set<number>();
  const result: Match[] = [];
  for (const p of pairs) {
    if (usedRows.has(p.rowId) || usedTx.has(p.transactionId)) continue;
    usedRows.add(p.rowId);
    usedTx.add(p.transactionId);
    result.push(p);
  }
  return result;
}
