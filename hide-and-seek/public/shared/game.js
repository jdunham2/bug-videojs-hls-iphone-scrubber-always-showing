// Dusk Hollow game rules: rooms, rounds, scoring and bots.
// Transport-agnostic so it runs on the Node server and inside a browser tab (solo play or a tab hosting friends).
import {
  getWorld, collide, hasLOS, findPath, walkable, randomPoint,
  levelAt, validLevel, cleanLook,
  PR, HALF, SPEED, STAM, NOISE_RANGE, MAPS, MODES, PROPS, TURBO, VEHICLE, VEHICLES, GIANT, F_SPRINT, F_CROUCH, F_MOVE, F_USE, F_WIND,
} from './world.js';

// The world of whichever room is being processed. Every entry point sets it first; all code here is synchronous.
let W = getWorld(0);
const END_T = 10;
export const TICK = 15;
export const MAX_PLAYERS = 16;
const HIDER = 0, SEEKER = 1;
const BOT_NAMES = ['Pixel', 'Mochi', 'Biscuit', 'Ziggy', 'Noodle', 'Waffles', 'Turbo', 'Pickle', 'Gizmo', 'Sprout', 'Bean', 'Comet'];

// ---------- rooms ----------
let nextId = 1;
const now = () => Date.now() / 1000;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function makeRoom(code, cfg = {}) {
  const room = {
    cfg: { hide: cfg.hide || 30, seek: cfg.seek || 210 },
    code, players: new Map(), phase: 'lobby', tEnd: 0, host: null,
    coins: new Set(), spotOcc: new Map(), resc: 0, scoreT: 0, winner: null,
    map: 0, W: getWorld(0), items: new Map(), bc: [0, 0, 0], mode: 0,
  };
  if (cfg.map) { room.map = cfg.map % MAPS.length; room.W = getWorld(room.map); }
  resetVehicles(room);
  if (cfg.mode) room.mode = cfg.mode % MODES.length;
  return room;
}

function makePlayer(room, name, out, look) {
  look = cleanLook(look);
  const color = look[1];
  const a = Math.random() * Math.PI * 2;
  const [x, z] = collide(W, Math.cos(a) * 6, Math.sin(a) * 6);
  const p = {
    id: nextId++, out, bot: !out, name, color, look, lv: 0, role: HIDER, st: 0, hid: -1,
    x, z, r: 0, f: 0, sc: 0, q: 0, stunUntil: 0, immUntil: 0, tagCd: 0, tauntCd: 0, rocks: 3,
    seekCount: 0, noiseT: 0, ai: { stam: 100, wind: 0 },
    item: 0, cloakUntil: 0, silentUntil: 0, boostUntil: 0, cnt: {}, ch: null, seen: new Set(), veh: -1,
  };
  room.players.set(p.id, p);
  return p;
}

const send = (p, msg) => { if (p.out) p.out(msg, false); };
// Broadcasts reach every human; `room.tap` lets a host relay them once instead of per player.
function broadcast(room, msg) {
  if (room.tap) room.tap(msg);
  for (const p of room.players.values()) if (p.out) p.out(msg, true);
}
const feed = (room, m, k = '') => broadcast(room, { t: 'feed', m, k });
function sendRoster(room) {
  broadcast(room, { t: 'ro', p: [...room.players.values()].map((p) => ({ id: p.id, n: p.name, c: p.color, bot: p.bot, lk: p.look })) });
}
function teleport(p, x, z, lv = 0) {
  p.x = x; p.z = z; p.lv = lv; p.q++;
  send(p, { t: 'tp', x, z, lv, q: p.q });
}
const hiders = (room) => [...room.players.values()].filter((p) => p.role === HIDER);
const seekers = (room) => [...room.players.values()].filter((p) => p.role === SEEKER);
const jailed = (room) => hiders(room).filter((p) => p.st === 1);

function emitNoise(room, x, z, k, id) {
  broadcast(room, { t: 'noise', x: +x.toFixed(1), z: +z.toFixed(1), k, id });
  const t = now();
  for (const b of room.players.values()) {
    if (!b.bot || b.role !== SEEKER || b.ai.state === 'chase' || t < (b.ai.noiseCd || 0)) continue;
    if (Math.hypot(b.x - x, b.z - z) > NOISE_RANGE[k] * 0.8) continue;
    b.ai.noiseCd = t + 2;
    b.ai.state = 'noise';
    setGoal(b, x, z);
  }
}

function leaveSpot(room, p, tp = true) {
  if (p.hid < 0) return;
  const s = W.spots[p.hid];
  room.spotOcc.delete(p.hid);
  p.hid = -1;
  if (tp) teleport(p, s.ex, s.ez, s.lv);
}

function startRound(room) {
  const all = [...room.players.values()];
  if (all.length < 2 || room.phase !== 'lobby') return;
  // Sardines turns the teams around: one hider, everybody else seeks
  const nS = room.mode === 6 ? all.length - 1 : room.mode === 9 ? 1 : Math.max(1, Math.floor(all.length / 4)); // and Playground Tag has exactly one "it"
  const order = all.map((p) => [p.seekCount + Math.random() * 0.9, p]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  room.coins.clear(); room.spotOcc.clear(); room.resc = 0; room.winner = null;
  room.items.clear(); room.bc = [0, 0, 0];
  room.startSeekers = nS;
  room.vip = room.mode === 8 ? order[nS + ((Math.random() * (order.length - nS)) | 0)].id : 0;
  resetVehicles(room);
  room.coinGoal = room.mode === 5 ? Math.min(W.coins.length - 6, 4 + 2 * (all.length - nS)) : 0;
  const t = now();
  order.forEach((p, i) => {
    p.role = i < nS ? SEEKER : HIDER;
    if (p.role === SEEKER && room.mode !== 6) p.seekCount++;
    p.st = 0; p.hid = -1; p.rocks = 3; p.stunUntil = 0; p.immUntil = 0; p.tagCd = 0; p.tauntCd = 0; p.f = 0;
    p.ai = { stam: 100, wind: 0 };
    p.item = 0; p.cloakUntil = 0; p.silentUntil = 0; p.boostUntil = 0; p.cnt = {}; p.seen = new Set(); p.thaw = 0;
    p.prop = room.mode === 3 && p.role === HIDER ? 1 + ((Math.random() * (PROPS.length - 1)) | 0) : 0;
    // Prop Hunt has no hiding spots, so skip the challenges that need them
    const pool = CHALLENGES[p.role].filter((c) => (room.mode !== 3 || (c.k !== 'found' && c.k !== 'hide')) && (room.mode !== 6 || c.k !== 'catch')), c = pool[(Math.random() * pool.length) | 0];
    p.ch = { ...c, n: c.k === 'catch' ? Math.min(c.n, order.length - nS) : c.n, done: false };
    if (p.ch.k === 'catch' && p.ch.n < 2) p.ch.text = 'Catch a hider';
    let pos;
    if (p.role === SEEKER) pos = collide(W, W.seekerSpawn[0] + (i - (nS - 1) / 2) * 1.4, W.seekerSpawn[1]);
    else { const a = (i / order.length) * Math.PI * 2; pos = collide(W, Math.cos(a) * 6.5, Math.sin(a) * 6.5); }
    teleport(p, pos[0], pos[1]);
  });
  room.phase = 'hide';
  room.tEnd = t + (room.mode === 7 ? TURBO.hide : room.cfg.hide);
  broadcast(room, { t: 'round', seekers: order.slice(0, nS).map((p) => p.id) });
  for (const p of order) send(p, { t: 'chal', text: p.ch.text });
  feed(room, `${order.slice(0, nS).map((p) => p.name).join(' & ')} ${nS > 1 ? 'are' : 'is'} seeking. Hide!`, 'big');
}

function endRound(room, winner) {
  if (room.phase !== 'seek' && room.phase !== 'hide') return;
  room.phase = 'end';
  room.winner = winner;
  room.tEnd = now() + END_T;
  for (const p of room.players.values()) {
    if (winner === 'hiders' && p.role === HIDER && p.st === 0) p.sc += 100;
    if (winner === 'hiders' && p.id === room.vip) p.sc += 200;
    if (winner === 'seekers' && p.role === SEEKER && room.mode !== 6) p.sc += 50;
    leaveSpot(room, p);
    p.f = 0;
  }
  broadcast(room, { t: 'end', w: winner });
}

function toLobby(room) {
  room.phase = 'lobby';
  room.spotOcc.clear();
  resetVehicles(room);
  for (const p of room.players.values()) {
    p.role = HIDER; p.st = 0; p.hid = -1; p.stunUntil = 0; p.ai = { stam: 100, wind: 0 }; p.prop = 0;
    p.item = 0; p.cloakUntil = 0; p.boostUntil = 0; p.silentUntil = 0; p.ch = null;
    const a = Math.random() * Math.PI * 2;
    const pos = collide(W, Math.cos(a) * 6, Math.sin(a) * 6);
    teleport(p, pos[0], pos[1]);
  }
}

// ---------- vehicles ----------
function resetVehicles(room) {
  room.veh = room.W.vehicles.map((v) => ({ id: v.id, k: v.k, x: v.x, z: v.z, r: v.r, driver: 0, fuel: 100, movedAt: 0, noiseT: 0 }));
  for (const p of room.players.values()) p.veh = -1;
}
function enterVehicle(room, p) {
  if (p.lv || p.prop || p.st || p.hid >= 0 || (p.role === SEEKER && room.phase === 'hide')) return;
  let best = null, bd = VEHICLE.enter;
  for (const v of room.veh) {
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    if (!v.driver && d < bd) { bd = d; best = v; }
  }
  if (!best) return;
  best.driver = p.id;
  p.veh = best.id; p.x = best.x; p.z = best.z; p.f = 0;
}
function exitVehicle(room, p, tp = true) {
  const v = room.veh[p.veh];
  p.veh = -1;
  if (!v) return;
  v.driver = 0;
  if (!tp) return;
  // step out on whichever side has room
  for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
    const x = v.x - Math.sin(v.r + a) * 1.7, z = v.z - Math.cos(v.r + a) * 1.7, c = collide(W, x, z);
    if (Math.hypot(c[0] - x, c[1] - z) < 0.05 && Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1) return teleport(p, x, z);
  }
  teleport(p, v.x, v.z);
}
function updateVehicles(room, dt, t) {
  for (const v of room.veh) {
    const d = v.driver && room.players.get(v.driver);
    if (v.driver && (!d || d.veh !== v.id)) v.driver = 0;
    // fuel is burned per metre driven (see the movement handler); here it only trickles back while parked
    if (d && t - (v.movedAt || 0) < 0.4) {
      // consequences: an engine is the loudest thing on the map
      if (room.phase === 'seek' && d.role === HIDER && !VEHICLES[v.k].quiet && t >= v.noiseT) { emitNoise(room, v.x, v.z, 'engine', d.id); v.noiseT = t + 0.5; }
    } else v.fuel = Math.min(100, v.fuel + (d ? VEHICLE.regen : VEHICLE.idleRegen) * dt);
  }
}

function catchPlayer(room, p, by, how) {
  if (p.st || p.role !== HIDER || room.phase !== 'seek') return;
  if (room.mode === 9) {
    // Playground Tag: the two swap places. The new "it" gets a moment to groan before giving chase.
    if (p.veh >= 0) exitVehicle(room, p, false);
    leaveSpot(room, p);
    by.role = HIDER; by.immUntil = now() + 4; by.item = 0; by.ai = { stam: 100, wind: 0 }; by.sc += 25;
    p.role = SEEKER; p.stunUntil = now() + 2; p.tagCd = now() + 3; p.item = 0; p.f = 0; p.ai = { stam: 100, wind: 0 };
    broadcast(room, { t: 'caught', w: p.id, b: by.id, m: 9 });
    return feed(room, `${by.name} tagged ${p.name}. ${p.name} is it!`, 'bad');
  }
  if (room.mode === 6) {
    // Sardines: the finder squeezes in and hides alongside
    by.role = HIDER; by.item = 0; by.immUntil = now() + 2; by.f = 0;
    by.ai = { stam: 100, wind: 0, state: 'camp', until: now() + 9999 };
    by.sc += 100;
    bump(room, by, 'found');
    broadcast(room, { t: 'caught', w: p.id, b: by.id, m: 6 });
    const left = seekers(room).length;
    return feed(room, `${by.name} found ${p.name} and squeezed in. ${left} still looking.`, 'good');
  }
  const mode = room.mode, where = how ? ` hiding in a ${how}` : '';
  if (p.veh >= 0) exitVehicle(room, p, false);
  leaveSpot(room, p, mode !== 0);
  p.f = 0; p.item = 0; p.prop = 0;
  if (mode === 1) {
    // Infection: the caught player switches sides after a moment of shock
    p.role = SEEKER; p.stunUntil = now() + 3; p.tagCd = now() + 4; p.ai = { stam: 100, wind: 0 };
    feed(room, `${by.name} infected ${p.name}${where}!`, 'bad');
  } else if (mode === 2) {
    p.st = 2; p.thaw = 0;
    feed(room, `${by.name} froze ${p.name}${where}!`, 'bad');
  } else {
    p.st = 1;
    teleport(p, W.jail.x + rand(-1.5, 1.5), W.jail.z + rand(-1.5, 1.5));
    feed(room, how ? `${by.name} found ${p.name}${where}!` : `${by.name} caught ${p.name}!`, 'bad');
  }
  by.sc += 100;
  bump(room, by, 'catch');
  if (how) bump(room, by, 'found');
  broadcast(room, { t: 'caught', w: p.id, b: by.id, m: mode });
  if (mode === 8 && p.id === room.vip) {
    feed(room, `${p.name} was the VIP. The seekers win!`, 'big');
    endRound(room, 'seekers');
  }
}
function tryTag(room, s, t) {
  if (room.phase !== 'seek' || s.role !== SEEKER || t < s.tagCd || t < s.stunUntil) return;
  s.tagCd = t + 0.8;
  const fx = -Math.sin(s.r), fz = -Math.cos(s.r);
  let best = null, bd = room.mode === 10 ? GIANT.reach : 2.7; // giants have long arms
  for (const h of room.players.values()) {
    if (h.role !== HIDER || h.st || h.hid >= 0 || t < h.immUntil || h.lv !== s.lv) continue;
    const dx = h.x - s.x, dz = h.z - s.z, d = Math.hypot(dx, dz);
    if (d >= bd) continue;
    if (d > 1 && (dx * fx + dz * fz) / d < 0.3) continue;
    best = h; bd = d;
  }
  if (best) return catchPlayer(room, best, s);
  // Prop Hunt: swinging at an ordinary crate costs you
  if (room.mode === 3) { s.stunUntil = t + 1.2; s.f = 0; send(s, { t: 'feed', m: 'Just a prop. You are dazed for a moment.', k: 'bad' }); }
}

function searchSpot(room, s, spot, t) {
  if (room.phase !== 'seek' || t < s.stunUntil) return;
  const occ = room.players.get(room.spotOcc.get(spot.id));
  if (occ) return catchPlayer(room, occ, s, spot.kind);
  s.stunUntil = t + 2.5;
  s.f = 0;
  broadcast(room, { t: 'search', id: s.id, s: spot.id });
  feed(room, `${s.name} searched an empty ${spot.kind} and is dazed!`);
}

function useAction(room, p, t) {
  if (p.st || t < p.stunUntil) return;
  if (p.veh >= 0) return exitVehicle(room, p);
  if (p.hid >= 0) return leaveSpot(room, p);
  if (room.mode === 3) return enterVehicle(room, p); // no hiding spots in Prop Hunt: your disguise is your hiding place
  let best = null, bd = 2.3;
  for (const s of W.spots) {
    if (s.lv !== p.lv) continue;
    const d = Math.min(Math.hypot(s.x - p.x, s.z - p.z), Math.hypot(s.ex - p.x, s.ez - p.z));
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) return enterVehicle(room, p);
  if (p.role === SEEKER) return searchSpot(room, p, best, t);
  if (room.phase === 'end') return;
  if (room.spotOcc.has(best.id)) return send(p, { t: 'feed', m: 'Someone is already hiding in there!', k: '' });
  room.spotOcc.set(best.id, p.id);
  p.hid = best.id; p.x = best.x; p.z = best.z; p.lv = best.lv; p.f = 0;
  if (!p.seen.has(best.id)) { p.seen.add(best.id); bump(room, p, 'hide'); }
}

// ---------- challenges, power-ups, beacons, maps ----------
const CHALLENGES = [
  [{ k: 'coin', n: 4, text: 'Collect 4 coins' }, { k: 'taunt', n: 2, text: 'Taunt twice' }, { k: 'rock', n: 2, text: 'Throw 2 rocks' },
    { k: 'hide', n: 3, text: 'Hide in 3 different spots' }, { k: 'beacon', n: 1, text: 'Light a beacon' }, { k: 'item', n: 1, text: 'Use a power-up' }],
  [{ k: 'catch', n: 2, text: 'Catch 2 hiders' }, { k: 'found', n: 1, text: 'Find someone inside a hiding spot' }, { k: 'item', n: 1, text: 'Use a power-up' }],
];
// Count something a player did, and pay out if it finishes their personal challenge for the round.
function bump(room, p, k) {
  p.cnt[k] = (p.cnt[k] || 0) + 1;
  const c = p.ch;
  if (!c || c.done || c.k !== k || p.cnt[k] < c.n) return;
  c.done = true;
  p.sc += 75;
  send(p, { t: 'chal', text: c.text, done: 1 });
  feed(room, `${p.name} completed a challenge: ${c.text} (+75)`, 'good');
}

// 1 energy drink: full stamina and silent sprinting. 2 cloak: invisible. 3 radar: shows hiders. 4 boots: speed.
function useItem(room, p, t) {
  if (room.phase !== 'seek' || !p.item || p.st || t < p.stunUntil) return;
  const k = p.item;
  p.item = 0;
  if (k === 1) { p.silentUntil = t + 8; p.ai.stam = 100; p.ai.wind = 0; }
  else if (k === 2) p.cloakUntil = t + 6;
  else if (k === 4) p.boostUntil = t + 7;
  else {
    const seen = hiders(room).filter((h) => !h.st && h.hid < 0 && t >= h.cloakUntil);
    send(p, { t: 'radar', pts: seen.map((h) => [+h.x.toFixed(1), +h.z.toFixed(1)]) });
    feed(room, `${p.name} swept the area with radar!`, 'bad');
    if (p.bot && seen.length && p.ai.state !== 'chase') {
      const h = seen.sort((a, b) => dist(a, p) - dist(b, p))[0];
      p.ai.state = 'noise';
      setGoal(p, h.x, h.z);
    }
  }
  broadcast(room, { t: 'used', w: p.id, k });
  bump(room, p, 'item');
}

function lightBeacon(room, p, bc) {
  p.sc += 40;
  broadcast(room, { t: 'beacon', id: bc.id, w: p.id });
  emitNoise(room, bc.x, bc.z, 'beacon', p.id);
  bump(room, p, 'beacon');
  const lit = room.bc.filter((v) => v >= 1).length;
  if (lit < room.bc.length) return feed(room, `${p.name} lit a beacon! ${lit} of ${room.bc.length} are burning.`, 'good');
  feed(room, 'All beacons are lit — the hiders escape!', 'big');
  endRound(room, 'hiders');
}

function setMap(room, i) {
  room.map = ((i | 0) % MAPS.length + MAPS.length) % MAPS.length;
  W = room.W = getWorld(room.map);
  resetVehicles(room);
  room.spotOcc.clear();
  for (const p of room.players.values()) {
    p.hid = -1; p.ai = { stam: 100, wind: 0 };
    const a = Math.random() * Math.PI * 2;
    const pos = collide(W, Math.cos(a) * 6, Math.sin(a) * 6);
    teleport(p, pos[0], pos[1]);
  }
  feed(room, `Map changed to ${MAPS[room.map].name}.`);
}

// ---------- bots ----------
function setGoal(b, x, z, lv = 0) {
  b.ai.path = findPath(W, b.x, b.z, b.lv, x, z, lv) || [];
  b.ai.pi = 0;
  return b.ai.path.length > 0;
}

function botMove(b, wantSprint, dt, t) {
  const ai = b.ai, S = b.role === SEEKER ? SPEED.seeker : SPEED.hider;
  if (!ai.path || ai.pi >= ai.path.length) {
    ai.stam = Math.min(100, ai.stam + STAM.regenIdle * dt);
    b.f = 0;
    return true;
  }
  const winded = t < ai.wind;
  if (wantSprint && !winded && (ai.spr ? ai.stam > 0 : ai.stam > 30)) {
    ai.spr = true;
    if (!ai.turbo) ai.stam -= STAM.drain * dt;
    if (ai.stam <= 0) { ai.stam = 0; ai.wind = t + STAM.windedFor; ai.spr = false; }
  } else {
    ai.spr = false;
    ai.stam = Math.min(100, ai.stam + STAM.regenMove * dt);
  }
  const speed = (ai.spr ? S.sprint : winded ? SPEED.winded : S.walk * (ai.slow || 1)) * (t < b.boostUntil ? 1.35 : 1) * (ai.turbo ? TURBO.speed : 1);
  while (ai.pi + 1 < ai.path.length && ai.path[ai.pi][2] === b.lv && ai.path[ai.pi + 1][2] === b.lv && walkable(W, b.x, b.z, ai.path[ai.pi + 1][0], ai.path[ai.pi + 1][1], b.lv)) ai.pi++;
  const [tx, tz] = ai.path[ai.pi];
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  if (d < 0.25) { ai.pi++; return ai.pi >= ai.path.length; }
  const m = Math.min(d, speed * dt);
  [b.x, b.z] = collide(W, b.x + (dx / d) * m, b.z + (dz / d) * m, PR, b.lv);
  b.lv = levelAt(W, b.x, b.z, b.lv)[0];
  b.r = Math.atan2(-dx, -dz);
  b.f = F_MOVE | (ai.spr ? F_SPRINT : 0) | (winded ? F_WIND : 0);
  // stuck detection
  if (t > (ai.stuckT || 0)) {
    if (ai.sx !== undefined && Math.hypot(b.x - ai.sx, b.z - ai.sz) < 0.3) { ai.path = []; return true; }
    ai.sx = b.x; ai.sz = b.z; ai.stuckT = t + 1.5;
  }
  return false;
}

function nearestSeeker(room, b) {
  let best = null, bd = 1e9;
  for (const s of room.players.values()) {
    if (s.role !== SEEKER) continue;
    const d = dist(s, b);
    if (d < bd) { bd = d; best = s; }
  }
  return best && { p: best, d: bd, los: bd < 14 && best.lv === b.lv && hasLOS(W, b.x, b.z, best.x, best.z, b.lv) };
}

function pickHiderPlan(room, b, t) {
  const ai = b.ai, seek = room.phase === 'seek', roll = Math.random();
  ai.slow = 1;
  const frozen = hiders(room).filter((h) => h.st === 2);
  if (seek && frozen.length && roll < 0.45) {
    const f = frozen.sort((a, c) => dist(a, b) - dist(c, b))[0];
    ai.state = 'thaw'; ai.tid = f.id;
    if (setGoal(b, f.x + 0.9, f.z, f.lv)) return;
  }
  if (seek && jailed(room).length && roll < 0.4) {
    ai.state = 'rescue';
    if (setGoal(b, W.lever.x + 1.1, W.lever.z)) return;
  }
  if (seek && roll > 0.88) {
    const open = W.beacons.filter((bc) => room.bc[bc.id] < 1);
    if (open.length) {
      const bc = open[(Math.random() * open.length) | 0];
      ai.state = 'beacon'; ai.bid = bc.id;
      if (setGoal(b, bc.x + 1.1, bc.z)) return;
    }
  }
  if (roll < 0.65 && room.mode !== 3) {
    const free = W.spots.filter((s) => !room.spotOcc.has(s.id) && ![...room.players.values()].some((o) => o !== b && o.bot && o.ai.state === 'spot' && o.ai.spot === s.id));
    if (free.length) {
      const s = free[(Math.random() * free.length) | 0];
      ai.state = 'spot'; ai.spot = s.id;
      if (setGoal(b, s.ex, s.ez, s.lv)) return;
    }
  }
  if (seek && (roll < 0.85 || room.mode === 5)) {
    const open = W.coins.filter((c) => !room.coins.has(c.id)).sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
    if (open.length) {
      const c = open[(Math.random() * Math.min(3, open.length)) | 0];
      ai.state = 'coin';
      if (setGoal(b, c.x, c.z, c.lv)) return;
    }
  }
  for (let i = 0; i < 8; i++) {
    const [x, z, lv] = randomPoint(W);
    if (Math.hypot(x, z) < 16) continue;
    ai.state = 'point';
    if (setGoal(b, x, z, lv)) return;
  }
  ai.state = 'camp'; ai.until = t + 10;
}

function startFlee(room, b, s, t) {
  let best = null, bs = -1e9;
  for (let i = 0; i < 12; i++) {
    const [x, z] = randomPoint(W, true);
    const ds = Math.hypot(x - s.x, z - s.z);
    if (ds < 15) continue;
    // prefer points away from the seeker, not too far from us, and not on the far side of the seeker
    const score = ds - 0.4 * Math.hypot(x - b.x, z - b.z) - ((x - b.x) * (s.x - b.x) + (z - b.z) * (s.z - b.z) > 0 ? 20 : 0);
    if (score > bs) { bs = score; best = [x, z]; }
  }
  if (best && setGoal(b, best[0], best[1])) { b.ai.state = 'flee'; b.ai.fleeT = t + 2.5; }
}

function hiderAI(room, b, dt, t) {
  const ai = b.ai;
  if (b.st) { b.f = 0; ai.state = 'jailed'; ai.path = null; return; }
  if (!ai.state || ai.state === 'jailed') pickHiderPlan(room, b, t);
  const threat = room.phase === 'seek' ? nearestSeeker(room, b) : null;
  if (b.hid >= 0) {
    b.f = 0;
    ai.stam = Math.min(100, ai.stam + STAM.regenIdle * dt);
    if (t > ai.until && room.phase === 'seek' && !(threat && threat.d < 14)) { leaveSpot(room, b); pickHiderPlan(room, b, t); }
    return;
  }
  if (threat && t >= b.immUntil - 3 && (ai.state !== 'flee' || t > ai.fleeT) && (threat.d < 4 || (threat.d < 12 && threat.los))) startFlee(room, b, threat.p, t);
  if (ai.state === 'hold') {
    b.f = F_USE;
    const tw = ai.holdT && room.players.get(ai.holdT);
    if (t > ai.until || (ai.holdT ? !tw || tw.st !== 2 : ai.holdB ? room.bc[ai.holdB - 1] >= 1 : !jailed(room).length)) pickHiderPlan(room, b, t);
    return;
  }
  if (ai.state === 'camp') {
    b.f = F_CROUCH;
    ai.stam = Math.min(100, ai.stam + STAM.regenIdle * dt);
    if (t > ai.until) pickHiderPlan(room, b, t);
    return;
  }
  const arrived = botMove(b, ai.state === 'flee' || room.phase === 'hide', dt, t);
  if (!arrived) return;
  if (ai.state === 'spot') {
    const s = W.spots[ai.spot];
    if (!room.spotOcc.has(s.id) && Math.hypot(s.ex - b.x, s.ez - b.z) < 1.5) {
      room.spotOcc.set(s.id, b.id);
      b.hid = s.id; b.x = s.x; b.z = s.z; b.lv = s.lv; b.f = 0;
      ai.until = t + rand(30, 80);
    } else pickHiderPlan(room, b, t);
  } else if (ai.state === 'rescue' && Math.hypot(W.lever.x - b.x, W.lever.z - b.z) < 2.3) {
    ai.state = 'hold'; ai.holdB = 0; ai.holdT = 0; ai.until = t + 6;
  } else if (ai.state === 'thaw') {
    ai.state = 'hold'; ai.holdB = 0; ai.holdT = ai.tid; ai.until = t + 4;
  } else if (ai.state === 'beacon' && Math.hypot(W.beacons[ai.bid].x - b.x, W.beacons[ai.bid].z - b.z) < 2.3) {
    ai.state = 'hold'; ai.holdB = ai.bid + 1; ai.holdT = 0; ai.until = t + 5;
  } else if (ai.state === 'point') {
    ai.state = 'camp'; ai.until = t + rand(12, 35);
  } else pickHiderPlan(room, b, t);
}

function patrol(room, b) {
  const ai = b.ai;
  ai.sure = false;
  if (Math.random() < 0.45) {
    const s = W.spots[(Math.random() * W.spots.length) | 0];
    ai.state = 'spot'; ai.spot = s.id;
    if (setGoal(b, s.ex, s.ez, s.lv)) return;
  }
  ai.state = 'point';
  if (jailed(room).length && Math.random() < 0.25) { if (setGoal(b, rand(-6, 6), W.jail.z + rand(5, 8))) return; }
  const [x, z, lv] = randomPoint(W);
  setGoal(b, x, z, lv);
}

function seekerAI(room, b, dt, t) {
  const ai = b.ai;
  if (room.phase !== 'seek') { b.f = 0; return; }
  if (!ai.state) patrol(room, b);
  let best = null, bd = 1e9;
  const fx = -Math.sin(b.r), fz = -Math.cos(b.r);
  for (const h of room.players.values()) {
    if (h.role !== HIDER || h.st || h.hid >= 0 || t < h.immUntil || t < h.cloakUntil || h.lv !== b.lv) continue;
    const dx = h.x - b.x, dz = h.z - b.z, d = Math.hypot(dx, dz);
    if (d > (room.mode === 4 ? 10 : 18) || d >= bd) continue; // in a blackout nobody sees far
    // crouching makes you much harder to spot, and a prop that holds still looks like any other prop
    const sneaky = ((h.f & F_CROUCH) && d > 9) || (h.prop && !(h.f & F_MOVE) && d > 4.5);
    if (d > 3 && ((dx * fx + dz * fz) / d < 0.35 || sneaky)) continue;
    if (!hasLOS(W, b.x, b.z, h.x, h.z, b.lv)) continue;
    best = h; bd = d;
  }
  if (best) {
    ai.state = 'chase'; ai.lsx = best.x; ai.lsz = best.z; ai.lsl = best.lv; ai.lost = false;
    if (t > (ai.repath || 0)) { setGoal(b, best.x, best.z, best.lv); ai.repath = t + 0.35; }
    if (bd < 2.0) { b.r = Math.atan2(-(best.x - b.x), -(best.z - b.z)); tryTag(room, b, t); }
  } else if (ai.state === 'chase' && !ai.lost) {
    ai.lost = true;
    setGoal(b, ai.lsx, ai.lsz, ai.lsl);
  }
  const arrived = botMove(b, ai.state === 'chase' || ai.state === 'noise', dt, t);
  if (!arrived || best) return;
  if (ai.state === 'chase' || ai.state === 'noise') {
    // lost them — check the nearest hiding spot, they probably ducked in
    const ox = ai.state === 'chase' ? ai.lsx : b.x, oz = ai.state === 'chase' ? ai.lsz : b.z;
    let near = null, nd = 7;
    for (const s of W.spots) { const d = Math.hypot(s.x - ox, s.z - oz); if (d < nd) { nd = d; near = s; } }
    if (near && Math.random() < 0.8) { ai.state = 'spot'; ai.spot = near.id; ai.sure = ai.lost; if (setGoal(b, near.ex, near.ez, near.lv)) return; }
    patrol(room, b);
  } else if (ai.state === 'spot') {
    const s = W.spots[ai.spot];
    if (Math.hypot(s.ex - b.x, s.ez - b.z) < 1.5 && (ai.sure || Math.random() < 0.4)) searchSpot(room, b, s, t);
    patrol(room, b);
  } else patrol(room, b);
}

function botUpdate(room, b, dt, t) {
  const ai = b.ai;
  if (room.phase === 'lobby' || room.phase === 'end') {
    ai.slow = 0.6;
    if (botMove(b, false, dt, t) && t > (ai.idle || 0)) {
      ai.idle = t + rand(2, 7);
      const [x, z] = randomPoint(W, true);
      if (Math.hypot(x, z) < 22) setGoal(b, x, z);
    }
    return;
  }
  if (t < b.stunUntil) { b.f = 0; return; }
  ai.turbo = room.mode === 7;
  if (b.item && (b.role === SEEKER ? Math.random() < 0.03 : ai.state === 'flee')) useItem(room, b, t);
  if (b.role === SEEKER) seekerAI(room, b, dt, t);
  else hiderAI(room, b, dt, t);
}

// ---------- simulation ----------
function update(room, dt) {
  const t = now();
  updateVehicles(room, dt, t);
  if (room.phase === 'hide' && t >= room.tEnd) {
    room.phase = 'seek'; room.tEnd = t + (room.mode === 7 ? TURBO.seek : room.cfg.seek);
    feed(room, 'Ready or not, here they come!', 'big');
  } else if (room.phase === 'seek' && t >= room.tEnd) endRound(room, 'hiders');
  else if (room.phase === 'end' && t >= room.tEnd) toLobby(room);

  for (const p of room.players.values()) if (p.bot) botUpdate(room, p, dt, t);

  if (room.phase === 'seek') {
    const hs = hiders(room), js = hs.filter((p) => p.st === 1), out = hs.filter((p) => p.st);
    if (room.mode === 6) {
      // Sardines ends when only one seeker is still looking (or none, in a two-player game)
      if (seekers(room).length <= (room.startSeekers > 1 ? 1 : 0)) return endRound(room, 'seekers');
    } else if (!seekers(room).length) return endRound(room, 'hiders');
    if (!hs.length || out.length === hs.length) return endRound(room, 'seekers');

    const second = t >= room.scoreT;
    if (second) room.scoreT = t + 1;
    let rescuer = null;
    // power-up boxes: anyone can grab one, and they come back after 30 seconds
    for (const p of room.players.values()) {
      if (p.st || p.hid >= 0 || p.item || p.lv) continue;
      for (const it of W.items) {
        if ((room.items.get(it.id) || 0) > t || Math.abs(it.x - p.x) > 1.3 || Math.abs(it.z - p.z) > 1.3) continue;
        room.items.set(it.id, t + 30);
        p.item = (p.role === SEEKER ? 3 : 1) + ((Math.random() * 2) | 0);
        broadcast(room, { t: 'item', id: it.id, w: p.id, k: p.item });
        break;
      }
    }
    for (const p of hs) {
      if (p.st === 2) continue;
      if (p.st === 1) {
        // keep prisoners in the cage
        if (Math.abs(p.x - W.jail.x) > 2.15 || Math.abs(p.z - W.jail.z) > 2.15) teleport(p, W.jail.x + rand(-1.5, 1.5), W.jail.z + rand(-1.5, 1.5));
        continue;
      }
      if (second) p.sc += 1;
      if (p.hid >= 0) continue;
      // consequences: running and gasping for breath make noise
      if (t >= p.noiseT) {
        if (t >= p.silentUntil && (p.f & F_SPRINT) && (p.f & F_MOVE)) { emitNoise(room, p.x, p.z, 'run', p.id); p.noiseT = t + 0.6; }
        else if (p.f & F_WIND) { emitNoise(room, p.x, p.z, 'breath', p.id); p.noiseT = t + 1.2; }
      }
      for (const c of W.coins) {
        if (c.lv !== p.lv || room.coins.has(c.id) || Math.abs(c.x - p.x) > 1.2 || Math.abs(c.z - p.z) > 1.2) continue;
        room.coins.add(c.id);
        p.sc += 10;
        bump(room, p, 'coin');
        if (room.coinGoal && room.coins.size >= room.coinGoal) {
          feed(room, 'The hiders pulled off the heist!', 'big');
          endRound(room, 'hiders');
        }
        broadcast(room, { t: 'coin', id: c.id, w: p.id });
      }
      if ((p.f & F_USE) && js.length && Math.hypot(W.lever.x - p.x, W.lever.z - p.z) < 2.4) rescuer = p;
      // Freeze Tag: stand next to a frozen teammate and hold USE to thaw them
      if (p.f & F_USE) for (const fz of out) {
        if (fz.st !== 2 || fz.lv !== p.lv || Math.hypot(fz.x - p.x, fz.z - p.z) > 2.3) continue;
        fz.thawing = t + 0.3;
        fz.thaw += dt / 1.5;
        if (fz.thaw < 1) continue;
        fz.st = 0; fz.thaw = 0; fz.immUntil = t + 3; fz.ai.state = null;
        p.sc += 30;
        bump(room, p, 'rescue');
        broadcast(room, { t: 'freed', b: p.id, n: 1 });
        feed(room, `${p.name} thawed ${fz.name}!`, 'good');
      }
      // objective: hold USE at a beacon to light it; it hums while charging
      if (p.f & F_USE) for (const bc of W.beacons) {
        if (room.bc[bc.id] >= 1 || Math.hypot(bc.x - p.x, bc.z - p.z) > 2.4) continue;
        room.bc[bc.id] = Math.min(1, room.bc[bc.id] + dt / 4);
        if (t >= p.noiseT) { emitNoise(room, bc.x, bc.z, 'run', p.id); p.noiseT = t + 0.7; }
        if (room.bc[bc.id] >= 1) lightBeacon(room, p, bc);
      }
    }
    if (room.phase !== 'seek') return;
    for (const fz of out) if (fz.st === 2 && t > (fz.thawing || 0)) fz.thaw = Math.max(0, fz.thaw - dt);
    if (rescuer) {
      room.resc += dt;
      if (room.resc >= 3) {
        room.resc = 0;
        for (const j of js) {
          j.st = 0; j.immUntil = t + 4; j.ai.state = null;
          const pos = collide(W, W.lever.x + rand(1.5, 4), W.lever.z + rand(-3, 3));
          teleport(j, pos[0], pos[1]);
        }
        rescuer.sc += 50 * js.length;
        bump(room, rescuer, 'rescue');
        broadcast(room, { t: 'freed', b: rescuer.id, n: js.length });
        feed(room, `${rescuer.name} pulled the lever — ${js.length} prisoner${js.length > 1 ? 's' : ''} freed!`, 'good');
      }
    } else room.resc = Math.max(0, room.resc - dt * 2);
  }
}

function snapshot(room) {
  const t = now();
  return ({
    t: 'st', ph: room.phase, tl: Math.max(0, +(room.tEnd - t).toFixed(1)), host: room.host,
    res: +(room.mode === 2 ? Math.max(0, ...[...room.players.values()].map((p) => (p.st === 2 ? p.thaw : 0))) : room.resc / 3).toFixed(2),
    ct: [...room.coins], w: room.winner, mp: room.map, md: room.mode, cg: room.coinGoal || 0, vip: room.vip || 0,
    vh: room.veh.map((v) => [+v.x.toFixed(2), +v.z.toFixed(2), +v.r.toFixed(2), v.driver, Math.round(v.fuel)]),
    bc: room.bc.map((v) => +v.toFixed(2)), it: W.items.filter((o) => (room.items.get(o.id) || 0) > t).map((o) => o.id),
    p: [...room.players.values()].map((p) => [
      p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.r.toFixed(2), p.f, p.role, p.st, p.hid, p.sc,
      (t < p.stunUntil ? 1 : 0) | (t < p.immUntil ? 2 : 0) | (t < p.cloakUntil ? 4 : 0) | (t < p.boostUntil || t < p.silentUntil ? 8 : 0), p.rocks, p.item, p.lv, p.prop || 0, p.veh,
    ]),
  });
}

// Advance the room by dt seconds and send everyone the new state. Returns the snapshot.
export function tickRoom(room, dt) {
  W = room.W;
  update(room, dt);
  const s = snapshot(room);
  broadcast(room, s);
  return s;
}


// ---------- players in and out ----------
const cleanName = (s) => String(s || '').replace(/[^\w \-!?.']/g, '').trim().slice(0, 14) || 'Player';
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// `out(msg, isBroadcast)` delivers a message object to this player. Returns the player, or null if full.
export function joinRoom(room, name, out, look) {
  W = room.W;
  if (room.players.size >= MAX_PLAYERS) return null;
  const t = now();
  const me = makePlayer(room, cleanName(name), out, look);
  if (!room.players.has(room.host) || room.players.get(room.host).bot) room.host = me.id;
  if (room.phase === 'seek' || room.phase === 'hide') me.immUntil = t + 5;
  send(me, { t: 'welcome', id: me.id, room: room.code, x: me.x, z: me.z });
  sendRoster(room);
  feed(room, `${me.name} joined.`);
  return me;
}

// Returns false when no humans are left and the room can be discarded.
export function leaveRoom(room, me) {
  W = room.W;
  if (me.veh >= 0) exitVehicle(room, me, false);
  leaveSpot(room, me, false);
  room.players.delete(me.id);
  const humans = [...room.players.values()].filter((p) => !p.bot);
  if (!humans.length) return false;
  if (room.host === me.id) room.host = humans[0].id;
  sendRoster(room);
  feed(room, `${me.name} left.`);
  return true;
}

export function addBot(room) {
  W = room.W;
  if (room.players.size >= MAX_PLAYERS) return;
  const used = new Set([...room.players.values()].map((p) => p.name));
  makePlayer(room, BOT_NAMES.find((n) => !used.has(n)) || 'Bot' + nextId, null, null);
  sendRoster(room);
}

export function handleMessage(room, me, m) {
  if (!m || typeof m !== 'object' || !room.players.has(me.id)) return;
  W = room.W;
  const t = now();
  if (m.t === 'look') {
    if (t < (me.lookCd || 0)) return;
    me.lookCd = t + 0.3;
    me.look = cleanLook(m.lk); me.color = me.look[1];
    return sendRoster(room);
  }
  if (m.t === 's') {
    if (m.q !== me.q || !num(m.x) || !num(m.z) || !num(m.r)) return;
    me.r = m.r;
    const frozen = me.hid >= 0 || t < me.stunUntil || (me.role === SEEKER && room.phase === 'hide');
    if (frozen) { me.f = 0; return; }
    const x = Math.max(-HALF + PR, Math.min(HALF - PR, m.x)), z = Math.max(-HALF + PR, Math.min(HALF - PR, m.z));
    if (Math.hypot(x - me.x, z - me.z) > 6) return teleport(me, me.x, me.z); // no teleport hacks
    me.x = x; me.z = z; me.f = m.f & 63;
    me.lv = validLevel(W, x, z, m.l === 1 ? 1 : 0);
    const v = room.veh[me.veh];
    if (v) {
      const dd = Math.hypot(x - v.x, z - v.z), K = VEHICLES[v.k];
      if (dd > 0.005) { v.fuel = Math.max(0, v.fuel - (dd * K.drain) / K.max); v.movedAt = t; }
      v.x = x; v.z = z; me.lv = 0;
      if (num(m.vr)) v.r = m.vr;
    }
  } else if (m.t === 'a') {
    if (m.a === 'use') useAction(room, me, t);
    else if (m.a === 'tag') tryTag(room, me, t);
    else if (m.a === 'item') useItem(room, me, t);
    else if (m.a === 'land') {
      // consequences: dropping from a height lands with a thump that seekers can hear
      if (room.phase !== 'seek' || me.role !== HIDER || me.st || t < (me.landCd || 0)) return;
      me.landCd = t + 1;
      emitNoise(room, me.x, me.z, 'run', me.id);
    }
    else if (m.a === 'prop') {
      if (room.mode !== 3 || me.role !== HIDER || me.st || t < (me.propCd || 0) || (room.phase !== 'seek' && room.phase !== 'hide')) return;
      me.propCd = t + 0.6;
      me.prop = (me.prop % (PROPS.length - 1)) + 1;
    }
    else if (m.a === 'taunt') {
      if (room.phase !== 'seek' || me.role !== HIDER || me.st || t < me.tauntCd) return;
      me.tauntCd = t + 10; me.sc += 15;
      bump(room, me, 'taunt');
      emitNoise(room, me.x, me.z, 'taunt', me.id);
      feed(room, `${me.name} taunted the seekers! (+15)`);
    } else if (m.a === 'rock') {
      if (room.phase !== 'seek' || me.role !== HIDER || me.st || me.hid >= 0 || me.rocks <= 0 || !num(m.x) || !num(m.z)) return;
      me.rocks--;
      bump(room, me, 'rock');
      let dx = m.x - me.x, dz = m.z - me.z;
      const d = Math.hypot(dx, dz) || 1, k = Math.min(1, 16 / d);
      const x = Math.max(-HALF + 1, Math.min(HALF - 1, me.x + dx * k)), z = Math.max(-HALF + 1, Math.min(HALF - 1, me.z + dz * k));
      broadcast(room, { t: 'rock', id: me.id, fx: me.x, fz: me.z, x, z });
      const r = room;
      setTimeout(() => { W = r.W; if (r.phase === 'seek') emitNoise(r, x, z, 'rock', me.id); }, 650);
    }
  } else if (m.t === 'lobby') {
    if (me.id !== room.host || room.phase !== 'lobby') return;
    if (m.a === 'start') {
      if (room.players.size < 2) return send(me, { t: 'feed', m: 'Need at least 2 players — add a bot!', k: '' });
      startRound(room);
    } else if (m.a === 'addBot') addBot(room);
    else if (m.a === 'map') setMap(room, room.map + 1);
    else if (m.a === 'mode') { room.mode = (room.mode + 1) % MODES.length; feed(room, `Game mode: ${MODES[room.mode].name}.`); }
    else if (m.a === 'delBot') {
      const b = [...room.players.values()].reverse().find((p) => p.bot);
      if (b) { room.players.delete(b.id); sendRoster(room); }
    }
  } else if (m.t === 'chat') {
    const text = String(m.m || '').replace(/[\u0000-\u001f]/g, '').slice(0, 120).trim();
    if (text && t > (me.chatCd || 0)) { me.chatCd = t + 0.5; broadcast(room, { t: 'chat', id: me.id, m: text }); }
  }
}
