// Emberfall server: static file host + authoritative co-op simulation (enemies, loot, night defense).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { generateDungeon, dungeonCollide, dungeonLOS } from './public/shared/dungeon.js';
import { ENEMIES, levelMul } from './public/shared/enemies.js';
import { generateItem } from './public/shared/items.js';
import { RNG } from './public/shared/rng.js';
import { TOWN, DARK, STRUCTURES } from './public/shared/world.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  let base = PUBLIC, rel = url;
  if (url.startsWith('/lib/three/')) { base = THREE_DIR; rel = url.slice('/lib/three'.length); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
const rng = new RNG(Date.now() & 0xffffffff);
const DT = 0.05;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const r2 = (v) => Math.round(v * 100) / 100;

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}

class Zone {
  constructor(room, key, type, level) {
    this.room = room; this.key = key; this.type = type; this.level = level;
    this.enemies = new Map(); this.projectiles = new Map();
    this.cleared = false; this.emptyT = 0; this.respawnT = 0;
    if (type === 'dungeon') {
      this.seed = (Math.random() * 1e9) | 0;
      this.dungeon = generateDungeon(this.seed, level);
      for (const s of this.dungeon.spawns) this.spawn(s.type, s.x, s.z);
    }
  }
  players() { return [...this.room.players.values()].filter((p) => p.zone === this.key); }
  alive() { return this.players().filter((p) => !p.dead); }
  broadcast(msg) { const s = JSON.stringify(msg); for (const p of this.players()) if (p.ws.readyState === 1) p.ws.send(s); }

  spawn(type, x, z, extra = {}) {
    const def = ENEMIES[type];
    const lvl = this.type === 'dungeon' ? this.level : this.room.level;
    const m = levelMul(lvl);
    const e = {
      id: this.room.nextId++, type, def, x, z, ry: rng.range(0, 6.28), level: lvl,
      hp: Math.round(def.hp * m.hp), maxHp: Math.round(def.hp * m.hp), dmg: Math.round(def.dmg * m.dmg), gold: def.gold * m.gold,
      cd: rng.range(0.3, 1.2), windT: 0, slamT: 0, slamCd: 6, aggro: false, home: { x, z }, slow: 0, wp: 0,
      summoned: 0, state: 0, wanderT: 0, wx: x, wz: z, ...extra,
    };
    this.enemies.set(e.id, e);
    return e;
  }

  collide(pos, r) {
    if (this.dungeon) dungeonCollide(this.dungeon, pos, r);
    else if (this.type === 'dark') { const d = Math.hypot(pos.x, pos.z); if (d > DARK.bound - 4) { pos.x *= (DARK.bound - 4) / d; pos.z *= (DARK.bound - 4) / d; } }
  }

  tick(dt) {
    const alive = this.alive();
    for (const e of this.enemies.values()) this.tickEnemy(e, dt, alive);
    this.tickProjectiles(dt, alive);
    if (this.type === 'dark') {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.enemies.size < 9 && this.players().length) {
        this.respawnT = 7;
        const a = rng.range(0, Math.PI * 2), r = rng.range(26, 62);
        this.spawn(rng.chance(0.75) ? 'wraith' : 'imp', Math.cos(a) * r, Math.sin(a) * r);
      }
    }
  }

  findTarget(e, alive) {
    let best = null, bd = 1e9;
    const range = e.aggro ? e.def.aggro * 2.2 : e.def.aggro;
    for (const p of alive) {
      const d = dist(e, p);
      if (d < range && d < bd) {
        if (this.dungeon && !e.aggro && !dungeonLOS(this.dungeon, e.x, e.z, p.x, p.z)) continue;
        bd = d; best = p;
      }
    }
    return best;
  }

  tickEnemy(e, dt, alive) {
    const def = e.def;
    e.cd -= dt; e.slow = Math.max(0, e.slow - dt);
    if (e.windT > 0) {
      e.windT -= dt;
      if (e.windT <= 0) this.resolveAttack(e);
      return;
    }
    if (e.slamT > 0) {
      e.slamT -= dt;
      if (e.slamT <= 0) {
        for (const p of alive) if (dist(p, e) < 6.5) send(p.ws, { t: 'hurt', dmg: Math.round(e.dmg * 1.7), from: e.id, kb: 1 });
      }
      return;
    }
    let tx, tz, reach, target = null;
    const defense = this.type === 'town';
    if (defense) {
      const p = this.findTarget({ ...e, aggro: false, def: { aggro: 7 } }, alive);
      const bar = [...this.room.structures.values()].find((s) => s.kind === 'barricade' && dist(s, e) < 2.4 + def.radius);
      if (p) { target = { kind: 'player', p }; tx = p.x; tz = p.z; reach = def.range + 0.4; }
      else if (bar) { target = { kind: 'struct', s: bar }; tx = bar.x; tz = bar.z; reach = def.range + 1.2; }
      else {
        const path = e.path;
        if (e.wp < path.length) {
          tx = path[e.wp].x; tz = path[e.wp].z; reach = 1.5;
          if (Math.hypot(tx - e.x, tz - e.z) < 2) e.wp++;
        } else { target = { kind: 'core' }; tx = TOWN.core.x; tz = TOWN.core.z; reach = TOWN.core.r + def.range * (def.ranged ? 0.6 : 1); }
      }
    } else {
      const p = this.findTarget(e, alive);
      if (p) { e.aggro = true; target = { kind: 'player', p }; tx = p.x; tz = p.z; reach = def.ranged ? def.range : def.range + 0.4; }
      else {
        e.aggro = false;
        if (this.type === 'dark') {
          e.wanderT -= dt;
          if (e.wanderT <= 0) { e.wanderT = rng.range(2, 5); e.wx = e.home.x + rng.range(-8, 8); e.wz = e.home.z + rng.range(-8, 8); }
          tx = e.wx; tz = e.wz; reach = 1;
        } else { tx = e.home.x; tz = e.home.z; reach = 1; }
      }
    }
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d > 0.01) e.ry = Math.atan2(dx, dz);
    if (def.boss && target && target.kind === 'player') {
      e.slamCd -= dt;
      if (e.slamCd <= 0 && d < 9) {
        e.slamCd = rng.range(6, 9); e.slamT = 1.3;
        this.broadcast({ t: 'slam', id: e.id, x: r2(e.x), z: r2(e.z), r: 6.5, delay: 1.3 });
        return;
      }
      const frac = e.hp / e.maxHp;
      if ((frac < 0.6 && e.summoned === 0) || (frac < 0.3 && e.summoned === 1)) {
        e.summoned++;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          const s = this.spawn(k % 2 ? 'skeleton' : 'imp', e.x + Math.cos(a) * 3, e.z + Math.sin(a) * 3, { aggro: true });
          this.collide(s, s.def.radius);
        }
        this.broadcast({ t: 'summon', id: e.id, x: r2(e.x), z: r2(e.z) });
      }
    }
    let moving = false;
    if (d > reach) {
      const sp = def.speed * (e.slow > 0 ? 0.5 : 1) * (target || defense ? 1 : 0.45);
      const step = Math.min(d - reach * 0.8, sp * dt);
      e.x += (dx / d) * step; e.z += (dz / d) * step;
      moving = true;
    } else if (target && e.cd <= 0) {
      e.windT = def.windup; e.cd = def.cd; e.atk = target;
      this.broadcast({ t: 'eatk', id: e.id });
    }
    // separation
    for (const o of this.enemies.values()) {
      if (o === e) continue;
      const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), min = def.radius + o.def.radius;
      if (od < min && od > 0.001) { const push = (min - od) * 0.5; e.x += (ox / od) * push; e.z += (oz / od) * push; }
    }
    this.collide(e, def.radius);
    e.state = moving ? 1 : 0;
  }

  resolveAttack(e) {
    const t = e.atk; if (!t) return;
    const def = e.def;
    if (def.ranged) {
      let tx, tz;
      if (t.kind === 'player') { tx = t.p.x; tz = t.p.z; } else if (t.kind === 'struct') { tx = t.s.x; tz = t.s.z; } else { tx = 0; tz = 0; }
      const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
      const id = this.room.nextId++;
      const pr = { id, x: e.x + (dx / d) * 0.8, z: e.z + (dz / d) * 0.8, vx: (dx / d) * 13, vz: (dz / d) * 13, dmg: e.dmg, life: 2, kind: 'bolt', target: t };
      this.projectiles.set(id, pr);
      this.broadcast({ t: 'proj', id, kind: 'bolt', x: r2(pr.x), z: r2(pr.z), vx: r2(pr.vx), vz: r2(pr.vz) });
      return;
    }
    const reach = def.range * 1.5 + 0.6;
    if (t.kind === 'player') {
      if (!t.p.dead && t.p.zone === this.key && dist(t.p, e) < reach) send(t.p.ws, { t: 'hurt', dmg: e.dmg, from: e.id });
    } else if (t.kind === 'struct') this.room.damageStruct(t.s, e.dmg * 1.5);
    else if (t.kind === 'core') this.room.damageCore(e.dmg);
  }

  tickProjectiles(dt, alive) {
    for (const pr of this.projectiles.values()) {
      pr.life -= dt;
      let hit = false, end = pr.life <= 0;
      if (pr.kind === 'arrow') {
        const tgt = this.enemies.get(pr.target);
        if (!tgt) end = true;
        else {
          const dx = tgt.x - pr.x, dz = tgt.z - pr.z, d = Math.hypot(dx, dz);
          if (d < 0.8) { hit = true; this.damageEnemy(tgt, pr.dmg, null, false); }
          else { pr.x += (dx / d) * 30 * dt; pr.z += (dz / d) * 30 * dt; }
        }
      } else {
        pr.x += pr.vx * dt; pr.z += pr.vz * dt;
        for (const p of alive) if (Math.hypot(p.x - pr.x, p.z - pr.z) < 0.9) { send(p.ws, { t: 'hurt', dmg: pr.dmg, from: -1 }); hit = true; break; }
        if (!hit && this.type === 'town') {
          for (const s of this.room.structures.values()) if (dist(s, pr) < 1.2) { this.room.damageStruct(s, pr.dmg); hit = true; break; }
          if (!hit && Math.hypot(pr.x, pr.z) < TOWN.core.r) { this.room.damageCore(pr.dmg); hit = true; }
        }
        if (this.dungeon && !hit) { const pos = { x: pr.x, z: pr.z }; dungeonCollide(this.dungeon, pos, 0.2); if (pos.x !== pr.x || pos.z !== pr.z) end = true; }
      }
      if (hit || end) { this.projectiles.delete(pr.id); this.broadcast({ t: 'projEnd', id: pr.id, hit, x: r2(pr.x), z: r2(pr.z) }); }
    }
  }

  damageEnemy(e, dmg, by, crit) {
    if (!this.enemies.has(e.id)) return;
    e.hp -= dmg; e.aggro = true;
    this.broadcast({ t: 'ehit', id: e.id, dmg: Math.round(dmg), crit: !!crit, by });
    if (e.hp <= 0) this.kill(e, by);
  }

  kill(e, by) {
    this.enemies.delete(e.id);
    this.broadcast({ t: 'edie', id: e.id, x: r2(e.x), z: r2(e.z), type: e.type });
    const def = e.def;
    const players = this.players();
    for (const p of players) {
      const gold = Math.max(1, Math.round(e.gold * rng.range(0.8, 1.25) * (1 + (p.goldFind || 0))));
      send(p.ws, { t: 'reward', gold, xp: Math.round(def.xp * (1 + 0.15 * (e.level - 1))), x: r2(e.x), z: r2(e.z) });
      const dropChance = def.boss ? 1 : this.type === 'town' ? 0.05 : e.type === 'brute' ? 0.4 : e.type === 'wraith' ? 0.22 : 0.13;
      if (rng.chance(dropChance)) {
        const n = def.boss ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const item = generateItem(null, e.level, def.boss ? { minRarity: k === 0 ? 3 : 2, luck: 2 } : {});
          send(p.ws, { t: 'loot', item, x: r2(e.x + rng.range(-1.2, 1.2)), z: r2(e.z + rng.range(-1.2, 1.2)) });
        }
      }
    }
    if (def.boss && this.type === 'dungeon' && !this.cleared) {
      this.cleared = true;
      for (const o of [...this.enemies.values()]) { this.enemies.delete(o.id); this.broadcast({ t: 'edie', id: o.id, x: r2(o.x), z: r2(o.z), type: o.type }); }
      this.room.level = Math.max(this.room.level, this.level + 1);
      this.room.currentDungeon = null;
      this.broadcast({ t: 'cleared', level: this.room.level, x: r2(e.x), z: r2(e.z) });
      this.room.broadcast({ t: 'roomLevel', level: this.room.level });
    }
  }

  snapshot() {
    const list = [];
    for (const e of this.enemies.values()) list.push([e.id, e.type, r2(e.x), r2(e.z), r2(e.ry), Math.max(0, Math.round(e.hp)), e.maxHp, e.level, e.state | (e.slow > 0 ? 2 : 0)]);
    return { t: 'ents', zone: this.key, list };
  }
}

class Room {
  constructor(code) {
    this.code = code; this.players = new Map(); this.level = 1; this.nextId = 1; this.zones = new Map();
    this.currentDungeon = null; this.structures = new Map();
    this.defense = { phase: 'day', wave: 0, timer: 0, coreHp: 1, coreMax: 1, queue: [], spawnT: 0, result: null };
    this.zones.set('town', new Zone(this, 'town', 'town', 1));
    this.zones.set('dark', new Zone(this, 'dark', 'dark', 1));
    this.tickN = 0;
  }
  broadcast(msg) { const s = JSON.stringify(msg); for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(s); }
  get town() { return this.zones.get('town'); }

  enterZone(p, type) {
    let zone;
    if (type === 'dungeon') {
      if (!this.currentDungeon || !this.zones.has(this.currentDungeon)) {
        const key = 'dungeon:' + this.nextId++;
        this.zones.set(key, new Zone(this, key, 'dungeon', this.level));
        this.currentDungeon = key;
      }
      zone = this.zones.get(this.currentDungeon);
    } else zone = this.zones.get(type === 'dark' ? 'dark' : 'town');
    p.zone = zone.key;
    const msg = { t: 'enterZone', zone: zone.key, type: zone.type, level: zone.type === 'dungeon' ? zone.level : this.level };
    if (zone.dungeon) { msg.seed = zone.seed; msg.cleared = zone.cleared; }
    if (zone.type === 'town') { msg.structs = this.structList(); msg.defense = this.defenseState(); }
    send(p.ws, msg);
    send(p.ws, zone.snapshot());
  }

  structList() { return [...this.structures.values()].map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, hp: Math.round(s.hp), maxHp: s.maxHp })); }
  damageStruct(s, dmg) {
    s.hp -= dmg;
    if (s.hp <= 0) { this.structures.delete(s.id); this.town.broadcast({ t: 'structs', list: this.structList(), destroyed: s.id }); }
  }
  damageCore(dmg) {
    const d = this.defense;
    if (d.phase !== 'wave' && d.phase !== 'intermission') return;
    d.coreHp -= dmg;
    this.town.broadcast({ t: 'coreHit', hp: Math.max(0, Math.round(d.coreHp)) });
    if (d.coreHp <= 0) this.endNight(false);
  }
  defenseState() {
    const d = this.defense;
    return { t: 'defense', phase: d.phase, wave: d.wave, waves: 5, timer: Math.ceil(d.timer), coreHp: Math.max(0, Math.round(d.coreHp)), coreMax: d.coreMax, result: d.result, structHp: [...this.structures.values()].map((s) => [s.id, Math.round(s.hp)]) };
  }
  startNight() {
    const d = this.defense;
    if (d.phase !== 'day') return;
    const m = levelMul(this.level);
    Object.assign(d, { phase: 'build', wave: 0, timer: 30, coreMax: Math.round(1500 * m.hp), coreHp: Math.round(1500 * m.hp), result: null });
    this.broadcast({ t: 'chat', from: '★', text: 'The night bell tolls! Prepare the defenses of Emberhold!' });
    this.town.broadcast(this.defenseState());
  }
  endNight(victory) {
    const d = this.defense, town = this.town;
    d.phase = 'dawn'; d.timer = 9; d.result = victory ? 'victory' : 'defeat';
    for (const e of [...town.enemies.values()]) { town.enemies.delete(e.id); town.broadcast({ t: 'edie', id: e.id, x: r2(e.x), z: r2(e.z), type: e.type }); }
    town.projectiles.clear();
    const gold = victory ? Math.round((80 + 50 * d.wave) * levelMul(this.level).gold) : Math.round(15 * d.wave);
    for (const p of town.players()) send(p.ws, { t: 'reward', gold, xp: victory ? 150 * this.level : 20, x: 0, z: 0, big: true });
    town.broadcast(this.defenseState());
  }
  makeWave(n) {
    const q = [];
    const count = 6 + n * 4;
    for (let i = 0; i < count; i++) {
      const type = rng.weighted([['imp', 4], ['skeleton', 5], ['brute', n >= 2 ? 1 + n * 0.4 : 0], ['cultist', n >= 3 ? 1.5 : 0]]);
      q.push(type);
    }
    if (n === 5) q.push('brute', 'brute', 'wraith', 'wraith');
    return q;
  }
  tickDefense(dt) {
    const d = this.defense, town = this.town;
    if (d.phase === 'day') return;
    d.timer -= dt;
    if (d.phase === 'build' || d.phase === 'intermission') {
      if (d.timer <= 0) { d.wave++; d.phase = 'wave'; d.queue = this.makeWave(d.wave); d.spawnT = 0; town.broadcast({ t: 'wave', wave: d.wave }); }
    } else if (d.phase === 'wave') {
      d.spawnT -= dt;
      if (d.queue.length && d.spawnT <= 0) {
        d.spawnT = Math.max(0.35, 0.9 - d.wave * 0.1);
        const lane = rng.pick(TOWN.lanes);
        const c = Math.cos(lane), s = Math.sin(lane), j = rng.range(-4, 4);
        const at = (r, jit) => ({ x: c * r - s * jit, z: s * r + c * jit });
        const sp = at(rng.range(80, 88), j);
        town.spawn(d.queue.shift(), sp.x, sp.z, { path: [at(58, j * 0.5), at(42, j * 0.4), at(10, 0)], aggro: true });
      }
      if (!d.queue.length && town.enemies.size === 0) {
        if (d.wave >= 5) this.endNight(true);
        else {
          d.phase = 'intermission'; d.timer = 15;
          const gold = Math.round(20 * d.wave * levelMul(this.level).gold);
          for (const p of town.players()) send(p.ws, { t: 'reward', gold, xp: 30 * d.wave, x: 0, z: 0, big: true });
        }
      }
    } else if (d.phase === 'dawn' && d.timer <= 0) { d.phase = 'day'; d.result = null; }
    // structures
    const lvlDmg = levelMul(this.level).dmg;
    for (const st of this.structures.values()) {
      const S = STRUCTURES[st.kind];
      if (st.kind === 'tower') {
        st.cd -= dt;
        if (st.cd <= 0) {
          let best = null, bd = S.range;
          for (const e of town.enemies.values()) { const dd = dist(e, st); if (dd < bd) { bd = dd; best = e; } }
          if (best) {
            st.cd = S.rate;
            const id = this.nextId++;
            town.projectiles.set(id, { id, kind: 'arrow', x: st.x, z: st.z, target: best.id, dmg: S.dmg * lvlDmg, life: 3 });
            town.broadcast({ t: 'proj', id, kind: 'arrow', x: st.x, z: st.z, target: best.id });
          }
        }
      } else if (st.kind === 'brazier') {
        for (const e of [...town.enemies.values()]) if (dist(e, st) < S.radius) {
          e.burn = (e.burn || 0) + S.dps * lvlDmg * dt;
          if (e.burn >= 8) { const b = e.burn; e.burn = 0; town.damageEnemy(e, b, null, false); }
        }
      } else if (st.kind === 'frost') {
        for (const e of town.enemies.values()) if (dist(e, st) < S.radius) e.slow = 0.3;
      }
    }
  }
  tick() {
    this.tickN++;
    this.tickDefense(DT);
    for (const [key, z] of this.zones) {
      const n = z.players().length;
      if (n || z.type === 'town') z.tick(DT);
      if (z.type === 'dungeon') {
        z.emptyT = n ? 0 : z.emptyT + DT;
        if (z.emptyT > 120 || (z.emptyT > 3 && key !== this.currentDungeon)) this.zones.delete(key);
      }
    }
    if (this.tickN % 3 === 0) {
      const plist = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, zone: p.zone, x: r2(p.x), y: r2(p.y), z: r2(p.z), ry: r2(p.ry), anim: p.anim, hp: p.hp, maxHp: p.maxHp, gear: p.gear, level: p.lvl, dead: p.dead }));
      this.broadcast({ t: 'players', list: plist });
      for (const z of this.zones.values()) if (z.players().length) z.broadcast(z.snapshot());
    }
    if (this.tickN % 10 === 0 && this.defense.phase !== 'day') this.town.broadcast(this.defenseState());
  }
}

let nextPlayer = 1;
wss.on('connection', (ws) => {
  let room = null, p = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello' && !p) {
      let code = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (!code) code = makeCode();
      room = rooms.get(code);
      if (!room) { room = new Room(code); rooms.set(code, room); }
      if (room.players.size >= 4) { send(ws, { t: 'error', text: 'Room is full (4 players max).' }); room = null; return; }
      p = { id: nextPlayer++, ws, name: String(m.name || 'Hero').slice(0, 16), color: m.color || '#e8a33d', zone: 'town', x: TOWN.spawn.x, y: 0, z: TOWN.spawn.z, ry: 0, anim: 0, hp: 100, maxHp: 100, gear: m.gear || {}, lvl: m.level || 1, dead: false, goldFind: 0 };
      room.players.set(p.id, p);
      send(ws, { t: 'welcome', id: p.id, room: code, level: room.level });
      room.broadcast({ t: 'chat', from: '★', text: `${p.name} has joined the party.` });
      room.enterZone(p, 'town');
      return;
    }
    if (!p) return;
    const zone = room.zones.get(p.zone);
    switch (m.t) {
      case 'state':
        p.x = +m.x || 0; p.y = +m.y || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.anim = m.anim | 0;
        p.hp = m.hp | 0; p.maxHp = m.maxHp | 0; p.dead = !!m.dead; p.gear = m.gear || p.gear; p.lvl = m.level | 0 || 1; p.goldFind = Math.min(2, +m.goldFind || 0);
        break;
      case 'zone': room.enterZone(p, m.to); break;
      case 'hit': {
        if (!zone) break;
        const e = zone.enemies.get(m.id);
        if (e && dist(e, p) < 9) zone.damageEnemy(e, Math.min(100000, Math.max(0, +m.dmg || 0)), p.id, m.crit);
        break;
      }
      case 'build': {
        const S = STRUCTURES[m.kind];
        if (!S || p.zone !== 'town' || room.structures.size >= 48) break;
        const x = +m.x, z = +m.z;
        if (!(Math.hypot(x, z) < TOWN.wallR + 30) || Math.hypot(x, z) < TOWN.core.r + 2) break;
        if ([...room.structures.values()].some((s) => Math.hypot(s.x - x, s.z - z) < 1.8)) break;
        const id = room.nextId++;
        room.structures.set(id, { id, kind: m.kind, x, z, hp: S.hp * levelMul(room.level).hp, maxHp: Math.round(S.hp * levelMul(room.level).hp), cd: 0 });
        room.town.broadcast({ t: 'structs', list: room.structList(), built: id, by: p.id });
        break;
      }
      case 'startNight': if (p.zone === 'town') room.startNight(); break;
      case 'chat': room.broadcast({ t: 'chat', from: p.name, color: p.color, text: String(m.text || '').slice(0, 160) }); break;
      case 'emote': if (zone) zone.broadcast({ t: 'emote', id: p.id, kind: m.kind }); break;
    }
  });
  ws.on('close', () => {
    if (!room || !p) return;
    room.players.delete(p.id);
    room.broadcast({ t: 'left', id: p.id });
    room.broadcast({ t: 'chat', from: '★', text: `${p.name} left the party.` });
    if (room.players.size === 0) rooms.delete(room.code);
  });
});

setInterval(() => { for (const r of rooms.values()) r.tick(); }, DT * 1000);
server.listen(PORT, () => console.log(`Emberfall running at http://localhost:${PORT}`));
