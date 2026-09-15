# CampusPay

A campus payment system for **Bishop Heber College (Autonomous), Tiruchirappalli**, built by the college's Fintech Association. One wallet that works across all five campus outlets, with round-up savings, event registration and a department points leaderboard.

Sized for roughly 13,000 students and 2,000 staff across 24 departments.

---

## What it does

| Feature | Detail |
|---|---|
| Register-number sign-in | Login enforces exactly 9 digits, matching BHC register numbers |
| Campus wallet | Top up once, pay anywhere on campus |
| Round-up savings | Each payment rounds to the next ₹10; the difference goes to a savings pot |
| QR payments | Camera scan via `BarcodeDetector`, with a vendor picker as fallback |
| Spend reports | Per-vendor and per-month breakdowns for each student |
| Vendor analytics | Campus-wide sales totals and average ticket per outlet |
| Events | Paid and free registration, seats tracked, fees debited from the wallet |
| Department leaderboard | Campus points roll up by department |
| Budget goals | Monthly spend cap with remaining balance |
| Bank linking | Stores bank name, UPI ID and last 4 digits only |
| Vendor ratings | One rating per student per outlet |

### Campus vendors seeded

GJ Canteen · GJ Stationery · Students Cafeteria · Science Cafeteria · Xerox & Stationery Shop

---

## Running it

```bash
git clone https://github.com/Tawz-star/campuspay.git
cd campuspay
npm install
cp .env.example .env        # then edit JWT_SECRET
node db/seed.js             # creates the database and loads departments, vendors, events
npm start
```

Open <http://localhost:3000>.

**Demo login:** register number `231234567`, password `campus123`.

To wipe and rebuild the database:

```bash
npm run db:reset && node db/seed.js
```

---

## Database

SQLite via `better-sqlite3`. The file lives at `db/campuspay.db` and is gitignored — the schema in `db/schema.sql` is the source of truth.

All money is stored as **integer paise**, never floats, so totals never drift.

Tables: `departments`, `users`, `wallets`, `bank_accounts`, `vendors`, `transactions`, `events`, `event_registrations`, `budget_goals`, `vendor_ratings`.
Views: `v_vendor_sales`, `v_department_leaderboard`.

Moving to Postgres later is mostly mechanical: swap `INTEGER PRIMARY KEY AUTOINCREMENT` for `SERIAL`, `TEXT DEFAULT (datetime('now'))` for `TIMESTAMPTZ DEFAULT now()`, and replace `strftime('%Y-%m', …)` with `to_char(…, 'YYYY-MM')`.

---

## API

All authenticated routes take `Authorization: Bearer <token>`.

**Auth**
- `POST /api/auth/register` — `{ register_number, name, password, department_id }`
- `POST /api/auth/login` — `{ register_number, password }`
- `GET  /api/auth/me`

**Wallet**
- `GET  /api/wallet`
- `POST /api/wallet/topup` — `{ amount }`
- `POST /api/wallet/savings/withdraw` — `{ amount? }`
- `POST /api/wallet/roundup` — `{ enabled }`
- `GET|POST /api/wallet/banks`, `DELETE /api/wallet/banks/:id`
- `GET|POST /api/wallet/budget`

**Payments**
- `POST /api/payments/pay` — `{ vendor_id | qr_code, amount, note? }`
- `GET  /api/payments/transactions`
- `GET  /api/payments/transactions/:reference`
- `GET  /api/payments/reports/by-vendor`
- `GET  /api/payments/reports/monthly`

**Vendors** — `GET /api/vendors`, `GET /api/vendors/analytics`, `POST /api/vendors/:id/rate`

**Events** — `GET /api/events`, `POST /api/events/:id/register`, `GET /api/events/my/registrations`

**Leaderboard** — `GET /api/leaderboard/departments`, `/students`, `/departments/list`

---

## Before this handles real money

This is a working college project, not a licensed payment system. Real deployment would need: a PPI licence or a partner bank, an actual PSP for top-ups instead of the direct wallet credit, signed QR payloads rather than plain code strings, rate limiting, audit logging, and HTTPS with secure cookies.

---

Built by the Fintech Association, Bishop Heber College (Autonomous), Tiruchirappalli.
