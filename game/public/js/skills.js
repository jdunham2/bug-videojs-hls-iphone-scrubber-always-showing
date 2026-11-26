// Class skills, client projectiles, Ember Spirits, and skill VFX (also replayed for remote players).
import * as THREE from 'three';
import { G } from './state.js';
import { CLASSES } from '../shared/classes.js';
import { isFloor } from '../shared/dungeon.js';

const angDiff = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function temp(obj, dur, update, dispose) { G.fx.root.add(obj); G.fx.items.push({ obj, t: 0, dur, update: (it, k) => update(k), dispose }); }

// ---------- enemy queries ----------
export function enemiesInArc(pos, ry, range, arc) {
  const out = [];
  for (const e of G.enemies.values()) {
    if (e.dead) continue;
    const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, d = Math.hypot(dx, dz);
    if (d > range + e.radius) continue;
    if (angDiff(Math.atan2(dx, dz), ry) > arc / 2 && d > e.radius + 0.6) continue;
    out.push(e);
  }
  return out;
}
export function enemiesInRadius(pos, r) { return [...G.enemies.values()].filter((e) => !e.dead && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < r + e.radius); }
export function nearestEnemy(pos, r, exclude) {
  let best = null, bd = r;
  for (const e of G.enemies.values()) { if (e.dead || exclude?.has(e)) continue; const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z); if (d < bd) { bd = d; best = e; } }
  return best;
}

// ---------- VFX (shared local/remote) ----------
export function fxPlay(kind, d) {
  const fx = G.fx, zone = G.zone;
  if (!zone) return;
  const gy = (x, z) => zone.groundHeight(x, z);
  const P = V(d.x, gy(d.x, d.z), d.z);
  switch (kind) {
    case 'bash':
      fx.shockwave(P, 2.6, '#9fd0ff', 0.3);
      fx.emit({ pos: P.clone().setY(P.y + 0.6), count: 30, speed: 6, color: '#dff2ff', color2: '#4a8cff', size: 0.3, life: 0.4, dir: V(Math.sin(d.ry), 0.2, Math.cos(d.ry)), spread: 0.7 });
      G.audio.block(false); break;
    case 'cry':
      fx.shockwave(P, 11, '#ff6a4a', 0.6); fx.shockwave(P, 6, '#ffd36a', 0.45);
      fx.emit({ pos: P.clone().setY(P.y + 1.5), count: 60, speed: 5, color: '#ffb060', color2: '#ff2000', size: 0.35, life: 0.8, flat: true });
      G.audio.horn(); break;
    case 'quake':
      fx.shockwave(P, d.r || 4.8, '#ffb347', 0.45); fx.shockwave(P, (d.r || 4.8) * 0.6, '#ffffff', 0.3);
      fx.emit({ pos: P.clone().setY(P.y + 0.2), count: 80, speed: 9, color: '#ffd080', color2: '#ff3a00', size: 0.4, life: 0.7, flat: true, drag: 3 });
      fx.emit({ pos: P.clone().setY(P.y + 0.2), count: 30, speed: 4, color: '#9a8a70', color2: '#3a3020', size: 0.6, life: 1, up: 1, gravity: 6 });
      G.audio.slam(); break;
    case 'blink': {
      const T = V(d.tx, gy(d.tx, d.tz) + 1, d.tz);
      fx.emit({ pos: P.clone().setY(P.y + 1), count: 40, speed: 3, color: '#ffcf6a', color2: '#ff3a00', size: 0.35, life: 0.5, radius: 0.4, height: 1.2 });
      fx.emit({ pos: T, count: 50, speed: 5, color: '#fff2c0', color2: '#ff6a1a', size: 0.35, life: 0.5 });
      const geo = new THREE.BufferGeometry().setFromPoints([P.clone().setY(P.y + 1), T]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color('#ffb04a').multiplyScalar(3), transparent: true }));
      temp(line, 0.25, (k) => { line.material.opacity = 1 - k; }, () => { geo.dispose(); line.material.dispose(); });
      G.audio.blink(); break;
    }
    case 'whirl':
      fx.emit({ pos: P.clone().setY(P.y + 0.9), count: 16, speed: 7, color: '#ffd080', color2: '#ff2a00', size: 0.45, life: 0.45, flat: true, radius: 0.5 });
      fx.slash(P.clone().setY(P.y + 0.9), Math.random() * 6, '#ff9a3c', 3.2, 1, Math.PI * 1.8);
      break;
    case 'execute':
      fx.slash(P.clone().setY(P.y + 1.1), d.ry, '#ff3a1a', 3.6, 2, 2.2);
      fx.emit({ pos: P.clone().setY(P.y + 1.1).add(V(Math.sin(d.ry) * 1.8, 0, Math.cos(d.ry) * 1.8)), count: 70, speed: 8, color: '#ffe0a0', color2: '#ff1000', size: 0.4, life: 0.6 });
      G.audio.explode(); break;
    case 'firebolt': case 'bolt':
      spawnVisualBolt(P, V(d.tx, 0, d.tz), kind === 'firebolt'); break;
    case 'explode': {
      const r = d.r || 2.6;
      fx.shockwave(P, r, '#ff8a2a', 0.4);
      fx.emit({ pos: P.clone().setY(P.y + 0.8), count: 70, speed: 7, color: '#ffe0a0', color2: '#ff2000', size: 0.5, life: 0.7 });
      G.audio.explode(); break;
    }
    case 'chain': lightning(d.pts.map(([x, z]) => V(x, gy(x, z) + 1.2, z))); G.audio.zap(); break;
    case 'meteor': meteorFx(P, d.r || 4.2, d.delay || 1.1); break;
    case 'spirit': fx.emit({ pos: P.clone().setY(P.y + 2), count: 60, speed: 3, color: '#ffe8a0', color2: '#ff6a1a', size: 0.35, life: 1, up: 1 }); G.audio.summon(); break;
    case 'afterimage':
      fx.shockwave(P, 3, '#ff6a1a', 0.35);
      fx.emit({ pos: P.clone().setY(P.y + 0.8), count: 40, speed: 6, color: '#ffc060', color2: '#ff1a00', size: 0.45, life: 0.5 });
      G.audio.fire(); break;
  }
}

function spawnVisualBolt(from, to, big) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.32 : 0.18, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(big ? '#ff7a2a' : '#ffb35a').multiplyScalar(3) }));
  const a = from.clone().setY(from.y + 1.3), b = V(to.x, G.zone.groundHeight(to.x, to.z) + 1.1, to.z);
  m.position.copy(a);
  const dur = Math.max(0.1, a.distanceTo(b) / 24);
  temp(m, dur, (k) => { m.position.lerpVectors(a, b, k); G.fx.emit({ pos: m.position, count: 2, speed: 0.4, color: '#ffc060', color2: '#ff2a00', size: big ? 0.5 : 0.3, life: 0.35 }); }, () => { m.geometry.dispose(); m.material.dispose(); });
}

function lightning(pts) {
  const all = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let k = 0; k <= 8; k++) {
      const p = a.clone().lerp(b, k / 8);
      if (k > 0 && k < 8) p.add(V((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9));
      all.push(p);
    }
    G.fx.emit({ pos: b, count: 18, speed: 5, color: '#ffffff', color2: '#6ab0ff', size: 0.3, life: 0.35 });
  }
  const geo = new THREE.BufferGeometry().setFromPoints(all);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color('#bfe0ff').multiplyScalar(4), transparent: true }));
  temp(line, 0.3, (k) => { line.material.opacity = 1 - k; line.visible = Math.random() > 0.15; }, () => { geo.dispose(); line.material.dispose(); });
}

function meteorFx(P, r, delay) {
  G.fx.telegraph(P, r, delay, '#ff6a1a');
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: '#3a2010', emissive: '#ff4a10', emissiveIntensity: 2.5, flatShading: true }));
  const from = P.clone().add(V(-8, 26, -6));
  temp(rock, delay, (k) => {
    rock.position.lerpVectors(from, P, k * k); rock.rotation.x += 0.2; rock.rotation.y += 0.13;
    G.fx.emit({ pos: rock.position, count: 3, speed: 0.6, color: '#ffc060', color2: '#ff2000', size: 0.9, life: 0.5 });
  }, () => {
    rock.geometry.dispose(); rock.material.dispose();
    G.fx.shockwave(P, r, '#ff8a2a', 0.5); G.fx.shockwave(P, r * 0.5, '#ffffff', 0.3);
    G.fx.emit({ pos: P.clone().setY(P.y + 0.5), count: 120, speed: 11, color: '#ffe0a0', color2: '#ff1000', size: 0.55, life: 0.9, up: 1 });
    G.shake = Math.max(G.shake, 0.7); G.audio.explode();
  });
}

// ---------- local skill logic ----------
export class SkillKit {
  constructor(player) {
    this.p = player;
    this.cds = [0, 0, 0, 0];
    this.projectiles = [];
    this.spirits = [];
    this.pending = []; // delayed effects { t, fn }
    this.whirlT = 0; this.whirlTick = 0; this.flurry = null; this.bash = null; this.exec = null;
  }
  get cls() { return CLASSES[this.p.cls]; }
  def(i) { return this.cls.skills[i]; }
  cdMax(i) { const d = this.def(i); return d.cd * (1 - this.p.stats.cdr) * (d.id === 'taunt' && this.p.stats.flags.bastion4 ? 0.5 : 1); }
  cost(i) { const d = this.def(i); return d.id === 'quake' && this.p.stats.flags.quakeFree ? 0 : Math.round(d.cost * this.p.stats.costMul); }
  busy() { return this.whirlT > 0 || this.flurry || this.bash || this.exec; }
  resetCooldowns() { this.cds = [0, 0, 0, 0]; }

  tryCast(i, aimYaw) {
    const p = this.p, S = this.def(i);
    if (S.hold) return false;
    if (this.cds[i] > 0) { G.ui.flashSkill(i, 'cd'); return false; }
    const cost = this.cost(i);
    if (p.resource < cost) { G.ui.flashSkill(i, 'res'); G.ui.toast(`Not enough ${this.cls.resource.name}`, this.cls.resource.color); return false; }
    if (this.busy() || p.roll || p.slamT >= 0) return false;
    const ok = this[S.id]?.(aimYaw);
    if (ok === false) return false;
    p.resource -= cost;
    this.cds[i] = this.cdMax(i);
    p.addStyle(8, S.id);
    p.combatT = 0;
    return true;
  }
  send(kind, d) { fxPlay(kind, d); G.net.send({ t: 'fx', kind, ...d }); }
  mods(k) { return 1 + (this.p.stats.T[k] || 0) + this.p.stats.skillDmg; }
  has(f) { return !!this.p.stats.flags[f]; }

  // ===== Warden =====
  bash(yaw) {
    const p = this.p;
    p.ry = p.aimDir(yaw);
    this.bash = { t: 0, dir: V(Math.sin(p.ry), 0, Math.cos(p.ry)), hit: new Set() };
    p.invuln = Math.max(p.invuln, 0.2);
    G.audio.dash();
  }
  taunt() {
    const p = this.p;
    G.net.send({ t: 'taunt', r: 11, dur: 6 });
    p.tauntBuffT = 6;
    if (this.has('w_furycry')) { p.furyT = 6; G.ui.toast('Battle Fury! +30% damage', '#ff6a4a'); }
    const heal = p.stats.maxHp * (p.stats.T.cryHeal || 0);
    if (heal > 0) { p.heal(heal); }
    p.resource = Math.min(p.stats.resMax, p.resource + 25);
    p.emote = 'taunt'; p.emoteT = 0; p.emoteDur = 0.9;
    this.send('cry', { x: p.pos.x, z: p.pos.z });
  }
  quake(yaw) {
    const p = this.p;
    if (!p.onGround) return false;
    p.slamT = 0; p.vy = 7; p.onGround = false; p.atk.t = -1; p.ry = p.aimDir(yaw);
    G.audio.swing(true);
  }
  quakeImpact(mul = 1) {
    const p = this.p, R = 4.8 + (p.stats.T.quakeR || 0);
    for (const e of enemiesInRadius(p.pos, R)) p.dealDamage(e, p.stats.dmg * 2.3 * this.mods('s3') * mul, { kb: 2, stun: 0.6 });
    if (mul === 1 && this.has('w_aftershock')) this.pending.push({ t: 0.8, fn: () => this.quakeImpact(0.6) });
    this.send('quake', { x: p.pos.x, z: p.pos.z, r: R });
    G.shake = Math.max(G.shake, 0.6); G.hitstop = 0.06;
  }
  // ===== Emberblade =====
  blink(yaw) {
    const p = this.p;
    const target = (G.lock && !G.lock.dead ? G.lock : null) || p.aimTarget(yaw, 12) || nearestEnemy(p.pos, 12);
    const from = p.pos.clone();
    if (target) {
      const dx = target.pos.x - p.pos.x, dz = target.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
      const np = { x: target.pos.x + (dx / l) * (target.radius + 1.0), z: target.pos.z + (dz / l) * (target.radius + 1.0) };
      G.zone.collide(np, 0.45);
      p.pos.x = np.x; p.pos.z = np.z;
      p.ry = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
      p.dealDamage(target, p.stats.dmg * 2 * this.mods('s0'), { crit: true, kb: 1, stun: 0.5 });
      if (this.has('e_twinblink')) { const t2 = nearestEnemy(target.pos, 7, new Set([target])); if (t2) { p.dealDamage(t2, p.stats.dmg * 2 * this.mods('s0'), { crit: true, kb: 1 }); fxPlay('blink', { x: target.pos.x, z: target.pos.z, tx: t2.pos.x, tz: t2.pos.z }); } }
      p.atk.combo = 1; p.atk.t = 0.4; p.atk.dur = 0.3; p.atk.hit = true; p.atk.face = p.ry;
    } else {
      const np = { x: p.pos.x + Math.sin(p.ry) * 6, z: p.pos.z + Math.cos(p.ry) * 6 };
      G.zone.collide(np, 0.45); p.pos.x = np.x; p.pos.z = np.z;
    }
    p.invuln = Math.max(p.invuln, 0.25);
    this.send('blink', { x: from.x, z: from.z, tx: p.pos.x, tz: p.pos.z });
  }
  whirl() { this.whirlT = 1.5 + (this.p.stats.T.whirlDur || 0); this.whirlTick = 0; G.audio.whirl(); }
  flurry(yaw) { const p = this.p; p.ry = p.aimDir(yaw); this.flurry = { n: 6 + (p.stats.T.flurry || 0), t: 0, done: 0 }; }
  execute(yaw) { const p = this.p; p.ry = p.aimDir(yaw); this.exec = { t: 0 }; p.atk.combo = 2; p.atk.t = 0; p.atk.dur = 0.6; p.atk.hit = true; p.atk.face = p.ry; G.audio.swing(true); }
  // ===== Hexcaller =====
  firebolt(yaw) {
    const p = this.p; p.ry = p.aimDir(yaw); p.castT = 0.35;
    const o = { speed: 22, mul: 2.2 * this.mods('s0'), aoe: 2.6 + (p.stats.T.boltR || 0), big: true, kb: 1.5 };
    if (this.has('h_trinity')) { const r0 = p.ry; for (const d of [-0.28, 0, 0.28]) { p.ry = r0 + d; this.shoot(o); } p.ry = r0; } else this.shoot(o);
    G.audio.fire();
  }
  chain(yaw) {
    const p = this.p;
    let cur = (G.lock && !G.lock.dead ? G.lock : null) || p.aimTarget(yaw, 16) || nearestEnemy(p.pos, 16);
    if (!cur) { G.ui.toast('No target in range', '#8fd0ff'); return false; }
    p.ry = Math.atan2(cur.pos.x - p.pos.x, cur.pos.z - p.pos.z); p.castT = 0.4;
    const hit = new Set(), pts = [[p.pos.x, p.pos.z]];
    let mul = 1.5, n = 5 + (p.stats.T.chains || 0);
    while (cur && n-- > 0) {
      hit.add(cur); pts.push([cur.pos.x, cur.pos.z]);
      p.dealDamage(cur, p.stats.dmg * mul, { stun: p.stats.flags.overload ? 1.2 : 0.15 });
      mul *= 0.85;
      const prev = cur;
      cur = nearestEnemy(prev.pos, 7, hit);
      if (this.has('h_fork') && cur) { const f = nearestEnemy(prev.pos, 7, new Set([...hit, cur])); if (f) { hit.add(f); p.dealDamage(f, p.stats.dmg * mul, { stun: p.stats.flags.overload ? 1.2 : 0.15 }); pts.push([f.pos.x, f.pos.z], [prev.pos.x, prev.pos.z]); } }
    }
    this.send('chain', { x: p.pos.x, z: p.pos.z, pts });
  }
  spirit() {
    const p = this.p;
    const n = p.stats.flags.twin ? 2 : 1;
    for (const s of this.spirits) s.dispose();
    this.spirits = [];
    for (let i = 0; i < n; i++) this.spirits.push(new Spirit(p, i, this.has('spiritPerm') ? 1e9 : 20 + (p.stats.T.spiritDur || 0)));
    this.send('spirit', { x: p.pos.x, z: p.pos.z });
  }
  meteor(yaw) {
    const p = this.p;
    const t = (G.lock && !G.lock.dead ? G.lock : null) || p.aimTarget(yaw, 18);
    const pt = t ? { x: t.pos.x, z: t.pos.z } : { x: p.pos.x - Math.sin(yaw) * 9, z: p.pos.z - Math.cos(yaw) * 9 };
    p.castT = 0.6; p.ry = Math.atan2(pt.x - p.pos.x, pt.z - p.pos.z);
    const R = 4.2;
    this.send('meteor', { x: pt.x, z: pt.z, r: R, delay: 1.1 });
    this.pending.push({ t: 1.1, fn: () => { for (const e of enemiesInRadius(V(pt.x, 0, pt.z), R)) p.dealDamage(e, p.stats.dmg * 3.5 * this.mods('s3'), { kb: 2.5, stun: 0.8 }); } });
    if (this.has('h_shower')) for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + Math.random(), q = { x: pt.x + Math.cos(a) * 4, z: pt.z + Math.sin(a) * 4 }, delay = 1.3 + k * 0.2;
      this.send('meteor', { x: q.x, z: q.z, r: 2.6, delay });
      this.pending.push({ t: delay, fn: () => { for (const e of enemiesInRadius(V(q.x, 0, q.z), 2.6)) p.dealDamage(e, p.stats.dmg * 1.5 * this.mods('s3'), { kb: 1.5 }); } });
    }
  }
  basicBolt(yaw) {
    const p = this.p; p.ry = p.aimDir(yaw); p.castT = 0.25;
    this.shoot({ speed: 28, mul: 1, aoe: 0 });
    G.audio.bolt();
  }
  shoot(o) {
    const p = this.p;
    const dir = V(Math.sin(p.ry), 0, Math.cos(p.ry));
    const pos = p.pos.clone().add(dir.clone().multiplyScalar(0.8)); pos.y += 1.3;
    this.projectiles.push(new Bolt(pos, dir, o, (e, at) => this.boltHit(e, at, o)));
    G.net.send({ t: 'fx', kind: o.big ? 'firebolt' : 'bolt', x: p.pos.x, z: p.pos.z, tx: p.pos.x + dir.x * 16, tz: p.pos.z + dir.z * 16 });
  }
  boltHit(e, at, o) {
    const p = this.p;
    if (o.aoe) {
      for (const x of enemiesInRadius(at, o.aoe)) p.dealDamage(x, p.stats.dmg * o.mul, { kb: o.kb || 0 });
      this.send('explode', { x: at.x, z: at.z, r: o.aoe });
    } else if (e) p.dealDamage(e, p.stats.dmg * o.mul * (o.spirit ? 1 : 1), { kb: 0.3 });
  }

  update(dt, yaw) {
    const p = this.p;
    for (let i = 0; i < 4; i++) this.cds[i] = Math.max(0, this.cds[i] - dt);
    for (let i = this.pending.length - 1; i >= 0; i--) { const q = this.pending[i]; q.t -= dt; if (q.t <= 0) { q.fn(); this.pending.splice(i, 1); } }
    if (this.bash) {
      const b = this.bash; b.t += dt;
      p.vel.copy(b.dir).multiplyScalar(18);
      for (const e of enemiesInArc(p.pos, p.ry, 1.9, 2.2)) if (!b.hit.has(e)) {
        b.hit.add(e);
        p.dealDamage(e, p.stats.dmg * 1.6 * this.mods('s0'), { kb: 2.5, stun: 1.5 + (p.stats.T.stun || 0) });
        this.send('bash', { x: e.pos.x, z: e.pos.z, ry: p.ry }); G.hitstop = 0.07; G.shake = Math.max(G.shake, 0.35);
      }
      if (b.t > 0.28) {
        this.bash = null; p.vel.multiplyScalar(0.2);
        if (this.has('w_shockbash')) { for (const e of enemiesInArc(p.pos, p.ry, 7, 1.4)) p.dealDamage(e, p.stats.dmg * 1.2 * this.mods('s0'), { kb: 2, stun: 0.6 }, true); const ahead = p.pos.clone().add(V(Math.sin(p.ry) * 3, 0, Math.cos(p.ry) * 3)); this.send('quake', { x: ahead.x, z: ahead.z, r: 4 }); }
      }
    }
    if (this.whirlT > 0) {
      this.whirlT -= dt; this.whirlTick -= dt;
      if (this.whirlTick <= 0) {
        this.whirlTick = 0.25;
        for (const e of enemiesInRadius(p.pos, this.has('e_vortex') ? 6 : 3.2)) p.dealDamage(e, p.stats.dmg * 0.55 * this.mods('s1'), { kb: this.has('e_vortex') ? -1.2 : 0.6 }, true);
        this.send('whirl', { x: p.pos.x, z: p.pos.z });
      }
    }
    if (this.flurry) {
      const f = this.flurry; f.t += dt;
      while (f.done < f.n && f.t > f.done * 0.09) {
        f.done++;
        for (const e of enemiesInArc(p.pos, p.ry, 2.7, 1.5)) { p.dealDamage(e, p.stats.dmg * 0.45 * this.mods('s2'), { kb: 0.2 }, true); if (this.has('e_cinderflurry')) for (const t of [0.5, 1.0]) this.pending.push({ t, fn: () => { if (!e.dead) p.dealDamage(e, p.stats.dmg * 0.09, {}, true); } }); }
        G.fx.slash(p.pos.clone().setY(p.pos.y + 1.1), p.ry + (Math.random() - 0.5) * 0.6, '#ffb070', 2.6, f.done % 2, 1.2);
        G.audio.swing(false);
        p.atk.combo = f.done % 2; p.atk.t = 0.45; p.atk.dur = 0.12; p.atk.hit = true; p.atk.face = p.ry;
      }
      if (f.done >= f.n && f.t > f.n * 0.09 + 0.1) this.flurry = null;
    }
    if (this.exec) {
      this.exec.t += dt;
      if (this.exec.t >= 0.33 && !this.exec.done) {
        this.exec.done = true;
        for (const e of enemiesInArc(p.pos, p.ry, 3.1, 1.7)) { const d = p.dealDamage(e, p.stats.dmg * 4 * this.mods('s3') * (e.hp / e.maxHp < 0.35 ? 2 : 1), { kb: 3, stun: 0.8 }); if (this.has('e_reaper') && d >= e.hp) { this.cds[3] = 0; G.ui.toast('Reaper! Execution ready', '#ff3a1a'); } }
        this.send('execute', { x: p.pos.x, z: p.pos.z, ry: p.ry });
        G.hitstop = 0.1; G.shake = Math.max(G.shake, 0.55);
      }
      if (this.exec.t > 0.6) this.exec = null;
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (!this.projectiles[i].update(dt)) this.projectiles.splice(i, 1);
    for (let i = this.spirits.length - 1; i >= 0; i--) if (!this.spirits[i].update(dt, this)) {
      const s = this.spirits[i];
      if (this.has('h_martyr')) { for (const e of enemiesInRadius(s.pos, 3.5)) p.dealDamage(e, p.stats.dmg * 3, { kb: 2 }); this.send('explode', { x: s.pos.x, z: s.pos.z, r: 3.5 }); }
      s.dispose(); this.spirits.splice(i, 1);
    }
  }
  clear() {
    for (const b of this.projectiles) b.dispose();
    for (const s of this.spirits) s.dispose();
    this.projectiles = []; this.spirits = []; this.pending = [];
    this.whirlT = 0; this.flurry = this.bash = this.exec = null;
  }
}

class Bolt {
  constructor(pos, dir, o, onHit) {
    this.pos = pos; this.vel = dir.clone().multiplyScalar(o.speed); this.o = o; this.onHit = onHit; this.life = (o.range || 17) / o.speed;
    const col = o.spirit ? '#ffe08a' : o.big ? '#ff7a2a' : '#ffb35a';
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(o.big ? 0.32 : 0.17, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(3) }));
    this.mesh.position.copy(pos);
    G.fx.root.add(this.mesh);
  }
  update(dt) {
    this.life -= dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    G.fx.emit({ pos: this.pos, count: 2, speed: 0.4, color: this.o.spirit ? '#fff2b0' : '#ffc060', color2: '#ff2a00', size: this.o.big ? 0.5 : 0.28, life: 0.3 });
    const z = G.zone;
    const wall = z.d ? !isFloor(z.d, this.pos.x, this.pos.z) : false;
    let hit = null;
    for (const e of G.enemies.values()) { if (e.dead) continue; if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < e.radius + 0.35) { hit = e; break; } }
    if (hit || wall || this.life <= 0) {
      if (hit || (this.o.aoe && (wall || this.life <= 0))) this.onHit(hit, this.pos.clone());
      else G.fx.emit({ pos: this.pos, count: 8, speed: 2, color: '#ffc060', color2: '#ff2a00', size: 0.25, life: 0.3 });
      this.dispose();
      return false;
    }
    return true;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

export function buildSpiritMesh() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe8a0').multiplyScalar(3) }));
  g.add(core);
  const wm = additive('#ff9a3c', 0.8);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12, 0, Math.PI), wm);
    w.position.x = 0.15 * s; w.rotation.y = s * 0.6; w.scale.set(1, 1.3, 1);
    g.add(w); g.userData['w' + s] = w;
  }
  return g;
}

class Spirit {
  constructor(p, i, dur) {
    this.p = p; this.i = i; this.life = dur; this.cd = 0.5 + i * 0.3; this.t = Math.random() * 5;
    this.mesh = buildSpiritMesh();
    this.pos = p.pos.clone().add(V(0, 2.2, 0));
    this.mesh.position.copy(this.pos);
    G.fx.root.add(this.mesh);
  }
  update(dt, kit) {
    this.life -= dt; this.t += dt;
    const p = this.p, a = this.t * 1.6 + this.i * Math.PI;
    const target = V(p.pos.x + Math.cos(a) * 1.4, p.pos.y + 2.3 + Math.sin(this.t * 3) * 0.2, p.pos.z + Math.sin(a) * 1.4);
    this.pos.lerp(target, 1 - Math.exp(-6 * dt));
    this.mesh.position.copy(this.pos);
    const f = Math.sin(this.t * 20) * 0.6;
    this.mesh.userData['w-1'].rotation.y = -0.6 - f; this.mesh.userData.w1.rotation.y = 0.6 + f;
    if (Math.random() < dt * 20) G.fx.emit({ pos: this.pos, count: 1, speed: 0.3, color: '#ffe8a0', color2: '#ff6a1a', size: 0.25, life: 0.6 });
    this.cd -= dt;
    if (this.cd <= 0) {
      const e = nearestEnemy(this.pos, 14);
      if (e) {
        this.cd = 0.8;
        const dir = V(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
        const o = { speed: 24, mul: 0.5 * (1 + (p.stats.T.s2 || 0)), aoe: 0, spirit: true };
        kit.projectiles.push(new Bolt(this.pos.clone(), dir, o, (h, at) => kit.boltHit(h, at, o)));
      }
    }
    return this.life > 0;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); G.fx.emit({ pos: this.pos, count: 20, speed: 2, color: '#ffe8a0', color2: '#ff6a1a', size: 0.3, life: 0.6 }); }
}
