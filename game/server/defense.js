// Defend the City: flow-field pathfinding around player structures, waves, tiers, the Siege Ogre.
import { TOWN, STRUCTURES, townLayout, inGate, tierHp, tierDmg, MAX_TIER, upgradeCost, repairCost } from '../public/shared/world.js';
import { levelMul } from '../public/shared/enemies.js';
import { RNG } from '../public/shared/rng.js';

const CELL = 2, N = 100, ORIGIN = -100;
const rng = new RNG(4242);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const BLOCKERS = new Set(['barricade', 'wall']);
export const snap = (v) => Math.round((v - 1) / 2) * 2 + 1; // wall grid = flow-field cell centres

export class FlowField {
  constructor() {
    this.static = new Uint8Array(N * N);
    this.dist = new Float32Array(N * N);
    const L = townLayout();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ORIGIN + (i + 0.5) * CELL, z = ORIGIN + (j + 0.5) * CELL, r = Math.hypot(x, z);
      let ok = r < 98;
      if (ok && Math.abs(r - TOWN.wallR) < 1.6 && !inGate(x, z)) ok = false;
      if (ok) for (const c of L.colliders) if (Math.hypot(c.x - x, c.z - z) < c.r + 0.6) { ok = false; break; }
      this.static[j * N + i] = ok ? 1 : 0;
    }
    this.rebuild([]);
  }
  cellOf(x, z) { const i = Math.floor((x - ORIGIN) / CELL), j = Math.floor((z - ORIGIN) / CELL); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; }
  center(k) { return { x: ORIGIN + ((k % N) + 0.5) * CELL, z: ORIGIN + (((k / N) | 0) + 0.5) * CELL }; }
  rebuild(structures) {
    const pass = this.static.slice();
    for (const s of structures) {
      if (!BLOCKERS.has(s.kind)) continue;
      const k = this.cellOf(s.x, s.z);
      if (k >= 0) pass[k] = 0;
      // barricades are wider than one cell
      if (s.kind === 'barricade') for (const [dx, dz] of [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]]) { const kk = this.cellOf(s.x + dx, s.z + dz); if (kk >= 0) pass[kk] = 0; }
    }
    this.pass = pass;
    const D = this.dist; D.fill(Infinity);
    // Dijkstra with a binary heap
    const heap = [], push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (let k = 0; k < N * N; k++) { const c = this.center(k); if (Math.hypot(c.x, c.z) < TOWN.core.r + 2.2) { D[k] = 0; push(k, 0); } }
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length) {
      const [d, k] = pop();
      if (d > D[k]) continue;
      const i = k % N, j = (k / N) | 0;
      for (const [dx, dz, c] of nb) {
        const ni = i + dx, nj = j + dz; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (!pass[nk]) continue;
        if (dx && dz && (!pass[j * N + ni] || !pass[nj * N + i])) continue; // no corner cutting
        const nd = d + c;
        if (nd < D[nk]) { D[nk] = nd; push(nk, nd); }
      }
    }
  }
  // next waypoint toward the core, or null if no route exists from here
  next(x, z) {
    const k = this.cellOf(x, z);
    if (k < 0) return { x: x * 0.9, z: z * 0.9 };
    const i = k % N, j = (k / N) | 0;
    let best = k, bd = this.dist[k];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ni = i + dx, nj = j + dz; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni;
      if (dx && dz && (!this.pass[j * N + ni] || !this.pass[nj * N + i])) continue;
      if (this.dist[nk] < bd) { bd = this.dist[nk]; best = nk; }
    }
    if (!isFinite(bd)) return null;
    return this.center(best);
  }
}

export class Defense {
  constructor(room) {
    this.room = room;
    this.structures = new Map();
    this.flow = new FlowField();
    this.state = { phase: 'day', wave: 0, timer: 0, coreHp: 1, coreMax: 1, queue: [], spawnT: 0, result: null };
  }
  get town() { return this.room.zones.get('town'); }
  list() { return [...this.structures.values()].map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, hp: Math.round(s.hp), maxHp: Math.round(s.maxHp), tier: s.tier })); }
  changed(extra = {}) { this.flow.rebuild([...this.structures.values()]); this.town.broadcast({ t: 'structs', list: this.list(), ...extra }); }

  build(p, kind, x, z) {
    const S = STRUCTURES[kind];
    if (!S || p.zone !== 'town') return 'You can only build in Emberhold.';
    if (this.structures.size >= 64) return 'Too many structures.';
    if (S.snap) { x = snap(x); z = snap(z); }
    if (!(Math.hypot(x, z) < TOWN.wallR + 30) || Math.hypot(x, z) < TOWN.core.r + 2) return 'Cannot build there.';
    if ([...this.structures.values()].some((s) => Math.hypot(s.x - x, s.z - z) < (S.snap && STRUCTURES[s.kind].snap ? 1.5 : 1.8))) return 'Too close to another structure.';
    if (p.prof.gold < S.cost) return `Need ${S.cost} gold.`;
    p.prof.gold -= S.cost; p.dirty = true;
    const id = this.room.nextId++;
    const hp = S.hp * levelMul(this.room.level).hp;
    this.structures.set(id, { id, kind, x, z, hp, maxHp: hp, tier: 1, cd: 0 });
    this.changed({ built: id, by: p.id });
    return null;
  }
  upgrade(p, id) {
    const s = this.structures.get(id); if (!s) return 'Nothing to upgrade.';
    if (s.tier >= MAX_TIER) return 'Already at maximum tier.';
    const cost = upgradeCost(s.kind, s.tier);
    if (p.prof.gold < cost) return `Upgrading costs ${cost} gold.`;
    p.prof.gold -= cost; p.dirty = true;
    const base = STRUCTURES[s.kind].hp * levelMul(this.room.level).hp;
    s.tier++; s.maxHp = base * tierHp(s.tier); s.hp = s.maxHp;
    this.changed({ upgraded: id });
    return null;
  }
  repair(p, id) {
    const s = this.structures.get(id); if (!s) return 'Nothing to repair.';
    const cost = repairCost(s);
    if (cost <= 0) return 'Already at full health.';
    if (p.prof.gold < cost) return `Repairing costs ${cost} gold.`;
    p.prof.gold -= cost; p.dirty = true; s.hp = s.maxHp;
    this.changed({ repaired: id });
    return null;
  }
  damageStruct(s, dmg) {
    s.hp -= dmg;
    if (s.hp <= 0) { this.structures.delete(s.id); this.changed({ destroyed: s.id }); }
  }
  damageCore(dmg) {
    const d = this.state;
    if (d.phase !== 'wave' && d.phase !== 'intermission') return;
    d.coreHp -= dmg;
    this.town.broadcast({ t: 'coreHit', hp: Math.max(0, Math.round(d.coreHp)) });
    if (d.coreHp <= 0) this.endNight(false);
  }
  view() {
    const d = this.state;
    return { t: 'defense', phase: d.phase, wave: d.wave, waves: 5, timer: Math.ceil(d.timer), coreHp: Math.max(0, Math.round(d.coreHp)), coreMax: d.coreMax, result: d.result, structHp: [...this.structures.values()].map((s) => [s.id, Math.round(s.hp)]) };
  }
  startNight() {
    const d = this.state;
    if (d.phase !== 'day') return;
    const m = levelMul(this.room.level);
    Object.assign(d, { phase: 'build', wave: 0, timer: 30, coreMax: Math.round(1500 * m.hp), coreHp: Math.round(1500 * m.hp), result: null });
    this.room.broadcast({ t: 'chat', from: '★', text: 'The night bell tolls! Prepare the defenses of Emberhold!' });
    this.town.broadcast(this.view());
  }
  endNight(victory) {
    const d = this.state, town = this.town;
    d.phase = 'dawn'; d.timer = 9; d.result = victory ? 'victory' : 'defeat';
    for (const e of [...town.enemies.values()]) town.remove(e);
    town.projectiles.clear();
    const gold = victory ? Math.round((80 + 50 * d.wave) * levelMul(this.room.level).gold) : Math.round(15 * d.wave);
    for (const p of town.players()) this.room.reward(p, gold, victory ? 150 * this.room.level : 20, 0, 0, true);
    town.broadcast(this.view());
  }
  makeWave(n) {
    const q = [];
    const count = 6 + n * 4;
    for (let i = 0; i < count; i++) q.push(rng.weighted([['imp', 4], ['skeleton', 5], ['brute', n >= 2 ? 1 + n * 0.4 : 0], ['cultist', n >= 3 ? 1.5 : 0]]));
    if (n === 5) q.push('brute', 'brute', 'wraith', 'wraith', 'ogre');
    return q;
  }
  tick(dt) {
    const d = this.state, town = this.town;
    if (d.phase === 'day') return;
    d.timer -= dt;
    if (d.phase === 'build' || d.phase === 'intermission') {
      if (d.timer <= 0) { d.wave++; d.phase = 'wave'; d.queue = this.makeWave(d.wave); d.spawnT = 0; town.broadcast({ t: 'wave', wave: d.wave }); }
    } else if (d.phase === 'wave') {
      d.spawnT -= dt;
      if (d.queue.length && d.spawnT <= 0) {
        d.spawnT = Math.max(0.35, 0.9 - d.wave * 0.1);
        const type = d.queue.shift();
        const lane = type === 'ogre' ? Math.PI / 2 : rng.pick(TOWN.lanes);
        const c = Math.cos(lane), s = Math.sin(lane), j = type === 'ogre' ? 0 : rng.range(-4, 4);
        const e = town.spawn(type, c * rng.range(80, 88) - s * j, s * rng.range(80, 88) + c * j, { aggro: true, lane: TOWN.lanes.indexOf(lane) });
        if (type === 'ogre') { town.broadcast({ t: 'siege', id: e.id }); }
      }
      if (!d.queue.length && town.enemies.size === 0) {
        if (d.wave >= 5) this.endNight(true);
        else {
          d.phase = 'intermission'; d.timer = 15;
          const gold = Math.round(20 * d.wave * levelMul(this.room.level).gold);
          for (const p of town.players()) this.room.reward(p, gold, 30 * d.wave, 0, 0, true);
        }
      }
    } else if (d.phase === 'dawn' && d.timer <= 0) { d.phase = 'day'; d.result = null; }
    const lvl = levelMul(this.room.level).dmg;
    for (const st of this.structures.values()) {
      const S = STRUCTURES[st.kind], tm = tierDmg(st.tier);
      if (st.kind === 'tower') {
        st.cd -= dt;
        if (st.cd <= 0) {
          let best = null, bd = S.range + (st.tier - 1) * 2;
          for (const e of town.enemies.values()) { const dd = dist(e, st); if (dd < bd) { bd = dd; best = e; } }
          if (best) {
            st.cd = S.rate / (1 + (st.tier - 1) * 0.25);
            const id = this.room.nextId++;
            town.projectiles.set(id, { id, kind: 'arrow', x: st.x, z: st.z, target: best.id, dmg: S.dmg * lvl * tm, life: 3 });
            town.broadcast({ t: 'proj', id, kind: 'arrow', x: st.x, z: st.z, target: best.id, tier: st.tier });
          }
        }
      } else if (st.kind === 'brazier') {
        const R = S.radius + (st.tier - 1) * 0.6;
        for (const e of [...town.enemies.values()]) if (dist(e, st) < R) {
          e.burn = (e.burn || 0) + S.dps * lvl * tm * dt;
          if (e.burn >= 8) { const b = e.burn; e.burn = 0; town.damageEnemy(e, b, null, false); }
        }
      } else if (st.kind === 'frost') {
        const R = S.radius + (st.tier - 1);
        for (const e of town.enemies.values()) if (dist(e, st) < R) e.slow = 0.3;
      }
    }
  }

  // AI step for an enemy in the town during a night assault. Returns {tx, tz, reach, target}.
  steer(e, alive) {
    const def = e.def;
    const taunter = e.tauntT > 0 && alive.find((p) => p.id === e.tauntBy);
    let p = taunter || null;
    if (!p) { let bd = def.siege ? 4 : 7; for (const q of alive) { const dd = dist(q, e); if (dd < bd) { bd = dd; p = q; } } }
    if (p) return { tx: p.x, tz: p.z, reach: def.range + 0.4, target: { kind: 'player', p } };
    const structs = [...this.structures.values()];
    if (def.siege) {
      let best = null, bd = 30;
      for (const s of structs) { const dd = dist(s, e); if (dd < bd) { bd = dd; best = s; } }
      if (best) return { tx: best.x, tz: best.z, reach: def.range + 1.0, target: { kind: 'struct', s: best } };
    }
    const coreReach = TOWN.core.r + def.range * (def.ranged ? 0.6 : 1);
    if (Math.hypot(e.x, e.z) < coreReach + 0.5) return { tx: 0, tz: 0, reach: coreReach, target: { kind: 'core' } };
    const nx = this.flow.next(e.x, e.z);
    if (!nx) {
      // walled in: smash the nearest blocker
      let best = null, bd = 1e9;
      for (const s of structs) if (BLOCKERS.has(s.kind)) { const dd = dist(s, e); if (dd < bd) { bd = dd; best = s; } }
      if (best) return { tx: best.x, tz: best.z, reach: def.range + 1.2, target: { kind: 'struct', s: best } };
      return { tx: 0, tz: 0, reach: coreReach, target: { kind: 'core' } };
    }
    return { tx: nx.x, tz: nx.z, reach: 0.2, target: null, path: true };
  }

  collideStructs(e) {
    for (const s of this.structures.values()) {
      const r = (s.kind === 'barricade' ? 1.5 : s.kind === 'wall' ? 1.1 : 0.9) + e.def.radius;
      const dx = e.x - s.x, dz = e.z - s.z, l = Math.hypot(dx, dz);
      if (l < r && l > 1e-4) { e.x = s.x + (dx / l) * r; e.z = s.z + (dz / l) * r; }
    }
  }
}
