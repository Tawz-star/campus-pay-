const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/departments', (req, res) => {
  const rows = db.prepare(`
    SELECT department_name, school, member_count, total_points,
           CASE WHEN member_count > 0 THEN ROUND(CAST(total_points AS REAL) / member_count, 1) ELSE 0 END AS points_per_member
    FROM v_department_leaderboard
    ORDER BY total_points DESC, department_name`).all();
  res.json(rows.map((r, i) => ({ rank: i + 1, ...r })));
});

router.get('/students', (req, res) => {
  const rows = db.prepare(`
    SELECT u.name, u.campus_points, d.name AS department
    FROM users u LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.role = 'student'
    ORDER BY u.campus_points DESC LIMIT 25`).all();
  res.json(rows.map((r, i) => ({ rank: i + 1, ...r })));
});

router.get('/departments/list', (req, res) => {
  res.json(db.prepare('SELECT id, name, school, code FROM departments ORDER BY school, name').all());
});

module.exports = router;
