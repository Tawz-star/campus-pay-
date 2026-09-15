const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { sign, requireAuth } = require('../middleware/auth');

const router = express.Router();
const REGISTER_NUMBER = /^\d{9}$/;

router.post('/register', (req, res) => {
  const { register_number, name, password, department_id, email, phone, role } = req.body || {};

  if (!REGISTER_NUMBER.test(String(register_number || ''))) {
    return res.status(400).json({ error: 'Register number must be exactly 9 digits.' });
  }
  if (!name || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Enter your name and a password of at least 6 characters.' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE register_number = ?').get(register_number)) {
    return res.status(409).json({ error: 'That register number is already signed up.' });
  }

  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare(`
    INSERT INTO users (register_number, name, role, department_id, email, phone, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    register_number, name, role === 'faculty' ? 'faculty' : 'student',
    department_id || null, email || null, phone || null, hash
  );

  db.prepare('INSERT INTO wallets (user_id) VALUES (?)').run(info.lastInsertRowid);
  const user = db.prepare('SELECT id, register_number, name, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: sign(user), user });
});

router.post('/login', (req, res) => {
  const { register_number, password } = req.body || {};
  if (!REGISTER_NUMBER.test(String(register_number || ''))) {
    return res.status(400).json({ error: 'Register number must be exactly 9 digits.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE register_number = ?').get(register_number);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Register number or password is wrong.' });
  }
  res.json({
    token: sign(user),
    user: { id: user.id, register_number: user.register_number, name: user.name, role: user.role },
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.register_number, u.name, u.role, u.campus_points, u.roundup_enabled,
           d.name AS department, d.school,
           w.balance_paise, w.savings_paise
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN wallets w ON w.user_id = u.id
    WHERE u.id = ?`).get(req.user.id);
  res.json(user);
});

module.exports = router;
