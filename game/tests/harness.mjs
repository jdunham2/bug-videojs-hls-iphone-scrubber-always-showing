// In-process test harness: a game instance with an in-memory DB and fake sockets.
import { createGame } from '../server/game.js';
import { generateDungeon } from '../public/shared/dungeon.js';
import { applySnapshot } from '../public/shared/snapshot.js';

export function memDB() { return { data: { profiles: {} }, get(t) { return this.data.profiles[t] || null; }, put(t, p) { this.data.profiles[t] = p; }, touch() {}, flush() {} }; }
let tok = 0;
export function makeGame(opts = {}) { return createGame({ db: memDB(), makeToken: () => String(++tok).padStart(32, 'a').slice(-32).replace(/[^a-f0-9]/g, 'a'), dev: true, ...opts }); }

export function client(game, hello) {
  const h = { message: [], close: [] }, c = { msgs: [], last: {}, prof: null, snap: {}, bytes: 0 };
  const ws = { readyState: 1, send: (s) => { c.bytes += s.length; const m = JSON.parse(s); c.msgs.push(m); c.last[m.t] = m; if (m.t === 'profile') c.prof = m; if (m.t === 'welcome') { c.id = m.id; c.room = m.room; } if (m.t === 'enterZone') c.zone = m; if (m.t === 'ents' || m.t === 'entsD') c.ents = applySnapshot(c.snap, m); }, close() { this.readyState = 3; }, on: (ev, fn) => h[ev]?.push(fn) };
  game.attach(ws);
  c.send = (m) => h.message.forEach((f) => f(JSON.stringify(m)));
  c.close = () => h.close.forEach((f) => f());
  c.count = (t) => c.msgs.filter((m) => m.t === t).length;
  c.dungeon = () => generateDungeon(c.zone.seed, c.zone.level);
  c.send({ t: 'hello', name: 'Tester', cls: 'warden', ...hello });
  return c;
}
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
