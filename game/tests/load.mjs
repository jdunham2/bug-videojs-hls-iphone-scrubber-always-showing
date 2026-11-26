// Load test: 4 players defending Emberhold against a 150-enemy wave. Reports server tick cost and per-client
// bandwidth for each configuration: crowd separation on the main thread vs a worker thread, and full vs
// delta-compressed snapshots. Run: node tests/load.mjs  (EMBERFALL_LOAD_SECONDS=8 to change the duration)
import { makeGame, client, wait } from './harness.mjs';
import { CrowdWorker } from '../server/crowd-node.js';

const SECONDS = +(process.env.EMBERFALL_LOAD_SECONDS || 8), ENEMIES = 150;
async function run({ worker, full }) {
  const crowd = worker ? new CrowdWorker(80) : null;
  const g = makeGame({ crowd });
  const a = client(g); await wait(20);
  const cs = [a, client(g, { room: a.room }), client(g, { room: a.room }), client(g, { room: a.room })];
  await wait(50);
  const room = g.rooms.get(a.room), town = room.zones.get('town');
  room.fullSnapshots = full;
  cs[0].send({ t: 'chat', text: '/gold 99999' });
  for (let i = 0; i < 10; i++) cs[0].send({ t: 'build', kind: i % 2 ? 'tower' : 'wall', x: Math.cos(i * 0.63) * 20, z: Math.sin(i * 0.63) * 20 });
  cs[0].send({ t: 'startNight' }); cs[0].send({ t: 'chat', text: '/wave 5' });
  const types = ['skeleton', 'brute', 'imp', 'cultist', 'bomber', 'healer', 'shieldbearer', 'wraith'];
  const top = () => { let k = 0; while (town.enemies.size < ENEMIES && k++ < 200) { const a2 = Math.random() * 6.28, r = 55 + Math.random() * 20; town.spawn(types[k % types.length], Math.cos(a2) * r, Math.sin(a2) * r, { aggro: true, noLoot: true }); } };
  top();
  await wait(300);
  const times = []; const orig = room.tick.bind(room);
  room.tick = () => { top(); const t0 = performance.now(); orig(); times.push(performance.now() - t0); };
  const b0 = cs.map((c) => c.bytes);
  const bots = setInterval(() => cs.forEach((c, i) => {
    const x = Math.cos(Date.now() / 900 + i) * 12, z = Math.sin(Date.now() / 900 + i) * 12;
    c.send({ t: 'state', x, y: 0, z, hp: 100, maxHp: 100 });
    const e = c.ents?.list?.find((r) => Math.hypot(r[2] - x, r[3] - z) < 6);
    if (e) c.send({ t: 'hit', id: e[0], dmg: 15 });
  }), 66);
  await wait(SECONDS * 1000);
  clearInterval(bots); g.stop(); crowd?.stop();
  times.sort((x, y) => x - y);
  const avg = times.reduce((s, v) => s + v, 0) / times.length;
  const kbps = cs.map((c, i) => (c.bytes - b0[i]) / SECONDS / 1024).reduce((s, v) => s + v, 0) / cs.length;
  return { config: `${worker ? 'worker' : 'main  '} · ${full ? 'full ' : 'delta'}`, ticks: times.length, enemies: town.enemies.size, avgMs: +avg.toFixed(3), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(3), maxMs: +times[times.length - 1].toFixed(3), kbPerClientPerSec: +kbps.toFixed(1), workerJobs: crowd?.jobs || 0 };
}
const rows = [];
for (const cfg of [{ worker: false, full: true }, { worker: false, full: false }, { worker: true, full: false }]) rows.push(await run(cfg));
console.table(rows);
console.log('tick budget: 50 ms (20 Hz)');
process.exit(0);
