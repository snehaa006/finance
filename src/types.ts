export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  CURRENCY: string;
  LOCALE: string;
}

export type AccountType = "bank" | "cash";
export type TxType = "income" | "expense" | "transfer";
