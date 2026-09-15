const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const money = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let token = localStorage.getItem('cp_token') || null;

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('is-on'), 2600);
}

/* ---------------- Auth ---------------- */
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === t));
  const wantRegister = t.dataset.auth === 'register';
  $('#loginForm').classList.toggle('is-hidden', wantRegister);
  $('#registerForm').classList.toggle('is-hidden', !wantRegister);
  $('#authError').textContent = '';
}));

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const out = await api('/auth/login', { method: 'POST', body: JSON.stringify(formData(e.target)) });
    token = out.token;
    localStorage.setItem('cp_token', token);
    await start();
  } catch (err) { $('#authError').textContent = err.message; }
});

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const out = await api('/auth/register', { method: 'POST', body: JSON.stringify(formData(e.target)) });
    token = out.token;
    localStorage.setItem('cp_token', token);
    await start();
  } catch (err) { $('#authError').textContent = err.message; }
});

$('#signOut').addEventListener('click', () => {
  localStorage.removeItem('cp_token');
  token = null;
  location.reload();
});

/* ---------------- Navigation ---------------- */
$$('.tabbtn').forEach((b) => b.addEventListener('click', () => {
  $$('.tabbtn').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.screen').forEach((s) => s.classList.add('is-hidden'));
  $('#screen-' + b.dataset.screen).classList.remove('is-hidden');
  if (b.dataset.screen === 'events') loadEvents();
  if (b.dataset.screen === 'board') loadBoard();
}));

/* ---------------- Home ---------------- */
async function loadHome() {
  const me = await api('/auth/me');
  $('#greeting').textContent = 'Hello, ' + me.name.split(' ')[0];
  $('#regLine').textContent = `${me.register_number}${me.department ? ' · ' + me.department : ''}`;
  $('#balanceValue').textContent = money(me.balance_paise / 100);
  $('#savingsValue').textContent = money(me.savings_paise / 100);
  $('#pointsValue').textContent = me.campus_points;

  const report = await api('/payments/reports/by-vendor');
  const box = $('#vendorReport');
  if (!report.length) {
    box.innerHTML = '<p class="empty">Pay at a campus shop and your spending breakdown shows up here.</p>';
  } else {
    const max = Math.max(...report.map((r) => r.total));
    box.innerHTML = report.map((r) => `
      <div class="bar-row">
        <div class="bar-top"><span>${r.vendor}</span><span>${money(r.total)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(r.total / max * 100).toFixed(1)}%"></div></div>
      </div>`).join('');
  }

  const txs = await api('/payments/transactions?limit=20');
  const list = $('#txList');
  if (!txs.length) {
    list.innerHTML = '<li class="empty">Nothing yet. Add money to get started.</li>';
  } else {
    list.innerHTML = txs.map((t) => {
      const incoming = t.type === 'topup' || t.type === 'refund';
      const label = t.vendor || (t.type === 'topup' ? 'Wallet top-up'
        : t.type === 'roundup' ? 'Saved by round-up'
        : t.note || t.type);
      return `<li class="tx">
        <div><div class="tx-main">${label}</div>
        <div class="tx-sub">${t.created_at} · ${t.reference}</div></div>
        <div class="tx-amt ${incoming ? 'in' : ''}">${incoming ? '+' : '−'}${money(t.amount)}</div>
      </li>`;
    }).join('');
  }
}

$('[data-topup]').addEventListener('click', async () => {
  const amount = prompt('How much do you want to add? (₹)');
  if (!amount) return;
  try {
    await api('/wallet/topup', { method: 'POST', body: JSON.stringify({ amount }) });
    toast('Money added');
    loadHome();
  } catch (err) { toast(err.message); }
});

$('[data-withdraw]').addEventListener('click', async () => {
  try {
    const out = await api('/wallet/savings/withdraw', { method: 'POST', body: JSON.stringify({}) });
    toast('Savings moved to your balance');
    loadHome();
  } catch (err) { toast(err.message); }
});

/* ---------------- Pay ---------------- */
async function loadVendors() {
  const vendors = await api('/vendors');
  $('#vendorSelect').innerHTML = vendors
    .map((v) => `<option value="${v.id}" data-qr="${v.qr_code}">${v.name} — ${v.location || v.category}</option>`)
    .join('');
}

$('#payForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = formData(e.target);
  try {
    const r = await api('/payments/pay', { method: 'POST', body: JSON.stringify(body) });
    $('#receipt').classList.remove('is-hidden');
    $('#receipt').innerHTML = `
      <h3>Paid ${r.vendor}</h3>
      <dl>
        <dt>Amount</dt><dd>${money(r.amount)}</dd>
        <dt>Rounded up into savings</dt><dd>${money(r.roundup_saved)}</dd>
        <dt>Campus points earned</dt><dd>${r.points_earned}</dd>
        <dt>Balance left</dt><dd>${money(r.balance)}</dd>
        <dt>Reference</dt><dd>${r.reference}</dd>
      </dl>`;
    e.target.reset();
    toast('Payment complete');
    loadHome();
  } catch (err) { toast(err.message); }
});

/* Camera QR scan — uses the built-in BarcodeDetector where the phone supports it. */
let stream = null;
$('#scanToggle').addEventListener('click', async () => {
  const video = $('#scanVideo');
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.classList.remove('is-live');
    $('#scanToggle').textContent = 'Open camera';
    return;
  }
  if (!('BarcodeDetector' in window)) {
    toast('This browser cannot scan. Pick the vendor from the list instead.');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    await video.play();
    video.classList.add('is-live');
    $('#scanToggle').textContent = 'Close camera';

    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const tick = async () => {
      if (!stream) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          const value = codes[0].rawValue;
          const option = $$('#vendorSelect option').find((o) => o.dataset.qr === value);
          if (option) {
            $('#vendorSelect').value = option.value;
            toast('Vendor set: ' + option.textContent.split(' — ')[0]);
            $('#scanToggle').click();
            $('#payForm').querySelector('[name=amount]').focus();
            return;
          }
        }
      } catch { /* keep scanning */ }
      requestAnimationFrame(tick);
    };
    tick();
  } catch {
    toast('Camera permission was refused.');
  }
});

/* ---------------- Events ---------------- */
async function loadEvents() {
  const events = await api('/events');
  $('#eventList').innerHTML = events.map((e) => `
    <article class="event">
      <h3>${e.title}</h3>
      <p>${e.description || ''}</p>
      <div class="tx-sub">${e.venue} · ${e.starts_at} · ${e.seats_left} seats left</div>
      <div class="event-foot">
        <span>${e.fee > 0 ? money(e.fee) : 'Free'} · +${e.points_reward} points</span>
        <button class="btn-ghost" data-event="${e.id}">Register</button>
      </div>
    </article>`).join('');

  $$('[data-event]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const r = await api(`/events/${b.dataset.event}/register`, { method: 'POST' });
      toast(`Registered for ${r.event}`);
      loadEvents(); loadHome();
    } catch (err) { toast(err.message); }
  }));
}

/* ---------------- Leaderboard ---------------- */
async function loadBoard() {
  const rows = await api('/leaderboard/departments');
  $('#boardList').innerHTML = rows.map((r) => `
    <li>
      <span class="rank">${r.rank}</span>
      <span><span class="dept">${r.department_name}</span><br><span class="school">${r.school} · ${r.member_count} members</span></span>
      <span class="pts">${r.total_points}</span>
    </li>`).join('');
}

/* ---------------- Boot ---------------- */
async function loadDepartments() {
  const depts = await api('/leaderboard/departments/list');
  $('#deptSelect').innerHTML = '<option value="">Choose your department</option>' +
    depts.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
}

async function start() {
  $('#authView').classList.add('is-hidden');
  $('#appView').classList.remove('is-hidden');
  await Promise.all([loadHome(), loadVendors()]);
}

(async function boot() {
  loadDepartments().catch(() => {});
  if (!token) return;
  try { await start(); }
  catch { localStorage.removeItem('cp_token'); token = null; }
})();
