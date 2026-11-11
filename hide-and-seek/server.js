// Dusk Hollow — multiplayer hide & seek server.
// Serves the client, runs rooms, referees the rules and drives the bots.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  getWorld, collide, hasLOS, findPath, walkable, randomPoint,
  PR, HALF, SPEED, STAM, NOISE_RANGE, F_SPRINT, F_CROUCH, F_MOVE, F_USE, F_WIND,
} from './shared/world.js';

const W = getWorld();
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HIDE_T = +process.env.HIDE_T || 25, SEEK_T = +process.env.SEEK_T || 180, END_T = 10, TICK = 15;
const MAX_PLAYERS = 16;
const HIDER = 0, SEEKER = 1;
const BOT_NAMES = ['Pixel', 'Mochi', 'Biscuit', 'Ziggy', 'Noodle', 'Waffles', 'Turbo', 'Pickle', 'Gizmo', 'Sprout', 'Bean', 'Comet'];

// ---------- static files ----------
const ROOTS = [
  ['/shared/', path.join(DIR, 'shared')],
  ['/vendor/', path.join(DIR, 'node_modules/three/build')],
  ['/', path.join(DIR, 'public')],
];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { url = '/'; }
  if (url === '/') url = '/index.html';
  for (const [prefix, root] of ROOTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.normalize(path.join(root, url.slice(prefix.length)));
    if (!file.startsWith(root + path.sep)) break;
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
  res.writeHead(404);
  res.end('Not found');
});

// ---------- rooms ----------
const rooms = new Map();
let nextId = 1;
const now = () => Date.now() / 1000;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function makeRoom(code) {
  const room = {
    code, players: new Map(), phase: 'lobby', tEnd: 0, host: null,
    coins: new Set(), spotOcc: new Map(), resc: 0, scoreT: 0, winner: null,
  };
  rooms.set(code, room);
  return room;
}

function makePlayer(room, name, ws) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  let color = 0;
  while (used.has(color)) color++;
  const a = Math.random() * Math.PI * 2;
  const [x, z] = collide(W, Math.cos(a) * 6, Math.sin(a) * 6);
  const p = {
    id: nextId++, ws, bot: !ws, name, color, role: HIDER, st: 0, hid: -1,
    x, z, r: 0, f: 0, sc: 0, q: 0, stunUntil: 0, immUntil: 0, tagCd: 0, tauntCd: 0, rocks: 3,
    seekCount: 0, noiseT: 0, ai: { stam: 100, wind: 0 },
  };
  room.players.set(p.id, p);
  return p;
}

const send = (p, msg) => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
function broadcast(room, msg) {
  const s = JSON.stringify(msg);
  for (const p of room.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s);
}
const feed = (room, m, k = '') => broadcast(room, { t: 'feed', m, k });
function sendRoster(room) {
  broadcast(room, { t: 'ro', p: [...room.players.values()].map((p) => ({ id: p.id, n: p.name, c: p.color, bot: p.bot })) });
}
function teleport(p, x, z) {
  p.x = x; p.z = z; p.q++;
  send(p, { t: 'tp', x, z, q: p.q });
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
  if (tp) teleport(p, s.ex, s.ez);
}

function startRound(room) {
  const all = [...room.players.values()];
  if (all.length < 2 || room.phase !== 'lobby') return;
  const nS = Math.max(1, Math.floor(all.length / 4));
  const order = all.map((p) => [p.seekCount + Math.random() * 0.9, p]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  room.coins.clear(); room.spotOcc.clear(); room.resc = 0; room.winner = null;
  const t = now();
  order.forEach((p, i) => {
    p.role = i < nS ? SEEKER : HIDER;
    if (p.role === SEEKER) p.seekCount++;
    p.st = 0; p.hid = -1; p.rocks = 3; p.stunUntil = 0; p.immUntil = 0; p.tagCd = 0; p.tauntCd = 0; p.f = 0;
    p.ai = { stam: 100, wind: 0 };
    let pos;
    if (p.role === SEEKER) pos = collide(W, W.seekerSpawn[0] + (i - (nS - 1) / 2) * 1.4, W.seekerSpawn[1]);
    else { const a = (i / order.length) * Math.PI * 2; pos = collide(W, Math.cos(a) * 6.5, Math.sin(a) * 6.5); }
    teleport(p, pos[0], pos[1]);
  });
  room.phase = 'hide';
  room.tEnd = t + HIDE_T;
  broadcast(room, { t: 'round', seekers: order.slice(0, nS).map((p) => p.id) });
  feed(room, `${order.slice(0, nS).map((p) => p.name).join(' & ')} ${nS > 1 ? 'are' : 'is'} seeking. Hide!`, 'big');
}

function endRound(room, winner) {
  if (room.phase !== 'seek' && room.phase !== 'hide') return;
  room.phase = 'end';
  room.winner = winner;
  room.tEnd = now() + END_T;
  for (const p of room.players.values()) {
    if (winner === 'hiders' && p.role === HIDER && p.st === 0) p.sc += 100;
    if (winner === 'seekers' && p.role === SEEKER) p.sc += 50;
    leaveSpot(room, p);
    p.f = 0;
  }
  broadcast(room, { t: 'end', w: winner });
}

function toLobby(room) {
  room.phase = 'lobby';
  room.spotOcc.clear();
  for (const p of room.players.values()) {
    p.role = HIDER; p.st = 0; p.hid = -1; p.stunUntil = 0; p.ai = { stam: 100, wind: 0 };
    const a = Math.random() * Math.PI * 2;
    const pos = collide(W, Math.cos(a) * 6, Math.sin(a) * 6);
    teleport(p, pos[0], pos[1]);
  }
}

function catchPlayer(room, p, by, how) {
  if (p.st === 1 || room.phase !== 'seek') return;
  leaveSpot(room, p, false);
  p.st = 1; p.f = 0;
  teleport(p, W.jail.x + rand(-1.5, 1.5), W.jail.z + rand(-1.5, 1.5));
  by.sc += 100;
  broadcast(room, { t: 'caught', w: p.id, b: by.id });
  feed(room, how ? `${by.name} found ${p.name} hiding in a ${how}!` : `${by.name} caught ${p.name}!`, 'bad');
}

function tryTag(room, s, t) {
  if (room.phase !== 'seek' || s.role !== SEEKER || t < s.tagCd || t < s.stunUntil) return;
  s.tagCd = t + 0.8;
  const fx = -Math.sin(s.r), fz = -Math.cos(s.r);
  let best = null, bd = 2.7;
  for (const h of room.players.values()) {
    if (h.role !== HIDER || h.st || h.hid >= 0 || t < h.immUntil) continue;
    const dx = h.x - s.x, dz = h.z - s.z, d = Math.hypot(dx, dz);
    if (d >= bd) continue;
    if (d > 1 && (dx * fx + dz * fz) / d < 0.3) continue;
    best = h; bd = d;
  }
  if (best) catchPlayer(room, best, s);
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
  if (p.st === 1 || t < p.stunUntil) return;
  if (p.hid >= 0) return leaveSpot(room, p);
  let best = null, bd = 2.3;
  for (const s of W.spots) {
    const d = Math.min(Math.hypot(s.x - p.x, s.z - p.z), Math.hypot(s.ex - p.x, s.ez - p.z));
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) return;
  if (p.role === SEEKER) return searchSpot(room, p, best, t);
  if (room.phase === 'end') return;
  if (room.spotOcc.has(best.id)) return send(p, { t: 'feed', m: 'Someone is already hiding in there!', k: '' });
  room.spotOcc.set(best.id, p.id);
  p.hid = best.id; p.x = best.x; p.z = best.z; p.f = 0;
}

// ---------- bots ----------
function setGoal(b, x, z) {
  b.ai.path = findPath(W, b.x, b.z, x, z) || [];
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
    ai.stam -= STAM.drain * dt;
    if (ai.stam <= 0) { ai.stam = 0; ai.wind = t + STAM.windedFor; ai.spr = false; }
  } else {
    ai.spr = false;
    ai.stam = Math.min(100, ai.stam + STAM.regenMove * dt);
  }
  const speed = ai.spr ? S.sprint : winded ? SPEED.winded : S.walk * (ai.slow || 1);
  while (ai.pi + 1 < ai.path.length && walkable(W, b.x, b.z, ai.path[ai.pi + 1][0], ai.path[ai.pi + 1][1])) ai.pi++;
  const [tx, tz] = ai.path[ai.pi];
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  if (d < 0.25) { ai.pi++; return ai.pi >= ai.path.length; }
  const m = Math.min(d, speed * dt);
  [b.x, b.z] = collide(W, b.x + (dx / d) * m, b.z + (dz / d) * m);
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
  return best && { p: best, d: bd, los: bd < 14 && hasLOS(W, b.x, b.z, best.x, best.z) };
}

function pickHiderPlan(room, b, t) {
  const ai = b.ai, seek = room.phase === 'seek', roll = Math.random();
  ai.slow = 1;
  if (seek && jailed(room).length && roll < 0.4) {
    ai.state = 'rescue';
    if (setGoal(b, W.lever.x + 1.1, W.lever.z)) return;
  }
  if (roll < 0.65) {
    const free = W.spots.filter((s) => !room.spotOcc.has(s.id) && ![...room.players.values()].some((o) => o !== b && o.bot && o.ai.state === 'spot' && o.ai.spot === s.id));
    if (free.length) {
      const s = free[(Math.random() * free.length) | 0];
      ai.state = 'spot'; ai.spot = s.id;
      if (setGoal(b, s.ex, s.ez)) return;
    }
  }
  if (seek && roll < 0.85) {
    const open = W.coins.filter((c) => !room.coins.has(c.id)).sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
    if (open.length) {
      const c = open[(Math.random() * Math.min(3, open.length)) | 0];
      ai.state = 'coin';
      if (setGoal(b, c.x, c.z)) return;
    }
  }
  for (let i = 0; i < 8; i++) {
    const [x, z] = randomPoint(W);
    if (Math.hypot(x, z) < 16) continue;
    ai.state = 'point';
    if (setGoal(b, x, z)) return;
  }
  ai.state = 'camp'; ai.until = t + 10;
}

function startFlee(room, b, s, t) {
  let best = null, bs = -1e9;
  for (let i = 0; i < 12; i++) {
    const [x, z] = randomPoint(W);
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
  if (b.st === 1) { b.f = 0; ai.state = 'jailed'; ai.path = null; return; }
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
    if (!jailed(room).length || t > ai.until) pickHiderPlan(room, b, t);
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
      b.hid = s.id; b.x = s.x; b.z = s.z; b.f = 0;
      ai.until = t + rand(30, 80);
    } else pickHiderPlan(room, b, t);
  } else if (ai.state === 'rescue' && Math.hypot(W.lever.x - b.x, W.lever.z - b.z) < 2.3) {
    ai.state = 'hold'; ai.until = t + 6;
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
    if (setGoal(b, s.ex, s.ez)) return;
  }
  ai.state = 'point';
  if (jailed(room).length && Math.random() < 0.25) { if (setGoal(b, rand(-6, 6), W.jail.z + rand(5, 8))) return; }
  const [x, z] = randomPoint(W);
  setGoal(b, x, z);
}

function seekerAI(room, b, dt, t) {
  const ai = b.ai;
  if (room.phase !== 'seek') { b.f = 0; return; }
  if (!ai.state) patrol(room, b);
  let best = null, bd = 1e9;
  const fx = -Math.sin(b.r), fz = -Math.cos(b.r);
  for (const h of room.players.values()) {
    if (h.role !== HIDER || h.st || h.hid >= 0 || t < h.immUntil) continue;
    const dx = h.x - b.x, dz = h.z - b.z, d = Math.hypot(dx, dz);
    if (d > 18 || d >= bd) continue;
    const sneaky = (h.f & F_CROUCH) && d > 9; // crouching makes you much harder to spot
    if (d > 3 && ((dx * fx + dz * fz) / d < 0.35 || sneaky)) continue;
    if (!hasLOS(W, b.x, b.z, h.x, h.z)) continue;
    best = h; bd = d;
  }
  if (best) {
    ai.state = 'chase'; ai.lsx = best.x; ai.lsz = best.z; ai.lost = false;
    if (t > (ai.repath || 0)) { setGoal(b, best.x, best.z); ai.repath = t + 0.35; }
    if (bd < 2.0) { b.r = Math.atan2(-(best.x - b.x), -(best.z - b.z)); tryTag(room, b, t); }
  } else if (ai.state === 'chase' && !ai.lost) {
    ai.lost = true;
    setGoal(b, ai.lsx, ai.lsz);
  }
  const arrived = botMove(b, ai.state === 'chase' || ai.state === 'noise', dt, t);
  if (!arrived || best) return;
  if (ai.state === 'chase' || ai.state === 'noise') {
    // lost them — check the nearest hiding spot, they probably ducked in
    const ox = ai.state === 'chase' ? ai.lsx : b.x, oz = ai.state === 'chase' ? ai.lsz : b.z;
    let near = null, nd = 7;
    for (const s of W.spots) { const d = Math.hypot(s.x - ox, s.z - oz); if (d < nd) { nd = d; near = s; } }
    if (near && Math.random() < 0.8) { ai.state = 'spot'; ai.spot = near.id; ai.sure = ai.lost; if (setGoal(b, near.ex, near.ez)) return; }
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
      const [x, z] = randomPoint(W);
      if (Math.hypot(x, z) < 22) setGoal(b, x, z);
    }
    return;
  }
  if (t < b.stunUntil) { b.f = 0; return; }
  if (b.role === SEEKER) seekerAI(room, b, dt, t);
  else hiderAI(room, b, dt, t);
}

// ---------- simulation ----------
function update(room, dt) {
  const t = now();
  if (room.phase === 'hide' && t >= room.tEnd) {
    room.phase = 'seek'; room.tEnd = t + SEEK_T;
    feed(room, 'Ready or not, here they come!', 'big');
  } else if (room.phase === 'seek' && t >= room.tEnd) endRound(room, 'hiders');
  else if (room.phase === 'end' && t >= room.tEnd) toLobby(room);

  for (const p of room.players.values()) if (p.bot) botUpdate(room, p, dt, t);

  if (room.phase === 'seek') {
    const hs = hiders(room), js = hs.filter((p) => p.st === 1);
    if (!seekers(room).length) return endRound(room, 'hiders');
    if (!hs.length || js.length === hs.length) return endRound(room, 'seekers');

    const second = t >= room.scoreT;
    if (second) room.scoreT = t + 1;
    let rescuer = null;
    for (const p of hs) {
      if (p.st === 1) {
        // keep prisoners in the cage
        if (Math.abs(p.x - W.jail.x) > 2.15 || Math.abs(p.z - W.jail.z) > 2.15) teleport(p, W.jail.x + rand(-1.5, 1.5), W.jail.z + rand(-1.5, 1.5));
        continue;
      }
      if (second) p.sc += 1;
      if (p.hid >= 0) continue;
      // consequences: running and gasping for breath make noise
      if (t >= p.noiseT) {
        if ((p.f & F_SPRINT) && (p.f & F_MOVE)) { emitNoise(room, p.x, p.z, 'run', p.id); p.noiseT = t + 0.6; }
        else if (p.f & F_WIND) { emitNoise(room, p.x, p.z, 'breath', p.id); p.noiseT = t + 1.2; }
      }
      for (const c of W.coins) {
        if (room.coins.has(c.id) || Math.abs(c.x - p.x) > 1.2 || Math.abs(c.z - p.z) > 1.2) continue;
        room.coins.add(c.id);
        p.sc += 10;
        broadcast(room, { t: 'coin', id: c.id, w: p.id });
      }
      if ((p.f & F_USE) && js.length && Math.hypot(W.lever.x - p.x, W.lever.z - p.z) < 2.4) rescuer = p;
    }
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
        broadcast(room, { t: 'freed', b: rescuer.id, n: js.length });
        feed(room, `${rescuer.name} pulled the lever — ${js.length} prisoner${js.length > 1 ? 's' : ''} freed!`, 'good');
      }
    } else room.resc = Math.max(0, room.resc - dt * 2);
  }
}

function snapshot(room) {
  const t = now();
  return JSON.stringify({
    t: 'st', ph: room.phase, tl: Math.max(0, +(room.tEnd - t).toFixed(1)), host: room.host,
    res: +(room.resc / 3).toFixed(2), ct: [...room.coins], w: room.winner,
    p: [...room.players.values()].map((p) => [
      p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.r.toFixed(2), p.f, p.role, p.st, p.hid, p.sc,
      (t < p.stunUntil ? 1 : 0) | (t < p.immUntil ? 2 : 0), p.rocks,
    ]),
  });
}

setInterval(() => {
  for (const room of rooms.values()) {
    update(room, 1 / TICK);
    const s = snapshot(room);
    for (const p of room.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
}, 1000 / TICK);

// ---------- networking ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const cleanName = (s) => String(s || '').replace(/[^\w \-!?.']/g, '').trim().slice(0, 14) || 'Player';
const num = (v) => typeof v === 'number' && Number.isFinite(v);

wss.on('connection', (ws) => {
  let room = null, me = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const t = now();

    if (m.t === 'join') {
      if (me) return;
      let code = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (!code) do { code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[(Math.random() * 24) | 0]).join(''); } while (rooms.has(code));
      room = rooms.get(code) || makeRoom(code);
      if (room.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'err', m: 'That room is full.' })); room = null; return; }
      me = makePlayer(room, cleanName(m.name), ws);
      if (!room.players.has(room.host) || room.players.get(room.host).bot) room.host = me.id;
      if (room.phase === 'seek' || room.phase === 'hide') me.immUntil = t + 5;
      send(me, { t: 'welcome', id: me.id, room: code, x: me.x, z: me.z, cfg: { hide: HIDE_T, seek: SEEK_T } });
      sendRoster(room);
      feed(room, `${me.name} joined.`);
      return;
    }
    if (!me) return;

    if (m.t === 's') {
      if (m.q !== me.q || !num(m.x) || !num(m.z) || !num(m.r)) return;
      me.r = m.r;
      const frozen = me.hid >= 0 || t < me.stunUntil || (me.role === SEEKER && room.phase === 'hide');
      if (frozen) { me.f = 0; return; }
      const x = Math.max(-HALF + PR, Math.min(HALF - PR, m.x)), z = Math.max(-HALF + PR, Math.min(HALF - PR, m.z));
      if (Math.hypot(x - me.x, z - me.z) > 6) return teleport(me, me.x, me.z); // no teleport hacks
      me.x = x; me.z = z; me.f = m.f & 31;
    } else if (m.t === 'a') {
      if (m.a === 'use') useAction(room, me, t);
      else if (m.a === 'tag') tryTag(room, me, t);
      else if (m.a === 'taunt') {
        if (room.phase !== 'seek' || me.role !== HIDER || me.st || t < me.tauntCd) return;
        me.tauntCd = t + 10; me.sc += 15;
        emitNoise(room, me.x, me.z, 'taunt', me.id);
        feed(room, `${me.name} taunted the seekers! (+15)`);
      } else if (m.a === 'rock') {
        if (room.phase !== 'seek' || me.role !== HIDER || me.st || me.hid >= 0 || me.rocks <= 0 || !num(m.x) || !num(m.z)) return;
        me.rocks--;
        let dx = m.x - me.x, dz = m.z - me.z;
        const d = Math.hypot(dx, dz) || 1, k = Math.min(1, 16 / d);
        const x = Math.max(-HALF + 1, Math.min(HALF - 1, me.x + dx * k)), z = Math.max(-HALF + 1, Math.min(HALF - 1, me.z + dz * k));
        broadcast(room, { t: 'rock', id: me.id, fx: me.x, fz: me.z, x, z });
        const r = room;
        setTimeout(() => { if (r.phase === 'seek') emitNoise(r, x, z, 'rock', me.id); }, 650);
      }
    } else if (m.t === 'lobby') {
      if (me.id !== room.host || room.phase !== 'lobby') return;
      if (m.a === 'start') {
        if (room.players.size < 2) return send(me, { t: 'feed', m: 'Need at least 2 players — add a bot!', k: '' });
        startRound(room);
      } else if (m.a === 'addBot' && room.players.size < MAX_PLAYERS) {
        const used = new Set([...room.players.values()].map((p) => p.name));
        makePlayer(room, BOT_NAMES.find((n) => !used.has(n)) || 'Bot' + nextId, null);
        sendRoster(room);
      } else if (m.a === 'delBot') {
        const b = [...room.players.values()].reverse().find((p) => p.bot);
        if (b) { room.players.delete(b.id); sendRoster(room); }
      }
    } else if (m.t === 'chat') {
      const text = String(m.m || '').replace(/[\u0000-\u001f]/g, '').slice(0, 120).trim();
      if (text && t > (me.chatCd || 0)) { me.chatCd = t + 0.5; broadcast(room, { t: 'chat', id: me.id, m: text }); }
    }
  });

  ws.on('close', () => {
    if (!me || !room) return;
    leaveSpot(room, me, false);
    room.players.delete(me.id);
    const humans = [...room.players.values()].filter((p) => !p.bot);
    if (!humans.length) return rooms.delete(room.code);
    if (room.host === me.id) room.host = humans[0].id;
    sendRoster(room);
    feed(room, `${me.name} left.`);
  });
  ws.on('error', () => {});
});

server.listen(PORT, () => console.log(`Dusk Hollow running → http://localhost:${PORT}`));
