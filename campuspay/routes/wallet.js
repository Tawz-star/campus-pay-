const express = require('express');
const crypto = require('crypto');
const { db, toPaise, toRupees } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const ref = (prefix) => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase();

router.get('/', (req, res) => {
  const w = db.prepare('SELECT balance_paise, savings_paise, updated_at FROM wallets WHERE user_id = ?').get(req.user.id);
  if (!w) return res.status(404).json({ error: 'No wallet found for this account.' });
  res.json({
    balance: toRupees(w.balance_paise),
    savings: toRupees(w.savings_paise),
    balance_paise: w.balance_paise,
    savings_paise: w.savings_paise,
    updated_at: w.updated_at,
  });
});

router.post('/topup', (req, res) => {
  const amount = toPaise(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter an amount above zero.' });
  if (amount > 2000000) return res.status(400).json({ error: 'Single top-up limit is ₹20,000.' });

  const run = db.transaction(() => {
    db.prepare('UPDATE wallets SET balance_paise = balance_paise + ?, updated_at = datetime(\'now\') WHERE user_id = ?')
      .run(amount, req.user.id);
    db.prepare(`INSERT INTO transactions (reference, user_id, type, amount_paise, note)
                VALUES (?, ?, 'topup', ?, ?)`)
      .run(ref('TOP'), req.user.id, amount, req.body?.note || 'Wallet top-up');
  });
  run();

  const w = db.prepare('SELECT balance_paise, savings_paise FROM wallets WHERE user_id = ?').get(req.user.id);
  res.json({ balance: toRupees(w.balance_paise), savings: toRupees(w.savings_paise) });
});

// Move the savings pot back into the spendable balance.
router.post('/savings/withdraw', (req, res) => {
  const w = db.prepare('SELECT savings_paise FROM wallets WHERE user_id = ?').get(req.user.id);
  const amount = req.body?.amount ? toPaise(req.body.amount) : w.savings_paise;
  if (amount <= 0 || amount > w.savings_paise) return res.status(400).json({ error: 'You do not have that much in savings.' });

  db.prepare(`UPDATE wallets SET savings_paise = savings_paise - ?, balance_paise = balance_paise + ?,
              updated_at = datetime('now') WHERE user_id = ?`).run(amount, amount, req.user.id);
  const after = db.prepare('SELECT balance_paise, savings_paise FROM wallets WHERE user_id = ?').get(req.user.id);
  res.json({ balance: toRupees(after.balance_paise), savings: toRupees(after.savings_paise) });
});

router.post('/roundup', (req, res) => {
  const on = req.body?.enabled ? 1 : 0;
  db.prepare('UPDATE users SET roundup_enabled = ? WHERE id = ?').run(on, req.user.id);
  res.json({ roundup_enabled: on });
});

router.get('/banks', (req, res) => {
  res.json(db.prepare('SELECT id, bank_name, account_last4, upi_id, is_primary, linked_at FROM bank_accounts WHERE user_id = ?').all(req.user.id));
});

router.post('/banks', (req, res) => {
  const { bank_name, account_last4, upi_id } = req.body || {};
  if (!bank_name || !/^\d{4}$/.test(String(account_last4 || ''))) {
    return res.status(400).json({ error: 'Enter the bank name and the last 4 digits of the account.' });
  }
  const count = db.prepare('SELECT COUNT(*) c FROM bank_accounts WHERE user_id = ?').get(req.user.id).c;
  const info = db.prepare(`INSERT INTO bank_accounts (user_id, bank_name, account_last4, upi_id, is_primary)
                           VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, bank_name, account_last4, upi_id || null, count === 0 ? 1 : 0);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/banks/:id', (req, res) => {
  db.prepare('DELETE FROM bank_accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ removed: true });
});

router.get('/budget', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const goal = db.prepare('SELECT limit_paise FROM budget_goals WHERE user_id = ? AND month = ?').get(req.user.id, month);
  const spent = db.prepare(`SELECT COALESCE(SUM(amount_paise), 0) s FROM transactions
                            WHERE user_id = ? AND type IN ('payment','event_fee') AND status = 'success'
                              AND strftime('%Y-%m', created_at) = ?`).get(req.user.id, month).s;
  res.json({
    month,
    limit: goal ? toRupees(goal.limit_paise) : null,
    spent: toRupees(spent),
    remaining: goal ? toRupees(Math.max(goal.limit_paise - spent, 0)) : null,
  });
});

router.post('/budget', (req, res) => {
  const month = req.body?.month || new Date().toISOString().slice(0, 7);
  const limit = toPaise(req.body?.limit);
  if (!Number.isFinite(limit) || limit <= 0) return res.status(400).json({ error: 'Set a monthly limit above zero.' });
  db.prepare(`INSERT INTO budget_goals (user_id, month, limit_paise) VALUES (?, ?, ?)
              ON CONFLICT(user_id, month) DO UPDATE SET limit_paise = excluded.limit_paise`)
    .run(req.user.id, month, limit);
  res.json({ month, limit: toRupees(limit) });
});

module.exports = router;
