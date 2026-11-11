// Every map must be fully playable: spots, beacons, power-ups, coins and the lever all reachable, upstairs included.
import { MAPS, getWorld, findPath, collide, levelAt } from '../public/shared/world.js';
let bad = 0;
const fail = (m) => { console.error('FAIL:', m); bad++; };
const t0 = Date.now();
MAPS.forEach((m, i) => {
  const W = getWorld(i);
  const kinds = {};
  for (const s of W.spots) kinds[s.kind + (s.lv ? '↑' : '')] = (kinds[s.kind + (s.lv ? '↑' : '')] || 0) + 1;
  console.log(m.name, '| boxes', W.boxes.length, 'spots', JSON.stringify(kinds), 'coins', W.coins.length, 'items', W.items.length, 'two-storey', W.stairs.length, 'reach', W.nav.list0.length, '+', W.nav.list.length - W.nav.list0.length, 'upstairs');
  if (W.spots.length < 20) fail(m.id + ' too few spots');
  if (W.coins.length < 40 || W.items.length < 8 || W.beacons.length !== 3) fail(m.id + ' missing pickups');
  if (W.nav.list0.length < 60000) fail(m.id + ' map mostly unreachable');
  if (W.stairs.length < 5 || W.pads.length < 3 || W.nav.list.length - W.nav.list0.length < 150 * W.stairs.length) fail(m.id + ' upstairs unreachable');
  const targets = [
    ...W.spots.map((s) => [s.ex, s.ez, s.lv, 'spot ' + s.kind]), ...W.coins.map((c) => [c.x, c.z, c.lv, 'coin']),
    ...W.beacons.map((b) => [b.x + 1.1, b.z, 0, 'beacon']), [W.lever.x + 1.1, W.lever.z, 0, 'lever'], ...W.items.map((o) => [o.x, o.z, 0, 'item']),
  ];
  for (const [x, z, lv, what] of targets) {
    const c = collide(W, x, z, 0.4, lv);
    if (what.startsWith('spot') && Math.hypot(c[0] - x, c[1] - z) > 0.01) fail(`${m.id} ${what} exit is inside something`);
    const p = findPath(W, 0, -5, 0, x, z, lv);
    if (!p) { fail(`${m.id} no path to ${what} at ${x},${z},${lv}`); continue; }
    const e = p[p.length - 1];
    if (e[2] !== lv || Math.hypot(e[0] - x, e[1] - z) > 1.6) fail(`${m.id} path ends far from ${what}`);
    // walk the path the way a bot does and make sure the level follows the stairs
    if (lv === 1) {
      let L = 0;
      for (const q of p) { L = levelAt(W, q[0], q[1], L)[0]; if (L !== q[2]) { fail(`${m.id} level mismatch on the way to ${what}`); break; } }
    }
  }
  for (let a = 0; a < 16; a++) { const x = Math.cos(a * 0.39) * 6.5, z = Math.sin(a * 0.39) * 6.5, c = collide(W, x, z); if (Math.hypot(c[0] - x, c[1] - z) > 0.01) fail(m.id + ' spawn ring blocked'); }
});
if (bad) process.exit(1);
console.log('maps OK', Date.now() - t0, 'ms');
