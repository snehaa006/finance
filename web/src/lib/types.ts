export type AccountType = "bank" | "cash";
export type TxType = "income" | "expense" | "transfer";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  starting_balance: number;
  archived: number;
  created_at: string;
  balance: number;
  transaction_count: number;
}

export interface Category {
  id: number;
  name: string;
  is_custom: number;
  transaction_count: number;
}

export interface Transaction {
  id: number;
  account_id: number;
  category_id: number | null;
  /** Signed minor units: negative means money left the account. */
  amount: number;
  type: TxType;
  date: string;
  note: string | null;
  source: "manual" | "statement_import";
  reconciliation_status: "unreconciled" | "matched" | "flagged" | "ignored";
  transfer_group_id: string | null;
  account_name: string;
  account_type: AccountType;
  category_name: string | null;
}

export interface TransactionPage {
  transactions: Transaction[];
  total: number;
  inflow: number;
  outflow: number;
  limit: number;
  offset: number;
}

export interface DashboardData {
  range: { start: string; end: string };
  net_worth: number;
  bank_total: number;
  cash_total: number;
  accounts: { id: number; name: string; type: AccountType; balance: number }[];
  net_worth_series: { date: string; value: number }[];
  spending_by_category: { category: string; category_id: number | null; total: number; count: number }[];
  monthly: { month: string; income: number; expense: number }[];
  top_categories_this_month: { category: string; total: number }[];
  this_month: { income: number; expense: number };
  prev_month: { income: number; expense: number };
}

export interface StatementImport {
  id: number;
  account_id: number;
  filename: string;
  uploaded_at: string;
  row_count: number;
  account_name: string;
  unmatched_count: number;
}

export interface StatementRow {
  id: number;
  import_id: number;
  date: string;
  description: string;
  amount: number;
  match_status: "matched" | "unmatched" | "ignored";
  matched_transaction_id: number | null;
  match_confidence: number;
  matched_note: string | null;
  matched_date: string | null;
  matched_amount: number | null;
  matched_category: string | null;
}

export interface ReconciliationView {
  import: StatementImport & { account_type: AccountType };
  matched: StatementRow[];
  missing_in_app: StatementRow[];
  ignored_rows: StatementRow[];
  missing_in_statement: {
    id: number;
    date: string;
    amount: number;
    note: string | null;
    type: TxType;
    category_name: string | null;
  }[];
}
