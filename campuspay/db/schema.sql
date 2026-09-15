-- CampusPay database schema (SQLite)
-- Bishop Heber College (Autonomous), Tiruchirappalli
-- All money is stored in paise (integers) to avoid floating point errors.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------
-- Departments: 24 academic departments across two schools
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  school      TEXT NOT NULL CHECK (school IN ('Arts & Humanities', 'Science & Technology')),
  code        TEXT NOT NULL UNIQUE
);

-- ---------------------------------------------------------------
-- Users: students and faculty. Register number is exactly 9 digits.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  register_number TEXT NOT NULL UNIQUE CHECK (length(register_number) = 9 AND register_number GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'faculty', 'vendor', 'admin')),
  department_id   INTEGER REFERENCES departments(id),
  email           TEXT UNIQUE,
  phone           TEXT,
  password_hash   TEXT NOT NULL,
  campus_points   INTEGER NOT NULL DEFAULT 0,
  roundup_enabled INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);

-- ---------------------------------------------------------------
-- Wallets: one spendable wallet + one savings pot per user
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_paise   INTEGER NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  savings_paise   INTEGER NOT NULL DEFAULT 0 CHECK (savings_paise >= 0),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------
-- Linked bank accounts (masked storage only — no full account numbers)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_name     TEXT NOT NULL,
  account_last4 TEXT NOT NULL CHECK (length(account_last4) = 4),
  upi_id        TEXT,
  is_primary    INTEGER NOT NULL DEFAULT 0,
  linked_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bank_user ON bank_accounts(user_id);

-- ---------------------------------------------------------------
-- Vendors: the five campus outlets
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,
  location    TEXT,
  qr_code     TEXT NOT NULL UNIQUE,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------
-- Transactions: every movement of money
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reference      TEXT NOT NULL UNIQUE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_id      INTEGER REFERENCES vendors(id),
  type           TEXT NOT NULL CHECK (type IN ('topup', 'payment', 'roundup', 'refund', 'event_fee', 'transfer')),
  amount_paise   INTEGER NOT NULL CHECK (amount_paise > 0),
  roundup_paise  INTEGER NOT NULL DEFAULT 0,
  points_earned  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_vendor_date ON transactions(vendor_id, created_at DESC);

-- ---------------------------------------------------------------
-- Events: fests, workshops, seminars with paid or free registration
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  description    TEXT,
  organiser      TEXT,
  venue          TEXT,
  starts_at      TEXT NOT NULL,
  fee_paise      INTEGER NOT NULL DEFAULT 0,
  seats_total    INTEGER NOT NULL DEFAULT 100,
  seats_taken    INTEGER NOT NULL DEFAULT 0,
  points_reward  INTEGER NOT NULL DEFAULT 10,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id INTEGER REFERENCES transactions(id),
  status         TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  registered_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, user_id)
);

-- ---------------------------------------------------------------
-- Budget goals: monthly spend caps students set for themselves
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_goals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,             -- 'YYYY-MM'
  limit_paise  INTEGER NOT NULL CHECK (limit_paise > 0),
  UNIQUE (user_id, month)
);

-- ---------------------------------------------------------------
-- Vendor ratings
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_ratings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id  INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (vendor_id, user_id)
);

-- ---------------------------------------------------------------
-- Views used by the reports and leaderboard screens
-- ---------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_vendor_sales AS
SELECT v.id            AS vendor_id,
       v.name          AS vendor_name,
       COUNT(t.id)     AS txn_count,
       COALESCE(SUM(t.amount_paise), 0) AS total_paise,
       COALESCE(AVG(t.amount_paise), 0) AS avg_paise
FROM vendors v
LEFT JOIN transactions t
  ON t.vendor_id = v.id AND t.type = 'payment' AND t.status = 'success'
GROUP BY v.id;

CREATE VIEW IF NOT EXISTS v_department_leaderboard AS
SELECT d.id                          AS department_id,
       d.name                        AS department_name,
       d.school                      AS school,
       COUNT(DISTINCT u.id)          AS member_count,
       COALESCE(SUM(u.campus_points), 0) AS total_points
FROM departments d
LEFT JOIN users u ON u.department_id = d.id
GROUP BY d.id;
