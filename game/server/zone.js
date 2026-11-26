// A simulated zone (town / dark world / a dungeon instance): enemy AI, bosses, hazards, events.
import { generateDungeon, dungeonCollide, dungeonLOS } from '../public/shared/dungeon.js';
import { ENEMIES, AFFIX_KEYS, levelMul } from '../public/shared/enemies.js';
import { DARK } from '../public/shared/world.js';
import { SHRINES } from '../public/shared/dungeon.js';
import { RNG } from '../public/shared/rng.js';
import { RIFT_MOD_KEYS, riftEnemyLevel, riftHpMul, RIFT_TIME } from '../public/shared/rifts.js';
import { REGIONS, EVENTS, QUESTS, ACT1_END, tideAt, LOW_TIDE } from '../public/shared/regions.js';
const QI = (k) => QUESTS.findIndex((q) => q.kind === k);
const HERALD_Q = QUESTS.findIndex((q) => q.kind === 'herald');
import { WEATHER_TABLE, weatherFx, hourAt, isNight } from '../public/shared/life.js';
import { separate, pack } from './crowd.js';
import { DIFFICULTY, trialOf } from '../public/shared/endgame.js';

const rng = new RNG(Date.now() & 0xffffffff);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
export const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

export class Zone {
  constructor(room, key, type, level, opts = {}) {
    this.room = room; this.key = key; this.type = type; this.level = level;
    this.diff = (type === 'dungeon' || type === 'rift') && !opts.trial ? room.difficulty || 0 : 0;
    this.enemies = new Map(); this.projectiles = new Map(); this.hazards = new Map(); this.allies = new Map();
    this.cleared = false; this.emptyT = 0; this.respawnT = 0; this.recN = 0;
    if (type === 'region') { this.region = REGIONS[key]; this.eventT = 25; this.event = null; }
    if (type === 'training') for (let i = 0; i < 3; i++) this.spawn('dummy', -6 + i * 6, -6, { introDone: true, ry: 0 });
    this.weather = 'clear'; this.weatherT = WEATHER_TABLE[key] ? rng.range(40, 90) : 1e9;
    if (type === 'dungeon' || type === 'rift') {
      this.seed = (Math.random() * 1e9) | 0;
      if (opts.trial) { this.trial = trialOf(opts.trial); this.seed = this.trial.seed; }
      if (type === 'rift') {
        this.k = this.trial ? this.trial.k : level; this.level = this.trial ? this.trial.level : riftEnemyLevel(level, room.level);
        const mods = this.trial ? this.trial.mods.slice() : RIFT_MOD_KEYS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
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
  // Rift Trial replays: 5 Hz frames of every hero and enemy, quantized to 10 cm
  recordFrame() {
    const R = (this.rec ||= { players: {}, types: [], frames: [] }), t = Date.now() - this.rift.start;
    if (R.frames.length > 2400) return; // 8 minutes max
    const ti = (type) => { let i = R.types.indexOf(type); if (i < 0) { i = R.types.length; R.types.push(type); } return i; };
    const ps = this.players().map((p) => { R.players[p.id] ||= { name: p.prof.name, cls: p.cls, color: p.prof.color, gear: p.gear, level: p.char.level }; return [p.id, Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.ry * 100), p.anim | 0, Math.round((p.hp / Math.max(1, p.maxHp)) * 100), p.dead ? 1 : 0]; });
    const es = [...this.enemies.values()].map((e) => [e.id, ti(e.type), Math.round(e.x * 10), Math.round(e.z * 10), Math.round(e.ry * 100), Math.round((e.hp / e.maxHp) * 100), e.affix ? 1 : 0]);
    R.frames.push([t, ps, es]);
  }
  get W() { return weatherFx(this.weather); }
  get night() { return (this.region || this.type === 'dark') && isNight(hourAt(this.room.clock)); }
  tickWeather(dt) {
    this.weatherT -= dt;
    if (this.weatherT > 0) return;
    const T = WEATHER_TABLE[this.key]; let next = rng.weighted(T);
    if (next === this.weather) next = rng.weighted(T);
    this.weather = next; this.weatherT = rng.range(this.weather === 'clear' ? 90 : 70, this.weather === 'clear' ? 180 : 140);
    this.broadcast({ t: 'weather', kind: this.weather, zone: this.key });
  }
  get lvl() { return this.dungeon ? this.level : this.room.level; }
  riftValue(e) { return e.def.flee ? 0 : (e.type === 'brute' ? 3 : 1) * (e.affix ? 4 : 1); }

  spawn(type, x, z, extra = {}) {
    const def = ENEMIES[type];
    const lvl = this.lvl, m = levelMul(lvl);
    const elite = extra.elite || (this.type === 'dark' && rng.chance(0.1) ? rng.pick(AFFIX_KEYS) : null);
    const D = DIFFICULTY[this.diff || 0];
    const k = (elite ? 2.6 : 1) * (this.rift ? riftHpMul(this.k) : 1) * D.hp;
    const e = {
      id: this.room.nextId++, type, def, x, z, ry: rng.range(0, 6.28), level: lvl,
      hp: Math.round(def.hp * m.hp * k), maxHp: Math.round(def.hp * m.hp * k), dmg: Math.round(def.dmg * m.dmg * (elite ? 1.35 : 1) * D.dmg), gold: def.gold * m.gold * (elite ? 3 : 1) * D.gold,
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
    const alive = this.alive(), list = [...this.enemies.values()];
    // crowd separation: spatial hash on this thread, or a worker thread for big waves (Node, EMBERFALL_WORKERS=1)
    this.push = null;
    if (list.length > 1) {
      const cw = this.room.crowd;
      if (cw && list.length >= cw.threshold) this.push = cw.step(this.key, list);
      else { this._pb = pack(list, this._pb); this._po = separate(this._pb, list.length, this._po && this._po.length >= list.length * 2 ? this._po : undefined); this.push = new Map(); for (let i = 0; i < list.length; i++) this.push.set(list[i].id, [this._po[i * 2], this._po[i * 2 + 1]]); }
    }
    for (const e of list) if (this.enemies.has(e.id)) this.tickEnemy(e, dt, alive);
    this.tickProjectiles(dt, alive);
    if (this.allies.size) this.tickAllies(dt);
    if (this.trial && this.rift && !this.rift.done && ++this.recN % 4 === 0) this.recordFrame();
    for (const h of [...this.hazards.values()]) {
      if (h.delay > 0) { h.delay -= dt; continue; }
      h.life -= dt;
      if (h.life <= 0) { this.hazards.delete(h.id); this.broadcast({ t: 'hazardEnd', id: h.id }); }
    }
    if (this.region && this.players().length) this.tickRegion(dt);
    if (WEATHER_TABLE[this.key] && this.players().length) this.tickWeather(dt);
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
    if (e.tauntT > 0) { if (e.tauntAlly) { const a = this.allies.get(e.tauntAlly); if (a && !a.dead) return a; } const t = alive.find((p) => p.id === e.tauntBy); if (t) return t; }
    let best = null, bd = 1e9;
    const range = (e.aggro ? e.def.aggro * 2.2 : e.def.aggro * (this.W.aggro || 1)) * (this.night && !e.aggro ? 1.1 : 1);
    for (const p of alive) {
      const d = dist(e, p);
      if (d < range && d < bd) {
        if (this.dungeon && !e.aggro && !dungeonLOS(this.dungeon, e.x, e.z, p.x, p.z)) continue;
        bd = d; best = p;
      }
    }
    for (const a of this.allies.values()) { if (a.dead) continue; const d = dist(e, a) * 1.25; if (d < range && d < bd) { bd = d; best = a; } }
    return best;
  }

  tickEnemy(e, dt, alive) {
    const def = e.def;
    e.cd -= dt; e.slow = Math.max(0, e.slow - dt); e.tauntT -= dt; e.stunT -= dt; e.staggerImm -= dt;
    this.tickStatus(e, dt);
    if (!this.enemies.has(e.id)) return;
    if (e.affix === 'shielded') { e.shieldCd -= dt; if (e.shieldCd <= 0) { e.shieldUp = !e.shieldUp; e.shieldCd = e.shieldUp ? 3 : 6; } }
    if (def.static) { e.state = 0; return; }
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
      if (e.type === 'herald' && this.herald(e, dt, alive, target.p, d)) return;
      if (e.type === 'hollowking' && this.hollowKing(e, dt, alive, target.p, d)) return;
      if (e.type === 'kingreborn' && this.kingReborn(e, dt, alive, target.p, d)) return;
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
      const sp = def.speed * enr * (e.speedMul || 1) * (e.burrowed ? 1.5 : 1) * (e.slow > 0 ? 0.5 : 1) * (target || defense ? 1 : 0.45) * (this.W.slow || 1);
      const step = Math.min(pathing ? d : d - reach * 0.8, sp * dt);
      e.x += (dx / d) * step; e.z += (dz / d) * step;
      moving = true;
    } else if (target && e.cd <= 0) {
      e.windT = def.windup / (e.enraged ? 1.2 : 1); e.cd = (def.cd / enr) * (e.cdMul || 1); e.atk = target;
      // heavy blows (bosses, brutes, elites) can be countered with a perfect dodge or block
      const heavy = !def.ranged && (def.boss || e.affix || ['brute', 'ogre', 'shieldbearer', 'drowned'].includes(e.type));
      e.lastAtk = Date.now(); e.parryable = heavy;
      this.broadcast(heavy ? { t: 'eatk', id: e.id, parry: true, win: r2(e.windT) } : { t: 'eatk', id: e.id });
    }
    const pp = this.push?.get(e.id); if (pp) { e.x += pp[0]; e.z += pp[1]; }
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
    if (s.ghost) { if (s.t < 0) return false; } // tidal wave: the boss keeps fighting while the wave sweeps
    else if (s.t < 0) { e.x += (s.ax - e.x) * Math.min(1, dt * 4); e.z += (s.az - e.z) * Math.min(1, dt * 4); e.ry = Math.atan2(s.bx - s.ax, s.bz - s.az); return true; }
    const k = Math.min(1, s.t / s.dur);
    if (!s.ghost) { e.x = s.ax + (s.bx - s.ax) * k; e.z = s.az + (s.bz - s.az) * k; }
    for (const p of alive) {
      if (s.hit.has(p.id)) continue;
      const vx = s.bx - s.ax, vz = s.bz - s.az, L2 = vx * vx + vz * vz || 1;
      const u = Math.max(0, Math.min(k, ((p.x - s.ax) * vx + (p.z - s.az) * vz) / L2));
      if (Math.hypot(p.x - (s.ax + vx * u), p.z - (s.az + vz * u)) < s.w / 2 && u <= k && u >= k - 0.15) { s.hit.add(p.id); send(p.ws, { t: 'hurt', dmg: Math.round(e.dmg * 1.6), from: e.id, affix: 'frozen' }); }
    }
    if (k >= 1) { e.strafe = null; if (!s.ghost) { e.flying = false; e.cd = 1; this.collide(e, e.radius); } }
    return !s.ghost;
  }

  // Hollow King: void slams, shadow bolts, wraith summons; shifts the fight to a new arena each phase.
  hollowKing(e, dt, alive, target, d) {
    if (this.phaseCheck(e, [0.66, 0.33])) {
      const A = DARK.arenas[(e.phase - 1) % DARK.arenas.length];
      e.x = A.x; e.z = A.z - 4;
      for (const p of this.players()) { p.mvGrace = Date.now() + 2500; send(p.ws, { t: 'teleport', x: A.x + rng.range(-2, 2), z: A.z + 5 + rng.range(-1, 1) }); }
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

  // ---- Act II companion (server-simulated ally that follows its owner) ----
  addAlly(p, kind = 'ilsa') {
    for (const a of this.allies.values()) if (a.owner === p.id) { if (a.kind === kind) return a; this.allies.delete(a.id); }
    const lv = p.char.level || 1, tank = kind === 'corvin', maxHp = (tank ? 260 + 60 * lv : 140 + 34 * lv);
    const a = { ally: true, kind, id: this.room.nextId++, owner: p.id, zone: this.key, x: p.x - 1.5, z: p.z - 1.5, ry: 0, hp: maxHp, maxHp, dmg: (tank ? 9 + 3.6 * lv : 7 + 3.2 * lv), dead: false, revive: 0, downT: 0, atkCd: 1, volleyCd: 5, mendCd: 8, tauntCd: 3, wallCd: 8, atkT: 0, moving: false, radius: tank ? 0.6 : 0.5 };
    this.allies.set(a.id, a);
    return a;
  }
  removeAllies(pid) { for (const a of [...this.allies.values()]) if (a.owner === pid) this.allies.delete(a.id); }
  hurtAlly(a, dmg) {
    if (a.dead) return;
    a.hp -= dmg;
    if (a.hp <= 0) { a.hp = 0; a.dead = true; a.revive = 0; a.downT = 40; this.broadcast({ t: 'allyDown', id: a.id }); }
  }
  allyShoot(a, tgt, dmg) {
    const id = this.room.nextId++;
    this.projectiles.set(id, { id, kind: 'arrow', x: a.x, z: a.z, target: tgt.id, dmg: Math.round(dmg), life: 1.5 });
    this.broadcast({ t: 'proj', id, kind: 'arrow', x: r2(a.x), z: r2(a.z), target: tgt.id, ally: 1 });
  }
  tickAllies(dt) {
    for (const a of [...this.allies.values()]) {
      const o = this.room.players.get(a.owner);
      if (!o || o.zone !== this.key) { this.allies.delete(a.id); continue; }
      a.atkT -= dt;
      for (const h of this.hazards.values()) if (h.delay <= 0 && h.dps > 0 && !a.dead && dist(h, a) < h.r) this.hurtAlly(a, h.dps * dt);
      if (a.dead) {
        // revive by standing next to her, or she gets back up on her own after a while
        const helper = this.alive().find((p) => dist(p, a) < 2.6);
        a.revive = helper ? a.revive + dt : Math.max(0, a.revive - dt * 0.5);
        a.downT -= dt;
        if (a.revive >= 2.5 || a.downT <= 0) { a.dead = false; a.hp = a.maxHp * 0.5; a.revive = 0; this.broadcast({ t: 'allyUp', id: a.id, by: helper ? helper.prof.name : null }); }
        a.moving = false; continue;
      }
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.01 * dt);
      if (a.kind === 'corvin') { this.tickCorvin(a, o, dt); continue; }
      // follow: stay at the owner's flank
      const side = Math.sin(o.ry + 2.3), back = Math.cos(o.ry + 2.3);
      const fx = o.x + side * 2.4, fz = o.z + back * 2.4, fd = Math.hypot(fx - a.x, fz - a.z);
      if (fd > 35) { a.x = fx; a.z = fz; }
      a.moving = fd > 1.2;
      if (a.moving) { const sp = Math.min(fd, (fd > 8 ? 9.5 : 6.2) * dt); a.x += ((fx - a.x) / fd) * sp; a.z += ((fz - a.z) / fd) * sp; a.ry = Math.atan2(fx - a.x, fz - a.z); }
      this.collide(a, a.radius);
      // pick targets: what's near her owner first, then near her
      let tgt = null, bd = 15;
      for (const e of this.enemies.values()) { if (e.burrowed || e.flying || e.invuln || e.def.flee && !e.aggro) continue; const d = Math.min(dist(e, a), dist(e, o) + 2); if (d < bd && (!this.dungeon || dungeonLOS(this.dungeon, a.x, a.z, e.x, e.z))) { bd = d; tgt = e; } }
      a.atkCd -= dt; a.volleyCd -= dt; a.mendCd -= dt;
      // ability 2: Mending Wind — heals the party when someone is hurt
      const hurt = this.alive().filter((p) => dist(p, a) < 10 && p.hp < p.maxHp * 0.6);
      if (a.mendCd <= 0 && (hurt.length || a.hp < a.maxHp * 0.4)) {
        a.mendCd = 16; a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.3);
        for (const p of this.alive()) if (dist(p, a) < 10) send(p.ws, { t: 'mend', amt: Math.round(p.maxHp * 0.25), from: a.id });
        this.broadcast({ t: 'allyFx', id: a.id, kind: 'mend', x: r2(a.x), z: r2(a.z) });
      }
      if (!tgt) continue;
      a.ry = Math.atan2(tgt.x - a.x, tgt.z - a.z);
      // ability 1: Piercing Volley — arrows at up to 5 targets
      if (a.volleyCd <= 0) {
        a.volleyCd = 9; a.atkT = 0.6;
        const near = [...this.enemies.values()].filter((e) => !e.burrowed && !e.flying && !e.invuln && dist(e, a) < 14).sort((x, y) => dist(x, a) - dist(y, a)).slice(0, 5);
        for (const e of near) this.allyShoot(a, e, a.dmg * 1.8);
        this.broadcast({ t: 'allyFx', id: a.id, kind: 'volley', x: r2(a.x), z: r2(a.z) });
      } else if (a.atkCd <= 0) { a.atkCd = 1.15; a.atkT = 0.35; this.allyShoot(a, tgt, a.dmg); }
    }
  }

  // Sir Corvin (Act III tank): wades into melee near his owner, taunts packs onto himself and raises a Shield Wall
  tickCorvin(a, o, dt) {
    a.atkCd -= dt; a.tauntCd -= dt; a.wallCd -= dt;
    let tgt = null, bd = 12;
    for (const e of this.enemies.values()) { if (e.burrowed || e.flying || e.invuln || e.def.static || (e.def.flee && !e.aggro)) continue; const d = dist(e, o); if (d < bd && (!this.dungeon || dungeonLOS(this.dungeon, a.x, a.z, e.x, e.z))) { bd = d; tgt = e; } }
    let tx, tz, reach;
    if (tgt) { tx = tgt.x; tz = tgt.z; reach = tgt.radius + 1.3; }
    else { tx = o.x + Math.sin(o.ry + 1.2) * 2.2; tz = o.z + Math.cos(o.ry + 1.2) * 2.2; reach = 1; }
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (Math.hypot(o.x - a.x, o.z - a.z) > 35) { a.x = o.x; a.z = o.z; }
    a.moving = d > reach;
    if (a.moving) { const sp = Math.min(d - reach * 0.8, (d > 10 ? 9.5 : 6.5) * dt); a.x += (dx / d) * sp; a.z += (dz / d) * sp; }
    if (d > 0.1) a.ry = Math.atan2(dx, dz);
    this.collide(a, a.radius);
    if (!tgt) return;
    // Taunt: every enemy within 8 m turns on him
    const near = [...this.enemies.values()].filter((e) => !e.def.boss && !e.def.static && dist(e, a) < 8);
    if (a.tauntCd <= 0 && near.length >= 2) {
      a.tauntCd = 10;
      for (const e of near) { e.tauntAlly = a.id; e.tauntT = 5; e.aggro = true; }
      this.broadcast({ t: 'allyFx', id: a.id, kind: 'taunt', x: r2(a.x), z: r2(a.z) });
    }
    // Shield Wall: party takes half damage for 5 s when the fight turns
    const hurt = this.alive().filter((p) => dist(p, a) < 11 && p.hp < p.maxHp * 0.65);
    if (a.wallCd <= 0 && (hurt.length || near.length >= 5 || a.hp < a.maxHp * 0.4)) {
      a.wallCd = 18; a.wallT = 5;
      for (const p of this.alive()) if (dist(p, a) < 11) send(p.ws, { t: 'shieldWall', dur: 5, from: a.id });
      this.broadcast({ t: 'allyFx', id: a.id, kind: 'wall', x: r2(a.x), z: r2(a.z) });
    }
    a.wallT = Math.max(0, (a.wallT || 0) - dt);
    if (d <= reach + 0.3 && a.atkCd <= 0) { a.atkCd = 1.2; a.atkT = 0.4; this.damageEnemy(tgt, a.dmg, null, false, 0.6, 0, a.x, a.z); }
  }

  // ---- Act III boss: the Hollow King Reborn (5 phases; phase 3 is a party puzzle) ----
  kingReborn(e, dt, alive, target, d) {
    const R = this.region, T = R.throne;
    if (this.phaseCheck(e, [0.8, 0.6, 0.4, 0.2])) {
      if (e.phase === 2 || e.phase === 5) { // shift the fight: everyone is pulled to a new spot around the throne
        const a = e.phase === 2 ? 0.9 : -2.2, A = { x: T.x + Math.cos(a) * 16, z: T.z + Math.sin(a) * 16 };
        e.x = A.x; e.z = A.z - 3;
        for (const p of this.players()) { p.mvGrace = Date.now() + 2500; send(p.ws, { t: 'teleport', x: A.x + rng.range(-2, 2), z: A.z + 4 + rng.range(-1, 1) }); }
        this.broadcast({ t: 'arenaShift', x: A.x, z: A.z, phase: e.phase });
        this.summon(e, e.phase === 5 ? 'drowned' : 'wraith', e.phase === 5 ? 5 : 3);
        e.introT = 1.6; return true;
      }
      if (e.phase === 3) { // the sigil puzzle: break the four Tide Sigils in the order shown on the crown
        e.invuln = true;
        const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        e.sigils = { order, next: 0, ids: [] };
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4, s = this.spawn('sigil', e.x + Math.cos(a) * 9, e.z + Math.sin(a) * 9, { sigil: i, king: e.id, introDone: true }); this.collide(s, s.radius); e.sigils.ids.push(s.id); }
        this.broadcast({ t: 'sigils', id: e.id, order, ids: e.sigils.ids });
        return true;
      }
      if (e.phase === 4) this.broadcast({ t: 'kingTide', id: e.id });
    }
    if (e.phase === 3) { // immune, raining bolts while the party works the puzzle
      e.abilityCd -= dt;
      if (e.abilityCd <= 0) { e.abilityCd = 3.2; for (const off of [-0.3, 0, 0.3]) this.heraldBolt(e, Math.atan2(target.x - e.x, target.z - e.z) + off, 12, 0.6); }
      return true;
    }
    e.slamCd -= dt; e.abilityCd -= dt; e.geyserCd -= dt;
    if (e.phase >= 4 && e.geyserCd <= 0) { // the sea answers: tidal waves sweep across the arena
      e.geyserCd = e.phase === 5 ? 4.5 : 6.5;
      const a = rng.range(0, Math.PI * 2), c = target;
      const A = { x: c.x - Math.cos(a) * 14, z: c.z - Math.sin(a) * 14 }, B = { x: c.x + Math.cos(a) * 14, z: c.z + Math.sin(a) * 14 };
      e.strafe = { ax: A.x, az: A.z, bx: B.x, bz: B.z, t: -1.3, dur: 1.4, w: 4.2, hit: new Set(), ghost: true };
      this.broadcast({ t: 'strafe', id: e.id, ax: r2(A.x), az: r2(A.z), bx: r2(B.x), bz: r2(B.z), delay: 1.3, dur: 1.4, w: 4.2, tide: true });
    }
    if (e.slamCd <= 0 && d < 8) { e.slamCd = e.phase >= 4 ? 4 : 6; e.slamT = 1.1; this.broadcast({ t: 'slam', id: e.id, x: r2(e.x), z: r2(e.z), r: 6.5, delay: 1.1, kind: 'void' }); return true; }
    if (e.abilityCd <= 0) { e.abilityCd = e.phase >= 4 ? 2.2 : 3.2; this.heraldOrbs(e, target, e.phase >= 4 ? 5 : 4, 0.2); }
    return false;
  }
  hitSigil(s, by) {
    const k = this.enemies.get(s.king); if (!k || !k.sigils) return;
    const S = k.sigils;
    if (S.order[S.next] === s.sigil) {
      S.next++; this.broadcast({ t: 'sigilBreak', i: s.sigil, n: S.next });
      this.remove(s);
      if (S.next >= 4) { k.invuln = false; k.sigils = null; k.hp = Math.min(k.hp, k.maxHp * 0.6 - 1); k.stunT = 2.5; this.broadcast({ t: 'sigilsDone', id: k.id }); }
    } else { // wrong rune: the sigils re-form and the drowned rise
      S.next = 0;
      for (const id of S.ids) if (!this.enemies.has(id)) { const i = S.ids.indexOf(id), a = (i / 4) * Math.PI * 2 + 0.4; const n = this.spawn('sigil', k.x + Math.cos(a) * 9, k.z + Math.sin(a) * 9, { sigil: i, king: k.id, introDone: true }); S.ids[i] = n.id; }
      for (let j = 0; j < 2; j++) this.spawn('drowned', s.x + rng.range(-3, 3), s.z + rng.range(-3, 3), { aggro: true, noLoot: true });
      this.broadcast({ t: 'sigilFail', ids: S.ids, order: S.order, by });
    }
  }
  summonCitadel(p) {
    if ([...this.enemies.values()].some((e) => e.def.boss)) return;
    const R = this.region, qi = p.char.quest?.i || 0;
    if (dist(p, R.altar) < 10 && qi >= QI('warden')) { this.spawn('warden', R.altar.x, R.altar.z - 5); this.broadcast({ t: 'chat', from: '★', text: 'Chains snap beneath the cathedral — the Drowned Warden rises!' }); }
    else if (dist(p, R.throne) < 10 && qi >= QI('king')) { const k = this.spawn('kingreborn', R.throne.x, R.throne.z - 5); k.maxHp = k.hp = Math.round(k.maxHp * (1 + 0.6 * (this.players().length - 1))); this.broadcast({ t: 'chat', from: '★', text: 'The Throne of Tides stirs. The Hollow King has returned!' }); }
  }
  ringBell(p, i) {
    const B = this.region.bells?.[i], q = p.char.quest || {};
    if (!B || dist(p, B) > 3.5) return;
    if (tideAt(this.room.clock) > LOW_TIDE) { send(p.ws, { t: 'notice', text: 'The bell is under the tide. Wait for low water.', color: '#7ad0ff' }); return; }
    if (QUESTS[q.i]?.kind !== 'bell' || ((q.b || 0) & (1 << i))) return;
    q.b = (q.b || 0) | (1 << i);
    this.broadcast({ t: 'bell', i, by: p.prof.name, b: q.b });
    for (let k = 0; k < 3; k++) { const a = rng.range(0, 6.28); this.spawn('drowned', B.x + Math.cos(a) * 6, B.z + Math.sin(a) * 6, { aggro: true }); }
    this.room.questEvent(p, 'bell');
  }

  // ---- Act II boss: the Storm Herald (4 phases, binds the Storm Drake in phase 2) ----
  herald(e, dt, alive, target, d) {
    if (this.phaseCheck(e, [0.75, 0.5, 0.25])) {
      if (e.phase === 2) {
        e.invuln = true; e.flying = true;
        const dr = this.spawn('drake', e.x + 6, e.z + 6, { bound: e.id, herald: e.id, introDone: true, aggro: true });
        dr.hp = dr.maxHp = Math.round(dr.maxHp * 0.6);
        this.broadcast({ t: 'heraldCall', id: e.id, drake: dr.id });
        return true;
      }
      if (e.phase === 4) this.summon(e, 'imp', 3);
    }
    e.geyserCd -= dt; e.abilityCd -= dt; e.slamCd -= dt;
    // storm strikes on every hero; faster each phase
    if (e.geyserCd <= 0) {
      e.geyserCd = [0, 5.5, 4.5, 3.6, 2.2][e.phase];
      for (const p of alive.slice(0, 4)) this.addHazard('storm', p.x + rng.range(-1, 1), p.z + rng.range(-1, 1), 2.2, 34 * levelMul(this.lvl).dmg, 0.5, 1.0);
    }
    if (e.phase === 2) {
      // floats above the Drake's fight, raining lightning orbs
      const dr = [...this.enemies.values()].find((o) => o.bound === e.id);
      if (!dr) { e.invuln = false; e.flying = false; }
      if (e.abilityCd <= 0) { e.abilityCd = 3; this.heraldOrbs(e, target, 3, 0.25); }
      return true;
    }
    if (e.phase >= 3) {
      // absorbed the Drake's power: lightning breath strafes + radial bolt novas
      e.strafeCd = (e.strafeCd ?? 4) - dt;
      if (e.strafeCd <= 0) {
        e.strafeCd = e.phase === 4 ? 6 : 8;
        const a = Math.atan2(target.x - e.x, target.z - e.z) + rng.range(-0.3, 0.3);
        const A = { x: target.x - Math.sin(a) * 13, z: target.z - Math.cos(a) * 13 }, B = { x: target.x + Math.sin(a) * 13, z: target.z + Math.cos(a) * 13 };
        this.collide(A, 1); this.collide(B, 1);
        e.strafe = { ax: A.x, az: A.z, bx: B.x, bz: B.z, t: -1.2, dur: 1.2, w: 3.6, hit: new Set() }; e.flying = true;
        this.broadcast({ t: 'strafe', id: e.id, ax: r2(A.x), az: r2(A.z), bx: r2(B.x), bz: r2(B.z), delay: 1.2, dur: 1.2, w: 3.6 });
        return true;
      }
      if (e.slamCd <= 0) {
        e.slamCd = e.phase === 4 ? 4.5 : 6.5;
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + rng.range(0, 0.3); this.heraldBolt(e, a, 11, 0.6); }
        this.broadcast({ t: 'eatk', id: e.id });
      }
    }
    if (e.phase === 4) {
      // eye of the storm: a ring of lightning closes in around the summit
      e.ringCd = (e.ringCd ?? 0) - dt;
      if (e.ringCd <= 0) {
        e.ringCd = 7; const c = this.region?.summit || e;
        for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; this.addHazard('storm', c.x + Math.cos(a) * 15, c.z + Math.sin(a) * 15, 2.6, 30 * levelMul(this.lvl).dmg, 3.5, 1.2); }
      }
    }
    if (e.abilityCd <= 0 && d < 18) { e.abilityCd = e.phase >= 3 ? 2.2 : 2.8; this.heraldOrbs(e, target, e.phase >= 3 ? 5 : 3, 0.22); return true; }
    if (d < 12) { // keep range: drift away from melee
      const dx = e.x - target.x, dz = e.z - target.z, l = Math.hypot(dx, dz) || 1;
      e.x += (dx / l) * e.def.speed * dt * 0.8; e.z += (dz / l) * e.def.speed * dt * 0.8; this.collide(e, e.radius); e.state = 1;
      return true;
    }
    return false;
  }
  heraldBolt(e, a, speed, mul) {
    const id = this.room.nextId++;
    const pr = { id, kind: 'bolt', x: e.x + Math.sin(a) * 1.6, z: e.z + Math.cos(a) * 1.6, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, dmg: Math.round(e.dmg * mul), life: 2.6, affix: 'frozen' };
    this.projectiles.set(id, pr);
    this.broadcast({ t: 'proj', id, kind: 'bolt', x: r2(pr.x), z: r2(pr.z), vx: r2(pr.vx), vz: r2(pr.vz), color: '#8ad8ff' });
  }
  heraldOrbs(e, target, n, spread) {
    const base = Math.atan2(target.x - e.x, target.z - e.z);
    for (let i = 0; i < n; i++) this.heraldBolt(e, base + (i - (n - 1) / 2) * spread, 15, 0.75);
    this.broadcast({ t: 'eatk', id: e.id });
  }
  summonHerald(p) {
    if ([...this.enemies.values()].some((e) => e.def.boss)) return;
    const S = this.region.summit;
    if (!S || dist(p, S) > 10) return;
    if ((p.char.quest?.i || 0) < HERALD_Q) return;
    const h = this.spawn('herald', S.x, S.z - 5);
    h.maxHp = h.hp = Math.round(h.maxHp * (1 + 0.6 * (this.players().length - 1)));
    this.broadcast({ t: 'chat', from: '★', text: 'The sky tears open — the Storm Herald descends upon the summit!' });
  }
  takeRelic(p, i) {
    const R = this.region.relics?.[i], q = p.char.quest || {};
    if (!R || dist(p, R) > 3.5 || QUESTS[q.i]?.kind !== 'relic' || ((q.r || 0) & (1 << i))) return;
    q.r = (q.r || 0) | (1 << i);
    send(p.ws, { t: 'relic', i, r: q.r });
    for (let k = 0; k < 3; k++) { const a = rng.range(0, 6.28); this.spawn(rng.weighted(this.region.spawns), R.x + Math.cos(a) * 6, R.z + Math.sin(a) * 6, { aggro: true }); }
    this.room.questEvent(p, 'relic');
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
      const pr = { id, x: e.x + (dx / d) * 0.8, z: e.z + (dz / d) * 0.8, vx: (dx / d) * 13, vz: (dz / d) * 13, dmg: Math.round(e.dmg * (this.W.dmg || 1)), life: 2, kind: 'bolt', affix: e.affix };
      this.projectiles.set(id, pr);
      this.broadcast({ t: 'proj', id, kind: 'bolt', x: r2(pr.x), z: r2(pr.z), vx: r2(pr.vx), vz: r2(pr.vz) });
      return;
    }
    const reach = def.range * 1.5 + 0.6;
    if (t.kind === 'player') {
      if (t.p.ally) { if (!t.p.dead && this.allies.has(t.p.id) && dist(t.p, e) < reach) this.hurtAlly(t.p, e.dmg); }
      else if (!t.p.dead && t.p.zone === this.key && dist(t.p, e) < reach) {
        send(t.p.ws, { t: 'hurt', dmg: Math.round(e.dmg * (this.W.dmg || 1) * (e.blindT > 0 ? 0.6 : 1)), from: e.id, affix: e.affix, kb: def.siege ? 1 : 0, parry: e.parryable ? 1 : 0 });
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
        if (!hit) for (const a of this.allies.values()) if (!a.dead && Math.hypot(a.x - pr.x, a.z - pr.z) < 0.9) { this.hurtAlly(a, pr.dmg); hit = true; break; }
        if (!hit && this.type === 'town') {
          for (const s of this.room.defense.structures.values()) if (dist(s, pr) < 1.2) { this.room.defense.damageStruct(s, pr.dmg); hit = true; break; }
          if (!hit && Math.hypot(pr.x, pr.z) < 2.6) { this.room.defense.damageCore(pr.dmg); hit = true; }
        }
        if (this.dungeon && !hit) { const pos = { x: pr.x, z: pr.z }; dungeonCollide(this.dungeon, pos, 0.2); if (pos.x !== pr.x || pos.z !== pr.z) end = true; }
      }
      if (hit || end) { this.projectiles.delete(pr.id); this.broadcast({ t: 'projEnd', id: pr.id, hit, x: r2(pr.x), z: r2(pr.z) }); }
    }
  }

  // ---- elemental statuses and combos ----
  tickStatus(e, dt) {
    const st = (e.st ||= { wet: 0, burn: 0, oil: 0 });
    if ((this.weather === 'rain') || (this.region?.tidal && tideAt(this.room.clock) > this.region.height(e.x, e.z) + 0.2) || (this.region && this.region.water > -50 && this.region.height(e.x, e.z) < this.region.water)) st.wet = Math.max(st.wet, 1);
    st.wet = Math.max(0, st.wet - dt); st.oil = Math.max(0, st.oil - dt); e.blindT = Math.max(0, (e.blindT || 0) - dt); e.exposedT = Math.max(0, (e.exposedT || 0) - dt);
    if (st.burn > 0) {
      st.burn -= dt; st.burnAcc = (st.burnAcc || 0) + dt;
      if (st.burnAcc >= 0.5) { st.burnAcc = 0; const d = Math.max(1, Math.round(st.burnDps * 0.5)); e.hp -= e.def.static ? 0 : d; this.broadcast({ t: 'ehit', id: e.id, dmg: d, by: null, dot: 'burn' }); if (e.hp <= 0) this.kill(e, st.burnBy); }
    }
  }
  combo(e, dmg, by, el) {
    const st = (e.st ||= { wet: 0, burn: 0, oil: 0 }), out = { dmg, stun: 0 };
    if (el === 'storm' && st.wet > 0) { // SHOCK: stun, bonus damage, arcs to nearby wet enemies
      out.dmg *= 1.5; out.stun = 1.2; st.wet = 0; e.stunT = Math.max(e.stunT, e.def.boss ? 0.5 : 1.2); e.windT = 0; // shock ignores poise
      const arc = [...this.enemies.values()].filter((o) => o !== e && o.st?.wet > 0 && dist(o, e) < 6).slice(0, 2);
      this.broadcast({ t: 'combo', kind: 'shock', id: e.id, x: r2(e.x), z: r2(e.z), arcs: arc.map((o) => [r2(o.x), r2(o.z)]), by });
      for (const o of arc) { o.st.wet = 0; this.damageEnemy(o, dmg * 0.6, by, false, 0, 0.8); }
    } else if (el === 'fire' && st.oil > 0) { // EXPLOSION: oil ignites
      st.oil = 0;
      this.broadcast({ t: 'combo', kind: 'explode', id: e.id, x: r2(e.x), z: r2(e.z), r: 3.5, by });
      for (const o of [...this.enemies.values()]) if (o !== e && dist(o, e) < 3.5) this.damageEnemy(o, dmg * 2.2, by, false, 1.5, 0, e.x, e.z);
      out.dmg *= 2.2;
    } else if (el === 'fire' && st.wet > 0) { // STEAM: blinds everything nearby (they hit 40% softer)
      st.wet = 0;
      for (const o of this.enemies.values()) if (dist(o, e) < 3.5) o.blindT = 4;
      this.broadcast({ t: 'combo', kind: 'steam', id: e.id, x: r2(e.x), z: r2(e.z), r: 3.5, by });
    } else if (el === 'fire') { st.burn = 3; st.burnDps = Math.max(st.burnDps && st.burn > 0 ? st.burnDps : 0, dmg * 0.18); st.burnBy = by; }
    else if (el === 'oil') st.oil = 7;
    else if (el === 'water') st.wet = 7;
    return out;
  }
  counter(p, id) {
    const e = this.enemies.get(id), now = Date.now();
    if (!e || !e.parryable || now - (e.lastAtk || 0) > 1600 || e.lastCounter === e.lastAtk || dist(e, p) > 9) return false;
    e.lastCounter = e.lastAtk; e.windT = 0; e.stunT = Math.max(e.stunT, e.def.boss ? 1.2 : 2.2); e.exposedT = 4;
    this.broadcast({ t: 'countered', id, by: p.id, name: p.prof.name });
    return true;
  }

  damageEnemy(e, dmg, by, crit, kb = 0, stun = 0, fx, fz, el) {
    if (!this.enemies.has(e.id) || e.introT > 0 || e.burrowed || e.flying) return;
    if (el && el !== 'phys') { const c = this.combo(e, dmg, by, el); dmg = c.dmg; stun = Math.max(stun, c.stun); if (!this.enemies.has(e.id)) return; }
    if (e.exposedT > 0) dmg *= 1.5;
    if (e.invuln) { if (by) this.broadcast({ t: 'ehit', id: e.id, dmg: 0, by, shield: true, immune: true }); return; }
    if (e.shieldUp) dmg *= 0.25;
    let blocked = false;
    if (e.def.frontal && fx !== undefined && e.stunT <= 0) {
      const ax = fx - e.x, az = fz - e.z, l = Math.hypot(ax, az) || 1;
      if ((ax / l) * Math.sin(e.ry) + (az / l) * Math.cos(e.ry) > 0.35) { dmg *= 0.2; blocked = true; stun = 0; kb = 0; }
    }
    if (e.def.static) { if (e.sigil !== undefined) this.hitSigil(e, by); else if (e.type === 'dummy') this.broadcast({ t: 'ehit', id: e.id, dmg: Math.round(dmg), crit: !!crit, by, el: el || null }); return; }
    e.hp -= dmg; e.aggro = true;
    if (e.type === 'kingreborn' && e.phase < 5) e.hp = Math.max(e.hp, e.maxHp * [0.8, 0.6, 0.4, 0.2][e.phase - 1] - 1);
    if (e.type === 'herald' && e.phase < 4) e.hp = Math.max(e.hp, e.maxHp * [0.75, 0.5, 0.25][e.phase - 1] - 1); // every phase plays out
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
      let gold = e.gold * rng.range(0.8, 1.25) * (this.W.gold || 1);
      if (def.flee) gold *= 2.5;
      this.room.reward(p, gold, def.xp * (1 + 0.15 * (e.level - 1)) * e.xpMul * (this.night ? 1.25 : 1), e.x, e.z);
      if (!e.noLoot && rng.chance(def.boss ? 1 : e.affix ? 0.3 : 0.05)) send(p.ws, { t: 'gem', k: this.room.dropGem(p, e.level) });
      const chance = e.noLoot ? 0 : def.boss || def.flee ? 1 : e.affix ? 0.6 : this.type === 'town' ? 0.05 : e.type === 'brute' ? 0.4 : e.type === 'wraith' ? 0.22 : 0.13;
      if (rng.chance(chance)) {
        const n = def.boss ? 3 : def.flee ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const opts = def.boss ? { minRarity: k === 0 ? 3 : 2, luck: 2 } : def.flee ? { minRarity: 2, luck: 2.5 } : e.affix ? { minRarity: 1, luck: 1.5 } : {};
          if (this.diff) { opts.luck = (opts.luck || 1) * DIFFICULTY[this.diff].luck; if (def.boss) opts.nightmare = this.diff; }
          this.room.giveLoot(p, e.level, opts, e.x + rng.range(-1.4, 1.4), e.z + rng.range(-1.4, 1.4));
        }
      }
    }
    const bz = this.dungeon ? 'dungeon' : this.region ? this.key : this.type;
    if (def.boss) for (const p of this.players()) { const T = (p.prof.trophies ||= {}); if (!T[e.type]) send(p.ws, { t: 'notice', text: `Trophy earned: ${e.def.name} — display it in your home!`, color: '#ffd34d' }); T[e.type] = (T[e.type] || 0) + 1; p.dirty = true; }
    for (const p of this.players()) {
      this.room.bounty(p, 'kill', 1, { zone: bz });
      if (e.affix) this.room.bounty(p, 'elite');
      if (def.boss) { this.room.bounty(p, 'boss'); this.room.marks(p, 5); }
      if (def.boss && this.type === 'dungeon') this.room.bounty(p, 'dungeon');
    }
    if (def.boss && this.diff) for (const p of this.players()) { const m = (p.prof.mats ||= { shards: 0, cores: 0 }); m.essence = (m.essence || 0) + DIFFICULTY[this.diff].essence; p.dirty = true; send(p.ws, { t: 'notice', text: `+${DIFFICULTY[this.diff].essence} Nightmare Essence`, color: '#c83aff' }); }
    if (def.boss && this.type === 'dungeon') for (const p of this.players()) this.room.questEvent(p, 'dungeon');
    if (e.type === 'colossus') for (const p of this.players()) this.room.questEvent(p, 'actboss');
    if (this.key === 'citadel') for (const p of this.players()) {
      if (e.type === 'warden') this.room.questEvent(p, 'warden');
      else if (e.type === 'kingreborn') { this.room.questEvent(p, 'king'); for (let k = 0; k < 2; k++) this.room.giveLoot(p, e.level + 2, { rarity: 4 }, e.x + 1.5 * k, e.z); }
      else if (!def.boss && !def.static) this.room.questEvent(p, 'kill_citadel');
    }
    if (e.type === 'kingreborn') { for (const o of [...this.enemies.values()]) if (o.king === e.id || o.def.static) this.remove(o); this.broadcast({ t: 'actComplete', act: 3, x: r2(e.x), z: r2(e.z) }); }
    if (this.key === 'peaks') for (const p of this.players()) {
      if (e.type === 'drake') this.room.questEvent(p, 'drake');
      else if (e.type === 'herald') { this.room.questEvent(p, 'herald'); this.room.giveLoot(p, e.level + 1, { rarity: 4 }, e.x + 1.5, e.z); }
      else if (!def.boss && !e.bound) this.room.questEvent(p, 'kill_peaks');
    }
    if (e.bound) { const h = this.enemies.get(e.bound); if (h) { h.invuln = false; h.flying = false; h.hp = Math.min(h.hp, h.maxHp * 0.5 - 1); this.collide(h, h.radius); this.broadcast({ t: 'heraldBond', id: h.id }); } }
    if (e.type === 'herald') { for (const o of [...this.enemies.values()]) if (o.herald === e.id) this.remove(o); this.broadcast({ t: 'actComplete', act: 2, x: r2(e.x), z: r2(e.z) }); }
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
      if (Math.hypot(x - R.spawn.x, z - R.spawn.z) > 16) this.spawn(rng.weighted(R.spawns), x, z, this.night && rng.chance(0.14) ? { elite: rng.pick(AFFIX_KEYS) } : {});
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
      this.room.questEvent(p, 'event'); this.room.bounty(p, 'event');
    }
  }
  summonColossus(p) {
    if (this.region.summit && dist(p, this.region.summit) < 10) return this.summonHerald(p);
    if (this.key === 'citadel') return this.summonCitadel(p);
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

  // Delta-compressed snapshot vs the previous broadcast: new rows in full, moved rows as [id,x,z,ry],
  // rows whose vitals changed as [id,x,z,ry,hp,flags,maxHp], removed ids. Values are absolute, so a delta
  // also applies cleanly on top of the newer full snapshot a joining player receives. Keyframe every 40.
  deltaSnapshot() {
    const full = this.snapshot();
    this.snapN = (this.snapN || 0) + 1;
    const prev = this.lastSnap, cur = new Map(full.list.map((r) => [r[0], r]));
    this.lastSnap = cur;
    if (!prev || this.snapN % 40 === 0) return full;
    const add = [], upd = [], del = [];
    for (const [id, r] of cur) {
      const p = prev.get(id);
      if (!p) { add.push(r); continue; }
      const vit = p[5] !== r[5] || p[8] !== r[8] || p[6] !== r[6];
      const mov = Math.abs(p[2] - r[2]) > 0.02 || Math.abs(p[3] - r[3]) > 0.02 || Math.abs(p[4] - r[4]) > 0.05;
      const qx = Math.round(r[2] * 20), qz = Math.round(r[3] * 20), qr = Math.round(r[4] * 40); // 5 cm / 1.4° integers
      if (vit) upd.push([id, qx, qz, qr, r[5], r[8], r[6]]);
      else if (mov) upd.push([id, qx, qz, qr]);
      else r[2] = p[2], r[3] = p[3], r[4] = p[4]; // keep the base the client has so slow drift is still sent later
    }
    for (const id of prev.keys()) if (!cur.has(id)) del.push(id);
    const out = { t: 'entsD', zone: this.key, add, upd, del };
    if (full.allies) out.allies = full.allies;
    return out;
  }

  snapshot() {
    const list = [];
    for (const e of this.enemies.values()) {
      const flags = e.state | (e.slow > 0 ? 2 : 0) | (e.shieldUp ? 4 : 0) | (e.stunT > 0 ? 8 : 0) | (e.enraged ? 16 : 0) | (e.introT > 0 ? 32 : 0) | (e.leapT > 0 ? 64 : 0) | (e.burrowed ? 128 : 0) | (e.flying ? 256 : 0) | (e.invuln ? 512 : 0) | (e.st?.wet > 0 ? 1024 : 0) | (e.st?.burn > 0 ? 2048 : 0) | (e.st?.oil > 0 ? 4096 : 0) | (e.blindT > 0 ? 8192 : 0) | (e.exposedT > 0 ? 16384 : 0);
      list.push([e.id, e.type, r2(e.x), r2(e.z), r2(e.ry), Math.max(0, Math.round(e.hp)), e.maxHp, e.level, flags, e.affix ? AFFIX_KEYS.indexOf(e.affix) : -1]);
    }
    const out = { t: 'ents', zone: this.key, list };
    if (this.allies.size) out.allies = [...this.allies.values()].map((a) => [a.id, a.owner, r2(a.x), r2(a.z), r2(a.ry), Math.max(0, Math.round(a.hp)), a.maxHp, (a.dead ? 1 : 0) | (a.atkT > 0 ? 2 : 0) | (a.moving ? 4 : 0), r2(a.revive / 2.5), a.kind === 'corvin' ? 1 : 0, (a.wallT || 0) > 0 ? 1 : 0]);
    return out;
  }
}
