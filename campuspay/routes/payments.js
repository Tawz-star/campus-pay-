const express = require('express');
const crypto = require('crypto');
const { db, toPaise, toRupees, roundUpAmount } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const ref = () => `CP-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase();

// Pay a vendor, either by vendor_id or by the QR code string the scanner reads.
router.post('/pay', (req, res) => {
  const { vendor_id, qr_code, note } = req.body || {};
  const amount = toPaise(req.body?.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Enter an amount above zero.' });
  }

  const vendor = qr_code
    ? db.prepare('SELECT * FROM vendors WHERE qr_code = ? AND is_active = 1').get(qr_code)
    : db.prepare('SELECT * FROM vendors WHERE id = ? AND is_active = 1').get(vendor_id);
  if (!vendor) return res.status(404).json({ error: 'That QR code does not match a campus vendor.' });

  const user = db.prepare('SELECT roundup_enabled FROM users WHERE id = ?').get(req.user.id);
  const wallet = db.prepare('SELECT balance_paise FROM wallets WHERE user_id = ?').get(req.user.id);

  const roundup = user.roundup_enabled ? roundUpAmount(amount) : 0;
  const total = amount + roundup;

  if (wallet.balance_paise < total) {
    return res.status(402).json({
      error: `Not enough balance. You need ₹${toRupees(total - wallet.balance_paise)} more.`,
      needed: toRupees(total),
      available: toRupees(wallet.balance_paise),
    });
  }

  const points = Math.floor(amount / 1000); // 1 campus point per ₹10 spent
  const reference = ref();

  db.transaction(() => {
    db.prepare(`UPDATE wallets SET balance_paise = balance_paise - ?, savings_paise = savings_paise + ?,
                updated_at = datetime('now') WHERE user_id = ?`).run(total, roundup, req.user.id);

    db.prepare(`INSERT INTO transactions (reference, user_id, vendor_id, type, amount_paise, roundup_paise, points_earned, note)
                VALUES (?, ?, ?, 'payment', ?, ?, ?, ?)`)
      .run(reference, req.user.id, vendor.id, amount, roundup, points, note || null);

    if (roundup > 0) {
      db.prepare(`INSERT INTO transactions (reference, user_id, type, amount_paise, note)
                  VALUES (?, ?, 'roundup', ?, ?)`)
        .run(reference + '-RU', req.user.id, roundup, `Round-up saved from ${vendor.name}`);
    }

    db.prepare('UPDATE users SET campus_points = campus_points + ? WHERE id = ?').run(points, req.user.id);
  })();

  const after = db.prepare('SELECT balance_paise, savings_paise FROM wallets WHERE user_id = ?').get(req.user.id);

  res.status(201).json({
    reference,
    vendor: vendor.name,
    amount: toRupees(amount),
    roundup_saved: toRupees(roundup),
    points_earned: points,
    balance: toRupees(after.balance_paise),
    savings: toRupees(after.savings_paise),
    paid_at: new Date().toISOString(),
  });
});

// Transaction history, newest first.
router.get('/transactions', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db.prepare(`
    SELECT t.reference, t.type, t.amount_paise, t.roundup_paise, t.points_earned, t.status,
           t.note, t.created_at, v.name AS vendor
    FROM transactions t
    LEFT JOIN vendors v ON v.id = t.vendor_id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT ?`).all(req.user.id, limit);

  res.json(rows.map((r) => ({
    ...r,
    amount: toRupees(r.amount_paise),
    roundup: toRupees(r.roundup_paise),
  })));
});

// Digital receipt for one transaction.
router.get('/transactions/:reference', (req, res) => {
  const row = db.prepare(`
    SELECT t.*, v.name AS vendor, v.location, u.name AS payer, u.register_number
    FROM transactions t
    LEFT JOIN vendors v ON v.id = t.vendor_id
    JOIN users u ON u.id = t.user_id
    WHERE t.reference = ? AND t.user_id = ?`).get(req.params.reference, req.user.id);
  if (!row) return res.status(404).json({ error: 'No receipt with that reference.' });
  res.json({ ...row, amount: toRupees(row.amount_paise), roundup: toRupees(row.roundup_paise) });
});

// Per-vendor spend report for the signed-in user.
router.get('/reports/by-vendor', (req, res) => {
  const rows = db.prepare(`
    SELECT v.name AS vendor, COUNT(t.id) AS visits, SUM(t.amount_paise) AS total_paise
    FROM transactions t
    JOIN vendors v ON v.id = t.vendor_id
    WHERE t.user_id = ? AND t.type = 'payment' AND t.status = 'success'
    GROUP BY v.id
    ORDER BY total_paise DESC`).all(req.user.id);
  res.json(rows.map((r) => ({ ...r, total: toRupees(r.total_paise) })));
});

// Month-by-month spend for the spend tracker chart.
router.get('/reports/monthly', (req, res) => {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS month,
           SUM(amount_paise) AS total_paise,
           SUM(roundup_paise) AS saved_paise
    FROM transactions
    WHERE user_id = ? AND type = 'payment' AND status = 'success'
    GROUP BY month ORDER BY month DESC LIMIT 12`).all(req.user.id);
  res.json(rows.map((r) => ({ month: r.month, total: toRupees(r.total_paise), saved: toRupees(r.saved_paise) })));
});

module.exports = router;
