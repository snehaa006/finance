-- Optional sample data for local development: `npm run db:seed:local`.
-- Amounts are in paise. Safe to run on an empty database only.
INSERT INTO accounts (name, type, starting_balance) VALUES
  ('ICICI Bank', 'bank', 5000000),
  ('Cash in hand', 'cash', 300000);

INSERT INTO transactions (account_id, category_id, amount, type, date, note) VALUES
  (1, (SELECT id FROM categories WHERE name = 'Salary/Income'),  9000000, 'income',  date('now', 'start of month'),            'Monthly salary'),
  (1, (SELECT id FROM categories WHERE name = 'Rent'),          -2500000, 'expense', date('now', 'start of month', '+1 day'),  'Rent'),
  (1, (SELECT id FROM categories WHERE name = 'Food'),             -45000, 'expense', date('now', 'start of month', '+2 day'), 'Groceries'),
  (2, (SELECT id FROM categories WHERE name = 'Transport'),        -12000, 'expense', date('now', 'start of month', '+3 day'), 'Auto rickshaw');
