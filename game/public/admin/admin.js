// Emberfall live-ops dashboard. "Live server" polls /api/admin on the game server that hosts this page
// (needs EMBERFALL_ADMIN_KEY). "Demo simulation" runs the real server simulation in this page with bot parties.
{
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CLS = { warden: 'Warden', emberblade: 'Emberblade', hexcaller: 'Hexcaller', ranger: 'Ranger' };
const ZN = (k) => (k === 'town' ? 'Emberhold' : k === 'dark' ? 'Dark World' : k === 'marsh' ? 'Ashen Marsh' : k === 'peaks' ? 'Stormspire' : k.startsWith('rift') ? 'Rift' : k.startsWith('dungeon') ? 'Dungeon' : k);
const hist = []; let mode = 'demo', timer = null, demo = null, lastSnap = null;

// ---------- rendering ----------
function render(s) {
  lastSnap = s;
  const now = s.now, rej5 = s.anticheat.filter((a) => now - a.at < 300000).length, enemies = s.rooms.reduce((a, r) => a + r.zones.reduce((b, z) => b + z.enemies, 0), 0);
  $('online').textContent = s.online; $('rooms').textContent = s.rooms.length; $('enemies').textContent = enemies; $('rej').textContent = rej5;
  $('uptime').textContent = `up ${Math.floor(s.uptime / 60)}m ${s.uptime % 60}s · ${s.profiles} profiles · ${s.guilds} guilds`;
  hist.push({ t: now, p: s.online, e: enemies }); while (hist.length && now - hist[0].t > 180000) hist.shift();
  $('roomList').innerHTML = s.rooms.length ? s.rooms.map((r) => `<div class="room"><div><div class="code">${esc(r.code)}</div><div class="meta">depth ${r.depth}${r.public ? ' · public' : ''}<br>${String(Math.floor(r.hour)).padStart(2, '0')}:${String(Math.round((r.hour % 1) * 60)).padStart(2, '0')}${r.night ? ` · <span class="night">night, wave ${r.night.wave}</span>` : ''}</div></div>
    <div class="pl">${r.players.map((p) => `<div class="p ${p.dead ? 'dead' : ''}"><span>${p.guild ? `&lt;${esc(p.guild)}&gt; ` : ''}<b>${esc(p.name)}</b> · ${CLS[p.cls] || esc(p.cls)} ${p.level}${p.rejected ? ` <span class="flag">⚑${p.rejected}</span>` : ''}</span><span class="hp"><i style="width:${p.maxHp ? Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100)) : 0}%"></i></span><span class="meta">${ZN(p.zone)}</span></div>`).join('') || '<span class="meta">empty</span>'}</div>
    <div class="zones">${r.zones.map((z) => `${ZN(z.key)} ${z.players}p/${z.enemies}e${z.weather && z.weather !== 'clear' ? ' ' + z.weather : ''}`).join(' · ')}</div></div>`).join('') : '<div class="empty">No rooms open.</div>';
  const ac = s.anticheat.slice(0, 14);
  $('ac').innerHTML = ac.map((a) => `<tr><td>${new Date(a.at).toLocaleTimeString()}</td><td>${esc(a.room)}</td><td><b>${esc(a.name)}</b></td><td class="hide-s">${CLS[a.cls] || esc(a.cls)} ${a.level}</td><td class="x">${a.dmg.toLocaleString()}</td><td>${a.cap.toLocaleString()}</td><td class="hide-s">${a.total}</td></tr>`).join('');
  $('acEmpty').hidden = ac.length > 0;
  draw();
}
const chart = $('chart'), svg = chart.querySelector('svg');
function draw() {
  const W = chart.clientWidth, H = chart.clientHeight, L = 34, R = 10, T = 12, B = 24;
  if (!W || hist.length < 2) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Collecting samples…</text>`; return; }
  const t1 = hist.at(-1).t, t0 = t1 - 180000, max = Math.max(4, ...hist.map((h) => Math.max(h.p, h.e / 10))) * 1.15;
  const x = (t) => L + ((t - t0) / 180000) * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
  const line = (f) => hist.map((h, i) => `${i ? 'L' : 'M'}${x(h.t).toFixed(1)},${y(f(h)).toFixed(1)}`).join('');
  const step = max > 20 ? 10 : max > 8 ? 4 : 2; let grid = '';
  for (let v = 0; v <= max; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let k = 0; k <= 3; k++) { const tt = t0 + k * 60000; grid += `<text x="${x(tt)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}">${k === 3 ? 'now' : `-${3 - k}m`}</text>`; }
  const area = `${line((h) => h.p)}L${x(hist.at(-1).t)},${y(0)}L${x(hist[0].t)},${y(0)}Z`;
  svg.innerHTML = `${grid}<path d="${area}" fill="var(--ink)" opacity=".08"/><path d="${line((h) => h.e / 10)}" fill="none" stroke="var(--red)" stroke-width="2"/><path d="${line((h) => h.p)}" fill="none" stroke="var(--ink)" stroke-width="2.5"/>
    <circle cx="${x(hist.at(-1).t)}" cy="${y(hist.at(-1).p)}" r="4" fill="var(--ink)"/>`;
}
const ro = new ResizeObserver(draw); ro.observe(chart);
function status(text, err) { $('statusT').textContent = text; $('status').classList.toggle('err', !!err); }

// ---------- live server ----------
async function pollLive() {
  const key = $('key').value.trim();
  if (!key) { status('Enter the admin key', true); return; }
  try {
    const r = await fetch(`/api/admin?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (r.status === 403) return status('Wrong admin key', true);
    if (!r.ok) return status(r.status === 404 ? 'Admin feed disabled (set EMBERFALL_ADMIN_KEY)' : `Server error ${r.status}`, true);
    render(await r.json()); status('Live · polling every 2 s');
  } catch (e) { status('Cannot reach /api/admin — open this page from your game server at /admin/', true); }
}

// ---------- demo: the real simulation + bot parties ----------
const NAMES = ['Aldric', 'Brienne', 'Cael', 'Dara', 'Eamon', 'Fenna', 'Gideon', 'Hale', 'Isolde', 'Joren', 'Kesh', 'Liora', 'Maren', 'Nyx', 'Orrin', 'Perrin'];
function memDB() { return { data: { profiles: {} }, get(t) { return this.data.profiles[t] || null; }, put(t, p) { this.data.profiles[t] = p; }, touch() {}, flush() {} }; }
class Bot {
  constructor(game, name, cls, room, cheater) {
    this.name = name; this.cheater = cheater; this.hp = 100; this.maxHp = 100; this.x = 0; this.z = 13; this.dead = 0; this.ents = []; this.alive = true;
    const h = { message: [], close: [] };
    this.ws = { readyState: 1, send: (s) => this.onMsg(JSON.parse(s)), close() { this.readyState = 3; }, on: (ev, fn) => h[ev]?.push(fn) };
    game.attach(this.ws);
    this.send = (m) => h.message.forEach((f) => f(JSON.stringify(m)));
    this.leave = () => { this.alive = false; h.close.forEach((f) => f()); };
    this.send({ t: 'hello', name, cls, room, token: Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32).replace(/[^a-f0-9]/g, 'a'), public: room === 'GALE' });
    this.send({ t: 'chat', text: `/xp ${4000 + Math.floor(Math.random() * 40000)}` });
    this.next = Date.now() + 4000 + Math.random() * 20000;
  }
  onMsg(m) {
    if (m.t === 'ents') this.ents = m.list;
    if (m.t === 'enterZone') { this.zone = m.zone; this.x = (Math.random() - 0.5) * 10; this.z = 13; }
    if (m.t === 'hurt') { this.hp -= m.dmg * 0.35; if (this.hp <= 0) { this.hp = 0; this.dead = Date.now() + 5000; } }
    if (m.t === 'readyCheck') setTimeout(() => this.alive && this.send({ t: 'readyResp', yes: true }), 600 + Math.random() * 1500);
    if (m.t === 'profile') this.level = m.char.level;
  }
  tick() {
    if (!this.alive) return;
    const now = Date.now();
    if (this.dead) { if (now > this.dead) { this.dead = 0; this.hp = this.maxHp; } }
    else {
      this.hp = Math.min(this.maxHp, this.hp + 0.4);
      const e = this.ents.filter((a) => a[1] !== 'goblin').sort((a, b) => Math.hypot(a[2] - this.x, a[3] - this.z) - Math.hypot(b[2] - this.x, b[3] - this.z))[0];
      if (e && this.zone !== 'town') {
        const dx = e[2] - this.x, dz = e[3] - this.z, d = Math.hypot(dx, dz);
        if (d > 2.2) { const s = Math.min(d - 2, 1.6); this.x += (dx / d) * s; this.z += (dz / d) * s; }
        else this.send({ t: 'hit', id: e[0], dmg: 12 + (this.level || 1) * 3 });
        if (this.cheater && Math.random() < 0.05) this.send({ t: 'hit', id: e[0], dmg: 250000 + Math.floor(Math.random() * 1e6) });
      } else { this.x += (Math.random() - 0.5) * 2; this.z += (Math.random() - 0.5) * 2; }
    }
    this.send({ t: 'state', x: this.x, y: 0, z: this.z, ry: 0, anim: 1, hp: Math.round(this.hp), maxHp: this.maxHp, dead: !!this.dead });
    if (now > this.next) { // wander between zones
      this.next = now + 25000 + Math.random() * 35000;
      const to = ['dungeon', 'marsh', 'dark', 'town', 'marsh', 'dungeon'][Math.floor(Math.random() * 6)];
      if (to === 'town' && Math.random() < 0.4) { this.send({ t: 'zone', to: 'town' }); setTimeout(() => this.alive && this.send({ t: 'startNight' }), 1500); }
      else this.send({ t: 'zone', to });
    }
  }
}
async function startDemo() {
  status('Loading the server simulation…');
  let createGame;
  try { ({ createGame } = await import('./server/game.js')); } catch (e) { status('Demo needs the bundled simulation (use the published dashboard)', true); return; }
  let tok = 0;
  const game = createGame({ db: memDB(), makeToken: () => (++tok).toString(16).padStart(32, 'a'), dev: true });
  const bots = [], used = new Set();
  const spawn = (room, cheater) => { let n; do { n = NAMES[Math.floor(Math.random() * NAMES.length)]; } while (used.has(n) && used.size < NAMES.length); used.add(n); const cls = Object.keys(CLS)[Math.floor(Math.random() * 4)]; bots.push(new Bot(game, cheater ? 'xX_Speedy_Xx' : n, cls, room, cheater)); };
  [['EMBR', 4], ['ASHE', 3], ['GALE', 2]].forEach(([r, n]) => { for (let i = 0; i < n; i++) spawn(r, r === 'ASHE' && i === 2); });
  const tickT = setInterval(() => bots.forEach((b) => b.tick()), 250);
  const churn = setInterval(() => { // players come and go
    const live = bots.filter((b) => b.alive && !b.cheater);
    if (live.length > 6 && Math.random() < 0.5) { const b = live[Math.floor(Math.random() * live.length)]; b.leave(); used.delete(b.name); }
    else if (live.length < 11) spawn(['EMBR', 'ASHE', 'GALE', 'FROS'][Math.floor(Math.random() * 4)]);
  }, 9000);
  demo = { stop() { clearInterval(tickT); clearInterval(churn); bots.forEach((b) => b.alive && b.leave()); game.stop(); } };
  const snap = () => { if (mode === 'demo') { render(game.admin()); status('Demo · live simulation'); } };
  snap(); timer = setInterval(snap, 1000);
}

function setMode(m) {
  mode = m; clearInterval(timer); timer = null; hist.length = 0;
  if (demo) { demo.stop(); demo = null; }
  $('mDemo').classList.toggle('on', m === 'demo'); $('mLive').classList.toggle('on', m === 'live'); $('key').hidden = m !== 'live';
  if (m === 'demo') {
    $('srcNote').textContent = 'Demo: the real Emberfall server simulation running in this page, with bot parties and one cheater.';
    $('foot').textContent = 'Sample data from bots. On your own deployment, open /admin/ on the game server, set EMBERFALL_ADMIN_KEY, and switch to Live server.';
    startDemo();
  } else {
    $('srcNote').textContent = 'Live: polling /api/admin on the game server that hosts this page.';
    $('foot').textContent = 'Start the server with EMBERFALL_ADMIN_KEY=<secret>; the key is never stored by this page.';
    pollLive(); timer = setInterval(pollLive, 2000);
  }
}
$('mDemo').onclick = () => setMode('demo');
$('mLive').onclick = () => setMode('live');
$('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') pollLive(); });
// served by a game server → default to live; as a static page → demo
fetch('/healthz', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((j) => setMode(j && j.ok ? 'live' : 'demo')).catch(() => setMode('demo'));
}
