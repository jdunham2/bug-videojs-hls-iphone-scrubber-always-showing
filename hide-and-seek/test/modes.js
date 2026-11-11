// Plays a full round of every game mode on every map with bots only, on a fake clock so it runs in seconds.
import { makeRoom, joinRoom, addBot, handleMessage, tickRoom } from '../public/shared/game.js';
import { MODES, MAPS } from '../public/shared/world.js';

let clock = 1e12;
Date.now = () => clock;
let bad = 0;
const fail = (m) => { console.error('FAIL:', m); bad++; };

for (let mode = 0; mode < MODES.length; mode++) for (let map = 0; map < MAPS.length; map++) {
  const room = makeRoom('T', { map, mode, seek: 150 });
  const seen = { caught: 0, freed: 0, coin: 0, item: 0, beacon: 0, maxSeekers: 0, frozen: 0, props: 0, upstairs: 0, end: null, startSeekers: -1, minSeekers: 99 };
  const me = joinRoom(room, 'Watcher', (m) => {
    if (m.t in seen) seen[m.t]++;
    if (m.t === 'end') seen.end = m.w;
  });
  for (let i = 0; i < 9; i++) addBot(room);
  handleMessage(room, me, { t: 'lobby', a: 'start' });
  for (let i = 0; i < 15 * 200 && !seen.end; i++) {
    clock += 1000 / 15;
    const s = tickRoom(room, 1 / 15);
    const ns = s.p.filter((p) => p[5] === 1).length;
    if (seen.startSeekers < 0) seen.startSeekers = ns;
    seen.minSeekers = Math.min(seen.minSeekers, ns);
    seen.maxSeekers = Math.max(seen.maxSeekers, s.p.filter((p) => p[5] === 1).length);
    seen.frozen = Math.max(seen.frozen, s.p.filter((p) => p[6] === 2).length);
    seen.props = Math.max(seen.props, s.p.filter((p) => p[13] > 0).length);
    seen.upstairs = Math.max(seen.upstairs, s.p.filter((p) => p[12] === 1).length);
    for (const p of s.p) if (!Number.isFinite(p[1]) || !Number.isFinite(p[2])) fail('bad position');
  }
  console.log(`${MODES[mode].name.padEnd(10)} on ${MAPS[map].name.padEnd(15)}`, JSON.stringify(seen));
  if (!seen.end) fail(`${MODES[mode].id} round never ended`);
  if (mode === 1 && seen.caught && seen.maxSeekers < 3) fail('infection did not spread');
  if (mode === 2 && seen.caught && !seen.frozen) fail('nobody froze');
  if (mode === 3 && seen.props < 7) fail('hiders have no props');
  if (mode !== 3 && seen.props) fail('props outside prop hunt');
  if (mode === 5 && seen.end === 'hiders' && seen.coin < 6) fail('heist ended without enough coins');
  if (mode === 6 && seen.startSeekers !== 9) fail('sardines should start with one hider and everyone else seeking');
  if (mode === 6 && seen.caught && seen.minSeekers >= 9) fail('finders did not join the hider');
}
if (bad) process.exit(1);
console.log('modes OK');
