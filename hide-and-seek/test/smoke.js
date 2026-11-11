// Smoke test: boots the server with short rounds, joins a human + bots, and plays a full round.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3999;
const srv = spawn('node', ['server.js'], { cwd: dir, env: { ...process.env, PORT, HIDE_T: 3, SEEK_T: 25 }, stdio: 'inherit' });
const fail = (m) => { console.error('FAIL:', m); srv.kill(); process.exit(1); };
await new Promise((r) => setTimeout(r, 700));

const res = await fetch(`http://localhost:${PORT}/`);
if (!res.ok || !(await res.text()).includes('DUSK HOLLOW')) fail('index not served');
if (!(await fetch(`http://localhost:${PORT}/vendor/three.module.js`)).ok) fail('three not served');
if ((await fetch(`http://localhost:${PORT}/..%2fserver.js`)).ok) fail('path traversal');

const ws = new WebSocket(`ws://localhost:${PORT}`);
const seen = { phases: new Set(), events: {}, maxMoved: 0 };
let me = null, last = null, start = null;
ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Tester', room: '' })));
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  seen.events[m.t] = (seen.events[m.t] || 0) + 1;
  if (m.t === 'welcome') {
    me = m;
    for (let i = 0; i < 5; i++) ws.send(JSON.stringify({ t: 'lobby', a: 'addBot' }));
    setTimeout(() => ws.send(JSON.stringify({ t: 'lobby', a: 'start' })), 300);
  }
  if (m.t === 'st') {
    seen.phases.add(m.ph);
    if (m.ph === 'hide' && !start) start = new Map(m.p.map((p) => [p[0], [p[1], p[2]]]));
    if (start) for (const p of m.p) { const s = start.get(p[0]); if (s && p[0] !== me.id) seen.maxMoved = Math.max(seen.maxMoved, Math.hypot(p[1] - s[0], p[2] - s[1])); }
    last = m;
  }
});
ws.on('error', (e) => fail(e.message));

setTimeout(() => {
  srv.kill();
  console.log('phases:', [...seen.phases].join(','), 'events:', JSON.stringify(seen.events), 'bot max travel:', seen.maxMoved.toFixed(1));
  console.log('final:', last.ph, 'winner:', last.w, 'players:', last.p.length, 'scores:', last.p.map((p) => p[8]).join(','));
  for (const ph of ['lobby', 'hide', 'seek', 'end']) if (!seen.phases.has(ph)) fail('missing phase ' + ph);
  if (last.p.length !== 6) fail('expected 6 players');
  if (seen.maxMoved < 8) fail('bots did not move');
  if (!seen.events.round || !seen.events.end) fail('round events missing');
  console.log('OK');
  process.exit(0);
}, 34000);
