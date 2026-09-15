const express = require('express');
const { db, toRupees } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT v.id, v.name, v.category, v.location, v.qr_code,
           ROUND(AVG(r.stars), 1) AS rating, COUNT(r.id) AS rating_count
    FROM vendors v
    LEFT JOIN vendor_ratings r ON r.vendor_id = v.id
    WHERE v.is_active = 1
    GROUP BY v.id ORDER BY v.name`).all();
  res.json(rows);
});

// Campus-wide sales analytics per vendor.
router.get('/analytics', (req, res) => {
  const rows = db.prepare('SELECT * FROM v_vendor_sales ORDER BY total_paise DESC').all();
  res.json(rows.map((r) => ({
    vendor: r.vendor_name,
    transactions: r.txn_count,
    total: toRupees(r.total_paise),
    average_ticket: toRupees(Math.round(r.avg_paise)),
  })));
});

router.post('/:id/rate', requireAuth, (req, res) => {
  const stars = Number(req.body?.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'Give a rating between 1 and 5 stars.' });
  }
  db.prepare(`INSERT INTO vendor_ratings (vendor_id, user_id, stars, comment) VALUES (?, ?, ?, ?)
              ON CONFLICT(vendor_id, user_id) DO UPDATE SET stars = excluded.stars, comment = excluded.comment`)
    .run(req.params.id, req.user.id, stars, req.body?.comment || null);
  res.json({ saved: true });
});

module.exports = router;
