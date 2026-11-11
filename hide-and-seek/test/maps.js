// Every map must be fully playable: spots, beacons, power-ups, coins and the lever all reachable.
import { MAPS, getWorld, findPath, cellIdx, collide } from '../public/shared/world.js';
let bad = 0;
const fail = (m) => { console.error('FAIL:', m); bad++; };
MAPS.forEach((m, i) => {
  const W = getWorld(i);
  const kinds = {};
  for (const s of W.spots) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  console.log(m.name, '| boxes', W.boxes.length, 'spots', JSON.stringify(kinds), 'coins', W.coins.length, 'items', W.items.length, 'beacons', W.beacons.length, 'reach', W.nav.list.length);
  if (W.spots.length < 12) fail(m.id + ' too few spots');
  if (W.coins.length < 25 || W.items.length < 5 || W.beacons.length !== 3) fail(m.id + ' missing pickups');
  if (W.nav.list.length < 24000) fail(m.id + ' map mostly unreachable');
  for (const s of W.spots) {
    const [x, z] = collide(W, s.ex, s.ez);
    if (!W.nav.reach[cellIdx(s.ex, s.ez)] || Math.hypot(x - s.ex, z - s.ez) > 0.01) fail(`${m.id} spot ${s.id} (${s.kind}) exit blocked`);
  }
  for (const t of [...W.beacons.map((b) => [b.x + 1.1, b.z]), [W.lever.x + 1.1, W.lever.z], ...W.items.map((o) => [o.x, o.z])]) {
    const p = findPath(W, 0, -5, t[0], t[1]);
    if (!p) { fail(`${m.id} no path to ${t}`); continue; }
    const e = p[p.length - 1];
    if (Math.hypot(e[0] - t[0], e[1] - t[1]) > 1.6) fail(`${m.id} path ends far from ${t}`);
  }
  for (let a = 0; a < 16; a++) { const x = Math.cos(a * 0.39) * 6.5, z = Math.sin(a * 0.39) * 6.5, c = collide(W, x, z); if (Math.hypot(c[0] - x, c[1] - z) > 0.01) fail(m.id + ' spawn ring blocked'); }
});
if (bad) process.exit(1);
console.log('maps OK');
