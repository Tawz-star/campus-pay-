require('dotenv').config();
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { db, migrate, DB_PATH } = require('./index');

if (process.argv.includes('--reset')) {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(DB_PATH + suffix)) fs.unlinkSync(DB_PATH + suffix);
  }
  console.log('Removed existing database. Re-run `npm run db:reset` output below.');
  process.exit(0);
}

migrate();

const departments = [
  ['English', 'Arts & Humanities', 'ENG'],
  ['Tamil', 'Arts & Humanities', 'TAM'],
  ['History', 'Arts & Humanities', 'HIS'],
  ['Economics', 'Arts & Humanities', 'ECO'],
  ['Commerce', 'Arts & Humanities', 'COM'],
  ['Business Administration', 'Arts & Humanities', 'BBA'],
  ['Social Work', 'Arts & Humanities', 'SWK'],
  ['Mathematics', 'Science & Technology', 'MAT'],
  ['Physics', 'Science & Technology', 'PHY'],
  ['Chemistry', 'Science & Technology', 'CHE'],
  ['Botany', 'Science & Technology', 'BOT'],
  ['Zoology', 'Science & Technology', 'ZOO'],
  ['Computer Science', 'Science & Technology', 'CSC'],
  ['Information Technology', 'Science & Technology', 'INT'],
  ['Data Science', 'Science & Technology', 'DSC'],
  ['Computer Applications', 'Science & Technology', 'BCA'],
  ['Biotechnology', 'Science & Technology', 'BIO'],
  ['Microbiology', 'Science & Technology', 'MIB'],
  ['Biochemistry', 'Science & Technology', 'BCH'],
  ['Statistics', 'Science & Technology', 'STA'],
  ['Electronics', 'Science & Technology', 'ELE'],
  ['Nutrition & Dietetics', 'Science & Technology', 'NUT'],
  ['Physical Education', 'Science & Technology', 'PED'],
  ['Environmental Science', 'Science & Technology', 'EVS'],
];

const vendors = [
  ['GJ Canteen', 'Food', 'GJ Block, ground floor', 'CP-VEND-GJCAN'],
  ['GJ Stationery', 'Stationery', 'GJ Block, near entrance', 'CP-VEND-GJSTA'],
  ['Students Cafeteria', 'Food', 'Main campus quadrangle', 'CP-VEND-STCAF'],
  ['Science Cafeteria', 'Food', 'Science block', 'CP-VEND-SCCAF'],
  ['Xerox & Stationery Shop', 'Print & Stationery', 'Library corridor', 'CP-VEND-XEROX'],
];

const insertDept = db.prepare('INSERT OR IGNORE INTO departments (name, school, code) VALUES (?, ?, ?)');
const insertVendor = db.prepare('INSERT OR IGNORE INTO vendors (name, category, location, qr_code) VALUES (?, ?, ?, ?)');

db.transaction(() => {
  departments.forEach((d) => insertDept.run(...d));
  vendors.forEach((v) => insertVendor.run(...v));
})();

// Demo accounts — password for all of them is: campus123
const hash = bcrypt.hashSync('campus123', 10);
const demoUsers = [
  ['231234567', 'Tawz', 'student', 'Commerce', 'tawz@example.edu', 50000],
  ['231234568', 'Divya R', 'student', 'Computer Science', 'divya@example.edu', 32000],
  ['231234569', 'Arun K', 'student', 'Physics', 'arun@example.edu', 18000],
  ['231234570', 'Meera S', 'student', 'English', 'meera@example.edu', 21000],
  ['900000001', 'Dr. Prakash', 'faculty', 'Data Science', 'prakash@example.edu', 75000],
];

const deptId = db.prepare('SELECT id FROM departments WHERE name = ?');
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (register_number, name, role, department_id, email, password_hash, campus_points)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);
const insertWallet = db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance_paise, savings_paise) VALUES (?, ?, ?)');

db.transaction(() => {
  demoUsers.forEach(([reg, name, role, dept, email, balance]) => {
    const d = deptId.get(dept);
    insertUser.run(reg, name, role, d.id, email, hash, Math.floor(balance / 500));
    const u = db.prepare('SELECT id FROM users WHERE register_number = ?').get(reg);
    insertWallet.run(u.id, balance, 0);
  });
})();

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO events (title, description, organiser, venue, starts_at, fee_paise, seats_total, points_reward)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

db.transaction(() => {
  insertEvent.run('FinTech Summit 2026', 'Talks and demos from the Fintech Association.', 'Fintech Association', 'Bishop Heber Auditorium', '2026-10-12 09:30', 15000, 300, 50);
  insertEvent.run('Campus Coding Sprint', 'Six-hour team build, open to all departments.', 'Dept. of Computer Science', 'CS Lab 2', '2026-10-25 08:00', 10000, 120, 40);
  insertEvent.run('Heber Cultural Night', 'Music, dance and drama across departments.', 'Students Union', 'Open Air Theatre', '2026-11-08 18:00', 0, 800, 20);
})();

console.log('Seeded:', {
  departments: db.prepare('SELECT COUNT(*) c FROM departments').get().c,
  vendors: db.prepare('SELECT COUNT(*) c FROM vendors').get().c,
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  events: db.prepare('SELECT COUNT(*) c FROM events').get().c,
});
console.log('Demo login → register number 231234567 / password campus123');
