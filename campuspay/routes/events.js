const express = require('express');
const crypto = require('crypto');
const { db, toRupees } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, title, description, organiser, venue, starts_at, fee_paise,
           seats_total, seats_taken, points_reward
    FROM events ORDER BY starts_at`).all();
  res.json(rows.map((r) => ({
    ...r,
    fee: toRupees(r.fee_paise),
    seats_left: r.seats_total - r.seats_taken,
  })));
});

router.post('/:id/register', requireAuth, (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'That event is not listed.' });
  if (event.seats_taken >= event.seats_total) return res.status(409).json({ error: 'This event is full.' });

  const already = db.prepare('SELECT 1 FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = \'confirmed\'')
    .get(event.id, req.user.id);
  if (already) return res.status(409).json({ error: 'You are already registered for this event.' });

  const wallet = db.prepare('SELECT balance_paise FROM wallets WHERE user_id = ?').get(req.user.id);
  if (event.fee_paise > 0 && wallet.balance_paise < event.fee_paise) {
    return res.status(402).json({ error: `Top up ₹${toRupees(event.fee_paise - wallet.balance_paise)} to register.` });
  }

  const reference = `EVT-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
  let txId = null;

  db.transaction(() => {
    if (event.fee_paise > 0) {
      db.prepare('UPDATE wallets SET balance_paise = balance_paise - ?, updated_at = datetime(\'now\') WHERE user_id = ?')
        .run(event.fee_paise, req.user.id);
      const info = db.prepare(`INSERT INTO transactions (reference, user_id, type, amount_paise, points_earned, note)
                               VALUES (?, ?, 'event_fee', ?, ?, ?)`)
        .run(reference, req.user.id, event.fee_paise, event.points_reward, `Registration: ${event.title}`);
      txId = info.lastInsertRowid;
    }
    db.prepare('INSERT INTO event_registrations (event_id, user_id, transaction_id) VALUES (?, ?, ?)')
      .run(event.id, req.user.id, txId);
    db.prepare('UPDATE events SET seats_taken = seats_taken + 1 WHERE id = ?').run(event.id);
    db.prepare('UPDATE users SET campus_points = campus_points + ? WHERE id = ?').run(event.points_reward, req.user.id);
  })();

  res.status(201).json({
    reference: event.fee_paise > 0 ? reference : null,
    event: event.title,
    fee: toRupees(event.fee_paise),
    points_earned: event.points_reward,
  });
});

router.get('/my/registrations', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT e.title, e.venue, e.starts_at, r.status, r.registered_at
    FROM event_registrations r JOIN events e ON e.id = r.event_id
    WHERE r.user_id = ? ORDER BY e.starts_at`).all(req.user.id));
});

module.exports = router;
