-- Personal finance tracker: initial schema.
-- Money is stored as a SIGNED integer in minor units (paise). Negative = money
-- leaving the account, positive = money arriving. Balance for an account is
-- therefore just starting_balance + SUM(amount), with no per-type branching.

CREATE TABLE accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  type            TEXT    NOT NULL CHECK (type IN ('bank', 'cash')),
  starting_balance INTEGER NOT NULL DEFAULT 0,
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  is_custom  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE transactions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id            INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id           INTEGER          REFERENCES categories(id) ON DELETE SET NULL,
  amount                INTEGER NOT NULL,
  type                  TEXT    NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  date                  TEXT    NOT NULL,
  note                  TEXT,
  source                TEXT    NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual', 'statement_import')),
  reconciliation_status TEXT    NOT NULL DEFAULT 'unreconciled'
                          CHECK (reconciliation_status IN ('unreconciled', 'matched', 'flagged', 'ignored')),
  -- Both legs of a transfer share this id so they can be edited/deleted together.
  transfer_group_id     TEXT,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tx_account_date ON transactions(account_id, date);
CREATE INDEX idx_tx_date         ON transactions(date);
CREATE INDEX idx_tx_category     ON transactions(category_id);
CREATE INDEX idx_tx_transfer     ON transactions(transfer_group_id);

CREATE TABLE statement_imports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  filename    TEXT    NOT NULL,
  uploaded_at TEXT    NOT NULL DEFAULT (datetime('now')),
  row_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE statement_rows (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id             INTEGER NOT NULL REFERENCES statement_imports(id) ON DELETE CASCADE,
  date                  TEXT    NOT NULL,
  description           TEXT    NOT NULL DEFAULT '',
  amount                INTEGER NOT NULL,
  match_status          TEXT    NOT NULL DEFAULT 'unmatched'
                          CHECK (match_status IN ('matched', 'unmatched', 'ignored')),
  matched_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  match_confidence      REAL    NOT NULL DEFAULT 0
);

CREATE INDEX idx_rows_import ON statement_rows(import_id);

INSERT INTO categories (name, is_custom) VALUES
  ('Food', 0), ('Transport', 0), ('Bills', 0), ('Gifts', 0), ('Shopping', 0),
  ('Rent', 0), ('Entertainment', 0), ('Health', 0), ('Salary/Income', 0),
  ('Investments', 0), ('Other', 0);
