// A simulated zone (town / dark world / a dungeon instance): enemy AI, bosses, hazards, events.
import { generateDungeon, dungeonCollide, dungeonLOS } from '../public/shared/dungeon.js';
import { ENEMIES, AFFIX_KEYS, levelMul } from '../public/shared/enemies.js';
import { DARK } from '../public/shared/world.js';
import { SHRINES } from '../public/shared/dungeon.js';
import { RNG } from '../public/shared/rng.js';
import { RIFT_MOD_KEYS, riftEnemyLevel, riftHpMul, RIFT_TIME } from '../public/shared/rifts.js';
import { REGIONS, EVENTS } from '../public/shared/regions.js';

const rng = new RNG(Date.now() & 0xffffffff);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
export const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

export class Zone {
  constructor(room, key, type, level) {
    this.room = room; this.key = key; this.type = type; this.level = level;
    this.enemies = new Map(); this.projectiles = new Map(); this.hazards = new Map();
    this.cleared = false; this.emptyT = 0; this.respawnT = 0;
    if (type === 'region') { this.region = REGIONS[key]; this.eventT = 25; this.event = null; }
    if (type === 'dungeon' || type === 'rift') {
      this.seed = (Math.random() * 1e9) | 0;
      if (type === 'rift') {
        this.k = level; this.level = riftEnemyLevel(level, room.level);
        const mods = RIFT_MOD_KEYS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
        this.rift = { mods, progress: 0, need: 0, start: Date.now(), guardian: false, done: false };
      }
      this.dungeon = generateDungeon(this.seed, this.level);
      this.pulled = []; this.shrinesUsed = [];
      if (this.rift) {
        this.dungeon.gateOpen = true;
        const emp = this.rift.mods.includes('empowered');
        for (const s of this.dungeon.spawns) {
          if (s.type === 'boss' || s.type === 'matriarch') continue;
          const n = s.type === 'goblin' ? 1 : rng.chance(0.45) ? 2 : 1;
          for (let k = 0; k < n; k++) this.spawn(s.type, s.x + k * 1.2, s.z + k * 0.8, { elite: s.elite || (emp && s.type !== 'goblin' && rng.chance(0.28) ? rng.pick(AFFIX_KEYS) : undefined) });
        }
        for (const e of this.enemies.values()) this.rift.need += this.riftValue(e);
        this.rift.need = Math.round(this.rift.need * 0.7);
      } else for (const s of this.dungeon.spawns) this.spawn(s.type, s.x, s.z, s.elite ? { elite: s.elite } : {});
    }
  }
  players() { return [...this.room.players.values()].filter((p) => p.zone === this.key); }
  alive() { return this.players().filter((p) => !p.dead); }
  broadcast(msg) { const s = JSON.stringify(msg); for (const p of this.players()) if (p.ws.readyState === 1) p.ws.send(s); }
  get lvl() { return this.dungeon ? this.level : this.room.level; }
  riftValue(e) { return e.def.flee ? 0 : (e.type === 'brute' ? 3 : 1) * (e.affix ? 4 : 1); }

  spawn(type, x, z, extra = {}) {
    const def = ENEMIES[type];
    const lvl = this.lvl, m = levelMul(lvl);
    const elite = extra.elite || (this.type === 'dark' && rng.chance(0.1) ? rng.pick(AFFIX_KEYS) : null);
    const k = (elite ? 2.6 : 1) * (this.rift ? riftHpMul(this.k) : 1);
    const e = {
      id: this.room.nextId++, type, def, x, z, ry: rng.range(0, 6.28), level: lvl,
      hp: Math.round(def.hp * m.hp * k), maxHp: Math.round(def.hp * m.hp * k), dmg: Math.round(def.dmg * m.dmg * (elite ? 1.35 : 1)), gold: def.gold * m.gold * (elite ? 3 : 1),
      xpMul: elite ? 3 : 1, radius: def.radius * (elite ? 1.15 : 1),
      cd: rng.range(0.3, 1.2), windT: 0, slamT: 0, slamCd: 6, geyserCd: 4, abilityCd: 3, abi: 0, phase: 1, stunT: 0, staggerImm: 0, introT: 0,
      aggro: false, home: { x, z }, slow: 0, wp: 0, summoned: 0, state: 0, wanderT: 0, wx: x, wz: z, tauntT: 0, tauntBy: 0, shieldCd: 4, shieldUp: false, leapT: 0,
      ...extra, affix: elite,
      speedMul: this.rift?.mods.includes('swift') ? 1.3 : 1, cdMul: this.rift?.mods.includes('frenzy') ? 0.7 : 1,
    };
    this.enemies.set(e.id, e);
    return e;
  }
  remove(e) {
    this.enemies.delete(e.id);
    this.broadcast({ t: 'edie', id: e.id, x: r2(e.x), z: r2(e.z), type: e.type, quiet: true });
  }

  collide(pos, r) {
    if (this.dungeon) dungeonCollide(this.dungeon, pos, r);
    else if (this.type === 'dark' || this.region) { const B = (this.region?.bound || DARK.bound) - 4, d = Math.hypot(pos.x, pos.z); if (d > B) { pos.x *= B / d; pos.z *= B / d; } }
  }

  addHazard(kind, x, z, r, dps, life, delay = 0) {
    const id = this.room.nextId++;
    const h = { id, kind, x: r2(x), z: r2(z), r, dps: Math.round(dps), life, delay };
    this.hazards.set(id, h);
    this.broadcast({ t: 'hazard', h });
    return h;
  }

  tick(dt) {
    const alive = this.alive();
    for (const e of [...this.enemies.values()]) if (this.enemies.has(e.id)) this.tickEnemy(e, dt, alive);
    this.tickProjectiles(dt, alive);
    for (const h of [...this.hazards.values()]) {
      if (h.delay > 0) { h.delay -= dt; continue; }
      h.life -= dt;
      if (h.life <= 0) { this.hazards.delete(h.id); this.broadcast({ t: 'hazardEnd', id: h.id }); }
    }
    if (this.region && this.players().length) this.tickRegion(dt);
    if (this.type === 'dark') {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.enemies.size < 9 && this.players().length) {
        this.respawnT = 7;
        const a = rng.range(0, Math.PI * 2), r = rng.range(26, 62);
        this.spawn(rng.weighted([['wraith', 6], ['imp', 2], ['healer', 1], ['bomber', 1]]), Math.cos(a) * r, Math.sin(a) * r);
      }
    }
  }

  findTarget(e, alive) {
    if (e.tauntT > 0) { const t = alive.find((p) => p.id === e.tauntBy); if (t) return t; }
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
    e.cd -= dt; e.slow = Math.max(0, e.slow - dt); e.tauntT -= dt; e.stunT -= dt; e.staggerImm -= dt;
    if (e.affix === 'shielded') { e.shieldCd -= dt; if (e.shieldCd <= 0) { e.shieldUp = !e.shieldUp; e.shieldCd = e.shieldUp ? 3 : 6; } }
    if (e.introT > 0) { e.introT -= dt; e.state = 0; return; }
    if (e.stunT > 0) { e.state = 0; return; }
    if (e.leapT > 0) {
      e.leapT -= dt;
      if (e.leapT <= 0) {
        e.x = e.leapX; e.z = e.leapZ; this.collide(e, e.radius);
        for (const p of alive) if (dist(p, e) < 4) send(p.ws, { t: 'hurt', dmg: Math.round(e.dmg * 1.5), from: e.id, kb: 1 });
      }
      return;
    }
    if (e.eruptT > 0) {
      e.eruptT -= dt;
      if (e.eruptT <= 0) { e.burrowed = false; e.surfaceT = 3.5; for (const p of alive) if (dist(p, e) < 2.8) send(p.ws, { t: 'hurt', dmg: Math.round(e.dmg * 1.3), from: e.id, kb: 1 }); }
      return;
    }
    if (e.strafe) { if (this.drakeStrafe(e, dt, alive)) return; }
    if (e.windT > 0) { e.windT -= dt; if (e.windT <= 0) this.resolveAttack(e); return; }
    if (e.slamT > 0) {
      e.slamT -= dt;
      if (e.slamT <= 0) for (const p of alive) if (dist(p, e) < 6.5) send(p.ws, { t: 'hurt', dmg: Math.round(e.dmg * 1.7), from: e.id, kb: 1 });
      return;
    }
    if (def.flee) return this.goblin(e, dt, alive);
    let tx, tz, reach, target = null, pathing = false;
    const defense = this.type === 'town';
    if (defense) {
      const s = this.room.defense.steer(e, alive);
      tx = s.tx; tz = s.tz; reach = s.reach; target = s.target; pathing = !!s.path;
    } else {
      const p = this.findTarget(e, alive);
      if (p) {
        if (def.boss && !e.introDone) {
          e.introDone = true; e.introT = 2.8; e.aggro = true;
          this.broadcast({ t: 'bossIntro', id: e.id, type: e.type });
          return;
        }
        e.aggro = true; target = { kind: 'player', p }; tx = p.x; tz = p.z; reach = def.ranged ? def.range : def.range + 0.4;
      } else {
        e.aggro = false;
        if (this.type === 'dark' || this.region) {
          e.wanderT -= dt;
          if (e.wanderT <= 0) { e.wanderT = rng.range(2, 5); e.wx = e.home.x + rng.range(-8, 8); e.wz = e.home.z + rng.range(-8, 8); }
          tx = e.wx; tz = e.wz; reach = 1;
        } else { tx = e.home.x; tz = e.home.z; reach = 1; }
      }
    }
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d > 0.01) e.ry = Math.atan2(dx, dz);
    if (target && target.kind === 'player') {
      if ((e.type === 'boss' || def.ai === 'tyrant') && this.tyrant(e, dt, alive, d)) return;
      if (e.type === 'matriarch' && this.matriarch(e, dt, alive, target.p, d)) return;
      if (e.type === 'drake' && this.drake(e, dt, alive, target.p, d)) return;
      if (e.type === 'hollowking' && this.hollowKing(e, dt, alive, target.p, d)) return;
      if (def.healer) { e.healCd = (e.healCd ?? 2) - dt; if (e.healCd <= 0) this.healPulse(e); if (d < 6.5) { tx = e.x - dx; tz = e.z - dz; reach = 0.1; } else reach = 9; }
      if (def.burrow) {
        e.surfaceT = (e.surfaceT || 0) - dt;
        if (e.surfaceT <= 0 && d > 3.4) e.burrowed = true;
        if (e.burrowed && d <= 3.2) { e.eruptT = 0.8; this.broadcast({ t: 'erupt', id: e.id, x: r2(e.x), z: r2(e.z), r: 2.8, delay: 0.8 }); return; }
      }
    }
    const enr = e.enraged ? 1.35 : 1;
    let moving = false;
    if (d > reach) {
      const sp = def.speed * enr * (e.speedMul || 1) * (e.burrowed ? 1.5 : 1) * (e.slow > 0 ? 0.5 : 1) * (target || defense ? 1 : 0.45);
      const step = Math.min(pathing ? d : d - reach * 0.8, sp * dt);
      e.x += (dx / d) * step; e.z += (dz / d) * step;
      moving = true;
    } else if (target && e.cd <= 0) {
      e.windT = def.windup / (e.enraged ? 1.2 : 1); e.cd = (def.cd / enr) * (e.cdMul || 1); e.atk = target;
      this.broadcast({ t: 'eatk', id: e.id });
    }
    for (const o of this.enemies.values()) {
      if (o === e) continue;
      const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), min = e.radius + o.radius;
      if (od < min && od > 0.001) { const push = (min - od) * 0.5; e.x += (ox / od) * push; e.z += (oz / od) * push; }
    }
    this.collide(e, e.radius);
    if (defense) this.room.defense.collideStructs(e);
    e.state = moving ? 1 : 0;
  }

  phaseCheck(e, thresholds) {
    const f = e.hp / e.maxHp;
    let ph = 1;
    thresholds.forEach((t, i) => { if (f < t) ph = i + 2; });
    if (ph > e.phase) {
      e.phase = ph;
      if (ph === thresholds.length + 1) e.enraged = true;
      this.broadcast({ t: 'phase', id: e.id, n: ph, enraged: !!e.enraged });
      return true;
    }
    return false;
  }

  summon(e, type, n) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const s = this.spawn(type, e.x + Math.cos(a) * 3, e.z + Math.sin(a) * 3, { aggro: true });
      this.collide(s, s.radius);
    }
    this.broadcast({ t: 'summon', id: e.id, x: r2(e.x), z: r2(e.z) });
  }

  // Bone Tyrant: phase 1 slams; phase 2 fire geysers; phase 3 enrage. Returns true if busy this tick.
  tyrant(e, dt, alive, d) {
    if (this.phaseCheck(e, [0.66, 0.33])) this.summon(e, e.phase === 3 ? 'imp' : 'skeleton', 4);
    e.slamCd -= dt;
    if (e.slamCd <= 0 && d < 9) {
      e.slamCd = e.phase === 3 ? rng.range(3.5, 5) : rng.range(6, 9); e.slamT = 1.3 / (e.enraged ? 1.2 : 1);
      this.broadcast({ t: 'slam', id: e.id, x: r2(e.x), z: r2(e.z), r: 6.5, delay: e.slamT });
      return true;
    }
    if (e.phase >= 2) {
      e.geyserCd -= dt;
      if (e.geyserCd <= 0) {
        e.geyserCd = e.phase === 3 ? 3 : 4.5;
        for (const p of alive.slice(0, 4)) this.addHazard('geyser', p.x + rng.range(-1, 1), p.z + rng.range(-1, 1), 2.4, 16 * levelMul(this.lvl).dmg, 3.5, 1.2);
      }
    }
    return false;
  }

  // Ash Matriarch: webs, venom spit, leaps, spiderling broods.
  matriarch(e, dt, alive, target, d) {
    this.phaseCheck(e, [0.5, 0.25]);
    const f = e.hp / e.maxHp;
    if ((f < 0.7 && e.summoned === 0) || (f < 0.4 && e.summoned === 1)) { e.summoned++; this.summon(e, 'spiderling', 5); }
    e.abilityCd -= dt;
    if (e.abilityCd > 0) return false;
    e.abilityCd = e.enraged ? 2.2 : 3.4;
    e.abi = (e.abi + 1) % 3;
    if (e.abi === 0) {
      for (const p of alive) if (dist(p, e) < 24) this.addHazard('web', p.x, p.z, 2.4, 0, 7, 0.7);
      this.broadcast({ t: 'eatk', id: e.id });
    } else if (e.abi === 1) {
      const base = Math.atan2(target.x - e.x, target.z - e.z);
      for (const off of [-0.28, 0, 0.28]) {
        const a = base + off, id = this.room.nextId++;
        const pr = { id, kind: 'venom', x: e.x + Math.sin(a) * 1.6, z: e.z + Math.cos(a) * 1.6, vx: Math.sin(a) * 12, vz: Math.cos(a) * 12, dmg: Math.round(e.dmg * 0.8), life: 2.2, affix: 'venom' };
        this.projectiles.set(id, pr);
        this.broadcast({ t: 'proj', id, kind: 'venom', x: r2(pr.x), z: r2(pr.z), vx: r2(pr.vx), vz: r2(pr.vz) });
      }
      this.broadcast({ t: 'eatk', id: e.id });
    } else if (d > 4 && d < 20) {
      e.leapT = 1.0; e.leapX = target.x; e.leapZ = target.z;
      this.broadcast({ t: 'leap', id: e.id, x: r2(target.x), z: r2(target.z), delay: 1.0 });
      return true;
    }
    return false;
  }

  healPulse(e) {
    let best = null, bf = 0.95;
    for (const o of this.enemies.values()) { if (o === e || dist(o, e) > 12) continue; const f = o.hp / o.maxHp; if (f < bf) { bf = f; best = o; } }
    e.healCd = best ? 4 : 1.2;
    if (!best) return;
    const amt = Math.round(best.maxHp * 0.22);
    best.hp = Math.min(best.maxHp, best.hp + amt);
    this.broadcast({ t: 'heal', from: e.id, to: best.id, amt });
  }

  // Storm Drake: ground bites; takes to the air for breath strafes; storm strikes in phase 2+.
  drake(e, dt, alive, target, d) {
    if (this.phaseCheck(e, [0.66, 0.33])) this.summon(e, 'imp', 4);
    e.strafeCd = (e.strafeCd ?? 7) - dt;
    if (e.strafeCd <= 0) {
      e.strafeCd = e.phase >= 3 ? 5 : e.phase === 2 ? 6.5 : 9;
      const a = Math.atan2(target.x - e.x, target.z - e.z) + rng.range(-0.3, 0.3);
      const ax = target.x - Math.sin(a) * 13, az = target.z - Math.cos(a) * 13, bx = target.x + Math.sin(a) * 13, bz = target.z + Math.cos(a) * 13;
      const A = { x: ax, z: az }, B = { x: bx, z: bz }; this.collide(A, 1); this.collide(B, 1);
      e.strafe = { ax: A.x, az: A.z, bx: B.x, bz: B.z, t: -1.2, dur: 1.4, w: 3.4, hit: new Set() };
      e.flying = true;
      this.broadcast({ t: 'strafe', id: e.id, ax: r2(A.x), az: r2(A.z), bx: r2(B.x), bz: r2(B.z), delay: 1.2, dur: 1.4, w: 3.4 });
      return true;
    }
    if (e.phase >= 2) {
      e.geyserCd -= dt;
      if (e.geyserCd <= 0) { e.geyserCd = e.phase === 3 ? 2.6 : 3.8; for (const p of alive.slice(0, 4)) this.addHazard('storm', p.x + rng.range(-1.5, 1.5), p.z + rng.range(-1.5, 1.5), 2.2, 40 * levelMul(this.lvl).dmg, 0.5, 1.0); }
    }
    return false;
  }
  drakeStrafe(e, dt, alive) {
    const s = e.strafe; s.t += dt;
    if (s.t < 0) { e.x += (s.ax - e.x) * Math.min(1, dt * 4); e.z += (s.az - e.z) * Math.min(1, dt * 4); e.ry = Math.atan2(s.bx - s.ax, s.bz - s.az); return true; }
    const k = Math.min(1, s.t / s.dur);
    e.x = s.ax + (s.bx - s.ax) * k; e.z = s.az + (s.bz - s.az) * k;
    for (const p of alive) {
      if (s.hit.has(p.id)) continue;
      const vx = s.bx - s.ax, vz = s.bz - s.az, L2 = vx * vx + vz * vz || 1;
      const u = Math.max(0, Math.min(k, ((p.x - s.ax) * vx + (p.z - s.az) * vz) / L2));
      if (Math.hypot(p.x - (s.ax + vx * u), p.z - (s.az + vz * u)) < s.w / 2 && u <= k && u >= k - 0.15) { s.hit.add(p.id); send(p.ws, { t: 'hurt', dmg: Math.round(e.dmg * 1.6), from: e.id, affix: 'frozen' }); }
    }
    if (k >= 1) { e.strafe = null; e.flying = false; e.cd = 1; this.collide(e, e.radius); }
    return true;
  }

  // Hollow King: void slams, shadow bolts, wraith summons; shifts the fight to a new arena each phase.
  hollowKing(e, dt, alive, target, d) {
    if (this.phaseCheck(e, [0.66, 0.33])) {
      const A = DARK.arenas[(e.phase - 1) % DARK.arenas.length];
      e.x = A.x; e.z = A.z - 4;
      for (const p of this.players()) send(p.ws, { t: 'teleport', x: A.x + rng.range(-2, 2), z: A.z + 5 + rng.range(-1, 1) });
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this.addHazard('fire', A.x + Math.cos(a) * 15, A.z + Math.sin(a) * 15, 2.6, 18 * levelMul(this.lvl).dmg, 60, 1.5); }
      this.broadcast({ t: 'arenaShift', x: A.x, z: A.z, phase: e.phase });
      this.summon(e, 'wraith', e.phase === 3 ? 4 : 3);
      e.introT = 1.6;
      return true;
    }
    e.slamCd -= dt; e.abilityCd -= dt;
    if (e.slamCd <= 0 && d < 8) { e.slamCd = e.enraged ? 4 : 6.5; e.slamT = 1.2; this.broadcast({ t: 'slam', id: e.id, x: r2(e.x), z: r2(e.z), r: 6.5, delay: 1.2, kind: 'void' }); return true; }
    if (e.abilityCd <= 0) {
      e.abilityCd = e.enraged ? 2.2 : 3.4;
      const base = Math.atan2(target.x - e.x, target.z - e.z);
      for (const off of [-0.35, -0.12, 0.12, 0.35]) {
        const a = base + off, id = this.room.nextId++;
        const pr = { id, kind: 'bolt', x: e.x + Math.sin(a) * 1.6, z: e.z + Math.cos(a) * 1.6, vx: Math.sin(a) * 14, vz: Math.cos(a) * 14, dmg: Math.round(e.dmg * 0.7), life: 2.2, affix: 'frozen' };
        this.projectiles.set(id, pr);
        this.broadcast({ t: 'proj', id, kind: 'bolt', x: r2(pr.x), z: r2(pr.z), vx: r2(pr.vx), vz: r2(pr.vz) });
      }
      this.broadcast({ t: 'eatk', id: e.id });
    }
    return false;
  }

  goblin(e, dt, alive) {
    let near = null, nd = 14;
    for (const p of alive) { const dd = dist(p, e); if (dd < nd) { nd = dd; near = p; } }
    if (near && !e.aggro) { e.aggro = true; e.escapeT = 25; this.broadcast({ t: 'goblin', id: e.id }); }
    if (e.aggro) {
      e.escapeT -= dt;
      if (e.escapeT <= 0) { this.broadcast({ t: 'goblinEscape', id: e.id, x: r2(e.x), z: r2(e.z) }); this.remove(e); return; }
    }
    const ox = e.x, oz = e.z;
    if (near) {
      e.fleeOff = e.fleeOff || 0;
      const a = Math.atan2(e.x - near.x, e.z - near.z) + e.fleeOff + Math.sin(Date.now() / 600 + e.id) * 0.4;
      e.x += Math.sin(a) * e.def.speed * (e.slow > 0 ? 0.5 : 1) * dt; e.z += Math.cos(a) * e.def.speed * (e.slow > 0 ? 0.5 : 1) * dt;
      e.ry = a;
      this.collide(e, e.radius);
      if (Math.hypot(e.x - ox, e.z - oz) < e.def.speed * dt * 0.3) e.fleeOff += 1.4; else e.fleeOff *= 0.98;
      e.state = 1;
    } else e.state = 0;
  }

  resolveAttack(e) {
    const t = e.atk; if (!t) return;
    const def = e.def;
    if (def.bomber) {
      for (const p of this.alive()) if (dist(p, e) < 3.4) send(p.ws, { t: 'hurt', dmg: e.dmg, from: -1, kb: 1 });
      if (this.type === 'town') for (const s of [...this.room.defense.structures.values()]) if (dist(s, e) < 3.6) this.room.defense.damageStruct(s, e.dmg * 4);
      if (t.kind === 'core') this.room.defense.damageCore(e.dmg * 2);
      this.broadcast({ t: 'boom', x: r2(e.x), z: r2(e.z), r: 3.4 });
      e.noLoot = true; this.kill(e, null);
      return;
    }
    if (def.ranged) {
      let tx = 0, tz = 0;
      if (t.kind === 'player') { tx = t.p.x; tz = t.p.z; } else if (t.kind === 'struct') { tx = t.s.x; tz = t.s.z; }
      const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
      const id = this.room.nextId++;
      const pr = { id, x: e.x + (dx / d) * 0.8, z: e.z + (dz / d) * 0.8, vx: (dx / d) * 13, vz: (dz / d) * 13, dmg: e.dmg, life: 2, kind: 'bolt', affix: e.affix };
      this.projectiles.set(id, pr);
      this.broadcast({ t: 'proj', id, kind: 'bolt', x: r2(pr.x), z: r2(pr.z), vx: r2(pr.vx), vz: r2(pr.vz) });
      return;
    }
    const reach = def.range * 1.5 + 0.6;
    if (t.kind === 'player') {
      if (!t.p.dead && t.p.zone === this.key && dist(t.p, e) < reach) {
        send(t.p.ws, { t: 'hurt', dmg: e.dmg, from: e.id, affix: e.affix, kb: def.siege ? 1 : 0 });
        if (e.affix === 'vampiric') e.hp = Math.min(e.maxHp, e.hp + e.dmg * 0.6);
      }
    } else if (t.kind === 'struct') this.room.defense.damageStruct(t.s, e.dmg * (def.siege ? 4 : 1.5));
    else if (t.kind === 'core') this.room.defense.damageCore(e.dmg);
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
          if (d < 0.8) { hit = true; this.damageEnemy(tgt, pr.dmg, null, false, 0.4, 0, pr.x, pr.z); }
          else { pr.x += (dx / d) * 30 * dt; pr.z += (dz / d) * 30 * dt; }
        }
      } else {
        pr.x += pr.vx * dt; pr.z += pr.vz * dt;
        for (const p of alive) if (Math.hypot(p.x - pr.x, p.z - pr.z) < 0.9) { send(p.ws, { t: 'hurt', dmg: pr.dmg, from: -1, affix: pr.affix }); hit = true; break; }
        if (!hit && this.type === 'town') {
          for (const s of this.room.defense.structures.values()) if (dist(s, pr) < 1.2) { this.room.defense.damageStruct(s, pr.dmg); hit = true; break; }
          if (!hit && Math.hypot(pr.x, pr.z) < 2.6) { this.room.defense.damageCore(pr.dmg); hit = true; }
        }
        if (this.dungeon && !hit) { const pos = { x: pr.x, z: pr.z }; dungeonCollide(this.dungeon, pos, 0.2); if (pos.x !== pr.x || pos.z !== pr.z) end = true; }
      }
      if (hit || end) { this.projectiles.delete(pr.id); this.broadcast({ t: 'projEnd', id: pr.id, hit, x: r2(pr.x), z: r2(pr.z) }); }
    }
  }

  damageEnemy(e, dmg, by, crit, kb = 0, stun = 0, fx, fz) {
    if (!this.enemies.has(e.id) || e.introT > 0 || e.burrowed || e.flying) return;
    if (e.shieldUp) dmg *= 0.25;
    let blocked = false;
    if (e.def.frontal && fx !== undefined && e.stunT <= 0) {
      const ax = fx - e.x, az = fz - e.z, l = Math.hypot(ax, az) || 1;
      if ((ax / l) * Math.sin(e.ry) + (az / l) * Math.cos(e.ry) > 0.35) { dmg *= 0.2; blocked = true; stun = 0; kb = 0; }
    }
    e.hp -= dmg; e.aggro = true;
    const poise = e.def.poise * (e.affix ? 0.5 : 1);
    if (poise > 0) {
      if (kb !== 0 && fx !== undefined) {
        const dx = e.x - fx, dz = e.z - fz, l = Math.hypot(dx, dz) || 1;
        const k = kb < 0 ? Math.max(kb, -(l - 1.8)) : kb; // pulls stop short of the player
        if (k) { e.x += (dx / l) * k * poise; e.z += (dz / l) * k * poise; }
        this.collide(e, e.radius);
      }
      if (stun > 0) { e.stunT = Math.max(e.stunT, stun * Math.min(1, poise)); e.windT = 0; }
      else if (dmg > e.maxHp * 0.12 && e.staggerImm <= 0) { e.stunT = Math.max(e.stunT, 0.22 * Math.min(1, poise)); e.staggerImm = 1.2; if (e.windT > 0.15) e.windT = 0; }
    } else if (e.def.boss && stun >= 1.4 && e.staggerImm <= 0) { e.stunT = 0.6; e.staggerImm = 5; e.windT = 0; }
    this.broadcast({ t: 'ehit', id: e.id, dmg: Math.round(dmg), crit: !!crit, by, stun: e.stunT > 0.35, shield: !!e.shieldUp || blocked, blocked });
    if (e.hp <= 0) this.kill(e, by);
  }

  taunt(p, r, dur) {
    for (const e of this.enemies.values()) if (dist(e, p) < r && !e.def.flee) { e.tauntBy = p.id; e.tauntT = dur; e.aggro = true; }
  }

  kill(e, by) {
    this.enemies.delete(e.id);
    this.broadcast({ t: 'edie', id: e.id, x: r2(e.x), z: r2(e.z), type: e.type, affix: e.affix });
    const def = e.def;
    if (e.affix === 'molten' || (this.rift?.mods.includes('volatile') && !e.def.boss)) this.addHazard('fire', e.x, e.z, 2.4, 10 * levelMul(this.lvl).dmg, e.affix === 'molten' ? 5 : 3, 0.6);
    if (this.rift && !this.rift.done) {
      if (e.guardian) { this.rift.done = true; this.room.riftComplete(this, e); }
      else if (!this.rift.guardian) {
        this.rift.progress += this.riftValue(e);
        const f = Math.min(1, this.rift.progress / this.rift.need);
        this.broadcast({ t: 'riftProgress', p: f });
        if (f >= 1) {
          this.rift.guardian = true;
          for (const o of [...this.enemies.values()]) this.remove(o);
          const g = this.spawn(['boss', 'matriarch', 'drake'][(this.k - 1) % 3], e.x, e.z, { guardian: true, introDone: false });
          this.collide(g, g.radius);
          this.broadcast({ t: 'guardian', id: g.id });
        }
      }
    }
    for (const p of this.players()) {
      let gold = e.gold * rng.range(0.8, 1.25);
      if (def.flee) gold *= 2.5;
      this.room.reward(p, gold, def.xp * (1 + 0.15 * (e.level - 1)) * e.xpMul, e.x, e.z);
      const chance = e.noLoot ? 0 : def.boss || def.flee ? 1 : e.affix ? 0.6 : this.type === 'town' ? 0.05 : e.type === 'brute' ? 0.4 : e.type === 'wraith' ? 0.22 : 0.13;
      if (rng.chance(chance)) {
        const n = def.boss ? 3 : def.flee ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const opts = def.boss ? { minRarity: k === 0 ? 3 : 2, luck: 2 } : def.flee ? { minRarity: 2, luck: 2.5 } : e.affix ? { minRarity: 1, luck: 1.5 } : {};
          this.room.giveLoot(p, e.level, opts, e.x + rng.range(-1.4, 1.4), e.z + rng.range(-1.4, 1.4));
        }
      }
    }
    if (def.boss && this.type === 'dungeon') for (const p of this.players()) this.room.questEvent(p, 'dungeon');
    if (e.type === 'colossus') for (const p of this.players()) this.room.questEvent(p, 'actboss');
    if (def.boss && this.type === 'dungeon' && !this.cleared) {
      this.cleared = true;
      for (const o of [...this.enemies.values()]) this.remove(o);
      this.room.level = Math.max(this.room.level, this.level + 1);
      this.room.currentDungeon = null;
      this.broadcast({ t: 'cleared', level: this.room.level, x: r2(e.x), z: r2(e.z) });
      this.room.broadcast({ t: 'roomLevel', level: this.room.level });
    }
  }

  tickRegion(dt) {
    const R = this.region;
    this.respawnT -= dt;
    const ambient = [...this.enemies.values()].filter((e) => !e.event && !e.def.boss).length;
    if (this.respawnT <= 0 && ambient < 14) {
      this.respawnT = 4;
      const a = rng.range(0, Math.PI * 2), r = rng.range(18, R.bound - 12);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - R.spawn.x, z - R.spawn.z) > 16) this.spawn(rng.weighted(R.spawns), x, z);
    }
    if (this.event) {
      const ev = this.event; ev.t -= dt;
      if (ev.kind === 'breach' && ev.spawnLeft > 0) {
        ev.spawnT -= dt;
        if (ev.spawnT <= 0) { ev.spawnT = 3.5; ev.spawnLeft--; for (let k = 0; k < 2; k++) this.spawn(rng.weighted(R.spawns), ev.x + rng.range(-2, 2), ev.z + rng.range(-2, 2), { event: ev.id, aggro: true }); }
      }
      const left = [...this.enemies.values()].filter((e) => e.event === ev.id).length;
      if (ev.started && left === 0 && !(ev.kind === 'breach' && ev.spawnLeft > 0)) this.endEvent(true);
      else if (ev.t <= 0) this.endEvent(false);
      else if (Math.round(ev.t * 2) % 4 === 0 && ev.lastLeft !== left) { ev.lastLeft = left; this.broadcast({ t: 'eventLeft', left }); }
      return;
    }
    this.eventT -= dt;
    if (this.eventT <= 0) {
      const kind = rng.pick(Object.keys(EVENTS));
      const a = rng.range(0, Math.PI * 2), r = rng.range(20, R.bound - 25);
      const ev = { id: this.room.nextId++, kind, x: Math.cos(a) * r, z: Math.sin(a) * r, t: 120, started: false, spawnLeft: kind === 'breach' ? 9 : 0, spawnT: 3 };
      this.event = ev;
      this.broadcast({ t: 'event', kind, x: r2(ev.x), z: r2(ev.z), id: ev.id });
      setTimeout(() => {
        if (this.event !== ev) return;
        ev.started = true;
        if (kind === 'meteor') {
          this.addHazard('fire', ev.x, ev.z, 4, 14 * levelMul(this.lvl).dmg, 8, 0);
          for (let k = 0; k < 7; k++) { const aa = (k / 7) * Math.PI * 2; this.spawn(rng.weighted(R.spawns), ev.x + Math.cos(aa) * 5, ev.z + Math.sin(aa) * 5, { event: ev.id, elite: k < 3 ? rng.pick(AFFIX_KEYS) : undefined }); }
        }
      }, kind === 'meteor' ? 3000 : 1000);
    }
  }
  endEvent(ok) {
    const ev = this.event; this.event = null; this.eventT = rng.range(60, 90);
    for (const e of [...this.enemies.values()]) if (e.event === ev.id) this.remove(e);
    this.broadcast({ t: 'eventDone', ok, kind: ev.kind });
    if (!ok) return;
    for (const p of this.players()) if (dist(p, ev) < 60) {
      this.room.reward(p, 80 * this.lvl, 150 * this.lvl, ev.x, ev.z, true);
      this.room.giveLoot(p, this.lvl, { minRarity: 2, luck: 2 }, ev.x + rng.range(-2, 2), ev.z + rng.range(-2, 2));
      this.room.questEvent(p, 'event');
    }
  }
  summonColossus(p) {
    if ([...this.enemies.values()].some((e) => e.def.boss)) return;
    if (dist(p, this.region.altar) > 8) return;
    this.spawn(this.key === 'marsh' ? 'colossus' : 'drake', this.region.altar.x, this.region.altar.z - 4);
    this.broadcast({ t: 'chat', from: '★', text: this.key === 'marsh' ? 'The bog churns… the Colossus rises!' : 'Thunder splits the sky — the Storm Drake descends!' });
  }

  challengeKing(p) {
    if (this.type !== 'dark' || [...this.enemies.values()].some((e) => e.type === 'hollowking')) return;
    if (dist(p, DARK.throne) > 8) return;
    const A = DARK.arenas[0];
    const k = this.spawn('hollowking', A.x, A.z - 3, { aggro: false });
    this.broadcast({ t: 'chat', from: '★', text: `${p.prof.name} has challenged the Hollow King!` });
    return k;
  }

  // ---- dungeon events ----
  dstate() { return { t: 'dstate', pulled: this.pulled, gateOpen: this.dungeon.gateOpen, shrinesUsed: this.shrinesUsed }; }
  pullLever(p, i) {
    const d = this.dungeon, L = d.levers[i];
    if (!L || d.gateOpen || this.pulled.includes(i) || dist(p, L) > 4) return;
    if (d.leverOrder[this.pulled.length] === i) {
      this.pulled.push(i);
      this.broadcast({ t: 'lever', i, ok: true, by: p.name });
      if (this.pulled.length === d.levers.length) { d.gateOpen = true; this.broadcast({ t: 'gateOpen' }); }
    } else {
      this.pulled = [];
      this.broadcast({ t: 'lever', i, ok: false, by: p.name });
      for (let k = 0; k < 2 + Math.floor(this.level / 3); k++) { const s = this.spawn('skeleton', L.x + rng.range(-3, 3), L.z + rng.range(-3, 3), { aggro: true }); this.collide(s, s.radius); }
    }
    this.broadcast(this.dstate());
  }
  useShrine(p, i) {
    const s = this.dungeon.shrines[i];
    if (!s || this.shrinesUsed.includes(i) || dist(p, s) > 4) return;
    this.shrinesUsed.push(i);
    const S = SHRINES[s.kind];
    for (const q of this.players()) { q.buffs[s.kind] = Date.now() + S.dur * 1000; q.dirty = true; }
    this.broadcast({ t: 'shrine', i, kind: s.kind, by: p.name });
    this.broadcast(this.dstate());
  }

  riftState() { const r = this.rift; return r && { k: this.k, mods: r.mods, p: Math.min(1, r.progress / r.need), elapsed: (Date.now() - r.start) / 1000, limit: RIFT_TIME, guardian: r.guardian, done: r.done }; }

  snapshot() {
    const list = [];
    for (const e of this.enemies.values()) {
      const flags = e.state | (e.slow > 0 ? 2 : 0) | (e.shieldUp ? 4 : 0) | (e.stunT > 0 ? 8 : 0) | (e.enraged ? 16 : 0) | (e.introT > 0 ? 32 : 0) | (e.leapT > 0 ? 64 : 0) | (e.burrowed ? 128 : 0) | (e.flying ? 256 : 0);
      list.push([e.id, e.type, r2(e.x), r2(e.z), r2(e.ry), Math.max(0, Math.round(e.hp)), e.maxHp, e.level, flags, e.affix ? AFFIX_KEYS.indexOf(e.affix) : -1]);
    }
    return { t: 'ents', zone: this.key, list };
  }
}
