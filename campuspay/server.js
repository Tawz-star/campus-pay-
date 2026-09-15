require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { migrate } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

migrate();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/events', require('./routes/events'));
app.use('/api/leaderboard', require('./routes/leaderboard'));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'campuspay' }));

app.use((req, res) => res.status(404).json({ error: 'No such endpoint.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something broke on our side. Try again.' });
});

app.listen(PORT, () => console.log(`CampusPay running on http://localhost:${PORT}`));
