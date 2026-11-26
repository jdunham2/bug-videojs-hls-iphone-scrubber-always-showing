// Local hero controller (movement, dodge roll, combat, class skills, style) and the third-person camera.
import * as THREE from 'three';
import { G, clamp, angleLerp, damp } from './state.js';
import { buildHero, animateRig, applyGear, buildSteed, animateSteed } from './models.js';
import { computeStats } from '../shared/stats.js';
import { CLASSES } from '../shared/classes.js';
import { RARITIES } from '../shared/items.js';
import { tileAt } from '../shared/dungeon.js';
import { recoil, rumble, decals } from './feel.js';
import { levelMul } from '../shared/enemies.js';
import { SkillKit, enemiesInArc, enemiesInRadius, fxPlay } from './skills.js';

const angDiff = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
export const ROLL_CD = 0.9, POT_CD = 1.0;
export const ANIM = { idle: 0, run: 1, atk0: 2, atk1: 3, atk2: 4, slam: 5, roll: 6, dead: 7, air: 8, whirl: 9, cast: 10, block: 11, bash: 12, sprint: 13 };
export const STYLE_RANKS = [
  { r: 'D', min: 0, name: 'Dull', color: '#9a9a9a' }, { r: 'C', min: 20, name: 'Cool', color: '#5eea8a' }, { r: 'B', min: 45, name: 'Brutal', color: '#5ab0ff' },
  { r: 'A', min: 80, name: 'Awesome', color: '#c77dff' }, { r: 'S', min: 130, name: 'Savage!', color: '#ffb347' },
];

export function gearOf(char) {
  const e = char.equipped;
  const L = char.look || {};
  return { w: e.weapon?.type || 'sword', wr: e.weapon?.rarity ?? 0, h: e.helm ? e.helm.rarity : -1, c: e.chest ? e.chest.rarity : -1, b: e.boots ? e.boots.rarity : -1, d: L.dye || null, hh: L.hideHelm ? 1 : 0, ap: L.ap ?? -1 };
}

export class LocalPlayer {
  constructor(prof) {
    this.cls = prof.cls; this.prof = prof; this.char = prof.char;
    this.rig = buildHero(prof.color, this.cls);
    this.root = this.rig.root;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.vy = 0; this.onGround = true; this.ry = Math.PI; this.t = 0; this.move = 0;
    this.atk = { t: -1, combo: 0, hit: false, queued: false, dur: 0.5, face: 0 };
    this.comboT = 0; this.slamT = -1; this.rollCd = 0; this.roll = 0; this.rollT = 0; this.rollDir = new THREE.Vector3();
    this.potCd = 0; this.invuln = 0; this.hurtT = 0; this.lastHurt = 99; this.dead = false; this.deadT = 0; this.deadAnim = 0;
    this.combatT = 99; this.castT = 0; this.blocking = false; this.blockT = 0; this.tauntBuffT = 0;
    this.slowT = 0; this.burnT = 0; this.furyT = 0; this.tailT = 0; this.phoenixCd = 0; this.thunderN = 0; this.burnDps = 0; this.unbreakCd = 0; this.dotAcc = 0; this.trapCd = 0; this.lavaAcc = 0;
    this.style = 0; this.styleIdle = 0; this.styleKeys = []; this.comboCount = 0; this.comboTimer = 0; this.lastRank = 0;
    this.emote = null; this.emoteT = 0; this.emoteDur = 0;
    this.mounted = false; this.mountT = 0; this.steed = buildSteed(prof.color); this.steed.visible = false; this.root.add(this.steed);
    this.anim = 0;
    this.kit = new SkillKit(this);
    this.setProfile(prof, true);
    this.resource = CLASSES[this.cls].resource.start;
  }

  setProfile(prof, full) {
    this.prof = prof; this.char = prof.char;
    this.stats = computeStats(this.char, this.cls, prof.buffs || {});
    applyGear(this.rig, gearOf(this.char), prof.color);
    if (full || this.hp === undefined) this.hp = this.stats.maxHp;
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.resource = Math.min(this.resource ?? 0, this.stats.resMax);
  }
  get R() { return CLASSES[this.cls].resource; }
  get weaponColor() { const w = this.char.equipped.weapon; return w && w.rarity >= 2 ? RARITIES[w.rarity].color : this.cls === 'emberblade' ? '#ffb070' : '#ffe9c0'; }
  get rank() { let r = 0; STYLE_RANKS.forEach((s, i) => { if (this.style >= s.min) r = i; }); return r; }

  teleport(x, z, zone) {
    this.pos.set(x, zone.groundHeight(x, z), z);
    this.vel.set(0, 0, 0); this.vy = 0;
    this.root.position.copy(this.pos);
  }
  heal(n) {
    n = Math.round(n);
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    if (n >= 5) G.fx.text(this.pos.clone().setY(this.pos.y + 2.2), `+${n}`, 'heal');
  }

  aimTarget(camYaw, maxR) {
    let best = null, bd = 1e9;
    const fwd = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
    for (const e of G.enemies.values()) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > maxR) continue;
      const diff = angDiff(Math.atan2(dx, dz), fwd);
      if (diff < 0.9 && d + diff * 4 < bd) { bd = d + diff * 4; best = e; }
    }
    return best;
  }
  aimDir(camYaw) {
    if (G.lock && !G.lock.dead) return Math.atan2(G.lock.pos.x - this.pos.x, G.lock.pos.z - this.pos.z);
    const reach = this.stats.ranged ? 16 : this.stats.range + 2.5;
    const t = this.aimTarget(camYaw, reach);
    if (t) return Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    if (!this.stats.ranged) {
      let nd = this.stats.range + 1.5, best = null;
      for (const e of G.enemies.values()) { if (e.dead) continue; const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - e.radius; if (d < nd) { nd = d; best = e; } }
      if (best) return Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z);
    }
    return Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
  }

  addStyle(n, key) {
    const reps = this.styleKeys.filter((k) => k === key).length;
    this.style = Math.min(180, this.style + n * (reps >= 3 ? 0.35 : reps >= 2 ? 0.7 : 1));
    this.styleKeys.push(key); if (this.styleKeys.length > 5) this.styleKeys.shift();
    this.styleIdle = 0;
    const r = this.rank;
    if (r > this.lastRank) { G.audio.style(r); G.ui.styleUp(r); }
    this.lastRank = r;
  }

  update(dt, input, cam, zone) {
    this.t += dt;
    const S = this.stats, R = this.R;
    this.rollCd -= dt; this.slamT >= 0 || (this.slamT = -1); this.potCd -= dt; this.invuln -= dt; this.comboT -= dt; this.lastHurt += dt; this.combatT += dt;
    this.castT = Math.max(0, this.castT - dt); this.tauntBuffT -= dt; this.furyT -= dt; this.tailT -= dt; this.phoenixCd -= dt; this.slowT -= dt; this.burnT -= dt; this.unbreakCd -= dt; this.trapCd -= dt;
    this.hurtT = Math.max(0, this.hurtT - dt * 4);
    // style decay
    this.styleIdle += dt; this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.comboCount = 0;
    if (this.styleIdle > 2.5) this.style = Math.max(0, this.style - dt * 9);
    this.lastRank = Math.min(this.lastRank, this.rank);
    // resource
    if (R.regen > 0) this.resource = Math.min(S.resMax, this.resource + S.resRegen * dt);
    else if (this.combatT > 4) this.resource = Math.max(0, this.resource + R.regen * dt);
    if (this.dead) {
      this.deadT -= dt; this.deadAnim = Math.min(1, this.deadAnim + dt); this.vel.set(0, 0, 0);
      if (this.deadT <= 0) G.actions.respawn();
      this.finish(dt, zone);
      return;
    }
    const active = G.inGame && !G.uiOpen && !G.cinematic && !G.emoteWheel;
    const yaw = cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const ax = active ? input.moveAxes() : { x: 0, y: 0 };
    const dir = new THREE.Vector3(rx * ax.x + fx * ax.y, 0, rz * ax.x + fz * ax.y);
    const moving = dir.lengthSq() > 0.01;
    if (moving && dir.lengthSq() > 1) dir.normalize();
    if (moving && this.emote) this.emote = null;
    const kit = this.kit;
    // ---- actions ----
    const cls = this.cls;
    this.blocking = active && cls === 'warden' && input.act('skill3') && this.onGround && !this.roll && this.slamT < 0 && !kit.busy() && !G.buildMode;
    this.blockT = this.blocking ? this.blockT + dt : 0;
    if (active && !G.buildMode && !this.roll) {
      if (input.attackHeld() && this.slamT < 0 && !this.blocking && !kit.busy()) {
        if (this.stats.ranged) { if (this.atk.t < 0) this.startAttack(yaw); }
        else if (this.atk.t < 0) this.startAttack(yaw);
        else if (this.atk.t > 0.4) this.atk.queued = true;
      }
      for (let i = 0; i < 4; i++) if (input.actHit('skill' + (i + 1)) || (i === 0 && input.click(2) && !input.lockFailed)) { if (kit.tryCast(i, yaw)) { this.atk.t = -1; } }
    }
    if (active && input.actHit('dodge') && this.rollCd <= 0 && !this.roll && this.slamT < 0) this.startRoll(moving ? dir : null);
    if (active && input.actHit('jump') && this.onGround && this.slamT < 0 && !this.roll) { this.vy = 9; this.onGround = false; G.audio.jump(); }
    if (active && input.actHit('potion') && !G.buildMode) this.drinkPotion();
    if (active && input.actHit('mount')) {
      if (this.mounted) this.dismount();
      else if (zone.type === 'dungeon') G.ui.toast('You cannot ride in the depths.', '#ff9a7a');
      else if (this.combatT < 2) G.ui.toast('You cannot mount while in combat.', '#ff9a7a');
      else if (this.mountT <= 0) { this.mountT = 1; this.castT = 1; G.audio.summon(); }
    }
    if (this.mountT > 0) { this.mountT -= dt; if (moving || this.combatT < 0.1) { this.mountT = 0; this.castT = 0; } else if (this.mountT <= 0) { this.mounted = true; this.steed.visible = true; G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 60, speed: 3, color: '#ffc060', color2: '#ff3a00', size: 0.35, life: 0.8 }); G.audio.portal(); } }
    if (this.mounted && (this.atk.t >= 0 || this.roll || kit.busy() || this.slamT >= 0 || this.blocking || zone.type === 'dungeon')) this.dismount();
    kit.update(dt, yaw);

    // ---- attack progression ----
    if (this.atk.t >= 0) {
      this.atk.t += dt / this.atk.dur;
      if (!this.atk.hit && this.atk.t >= 0.45) { this.atk.hit = true; this.doHit(yaw); }
      if (this.atk.t >= 1) {
        this.atk.t = -1; this.comboT = 0.4;
        if (this.atk.queued || (active && input.attackHeld() && !G.buildMode && !kit.busy() && !this.blocking)) { this.atk.queued = false; this.startAttack(yaw); }
      }
    }
    if (this.slamT >= 0) {
      const prev = this.slamT;
      this.slamT += dt / 0.7;
      if (prev < 0.55 && this.slamT >= 0.55) kit.quakeImpact();
      if (this.slamT >= 1) this.slamT = -1;
    }

    // ---- movement ----
    let speed = 7.2 * S.moveSpeed;
    if (this.atk.t >= 0 && !this.stats.ranged) speed *= 0.3;
    if (this.castT > 0) speed *= 0.55;
    if (this.blocking) speed *= 0.4;
    if (this.slamT >= 0 || kit.exec) speed *= 0.15;
    if (kit.whirlT > 0) speed *= 0.9;
    if (this.slowT > 0) speed *= 0.5;
    if (this.tailT > 0) speed *= 1.35;
    if (this.mounted) speed *= 1.8;
    // out-of-combat sprint ramps in after a moment of uninterrupted running
    const canSprint = moving && !this.mounted && this.onGround && this.combatT > 3 && this.atk.t < 0 && this.castT <= 0 && !this.blocking && !this.roll;
    this.sprintT = canSprint ? (this.sprintT || 0) + dt : 0;
    this.sprinting = this.sprintT > 0.6;
    if (this.sprinting) speed *= 1 + 0.3 * Math.min(1, (this.sprintT - 0.6) * 2);
    const tile = zone.d ? tileAt(zone.d, this.pos.x, this.pos.z) : 0;
    const accel = tile === 4 ? 1.6 : 14;
    if (this.roll) {
      this.rollT += dt;
      const k = this.rollT / 0.5;
      this.roll = Math.min(1, k) || 0.0001;
      const sp = 16 * (1 - k * 0.7);
      this.vel.copy(this.rollDir).multiplyScalar(sp);
      if (k >= 1) { this.roll = 0; this.vel.multiplyScalar(0.45); }
    } else if (!kit.bash) {
      this.vel.x = damp(this.vel.x, dir.x * speed, accel, dt);
      this.vel.z = damp(this.vel.z, dir.z * speed, accel, dt);
    }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    zone.collide(this.pos, 0.45);
    if (this.atk.t >= 0) this.ry = angleLerp(this.ry, this.atk.face, Math.min(1, dt * 25));
    else if (G.lock && !G.lock.dead && !this.roll && (moving || this.blocking)) this.ry = angleLerp(this.ry, Math.atan2(G.lock.pos.x - this.pos.x, G.lock.pos.z - this.pos.z), Math.min(1, dt * 12));
    else if (moving && !this.roll && this.slamT < 0 && !kit.bash && this.castT <= 0) this.ry = angleLerp(this.ry, Math.atan2(dir.x, dir.z), Math.min(1, dt * 14));
    this.move = damp(this.move, Math.hypot(this.vel.x, this.vel.z) / 7.2, 12, dt);

    this.environment(dt, zone, tile);
    if (this.lastHurt > 6 && this.hp < S.maxHp) this.hp = Math.min(S.maxHp, this.hp + S.maxHp * 0.03 * dt);
    if (this.emote) { this.emoteT += dt; if (this.emoteDur && this.emoteT > this.emoteDur) this.emote = null; }
    this.finish(dt, zone);
  }

  // hazards, lava, traps
  environment(dt, zone, tile) {
    const lv = levelMul(G.roomLevel).dmg;
    if (this.burnT > 0) { this.dotAcc += this.burnDps * dt; if (Math.random() < dt * 10) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 1, speed: 1, color: '#ffb060', color2: '#ff2000', size: 0.3, life: 0.5, up: 1 }); }
    if (zone.d) {
      if (tile === 3 && this.onGround) { this.dotAcc += 16 * lv * dt; if (Math.random() < dt * 12) G.fx.emit({ pos: this.pos.clone(), count: 1, speed: 1.5, color: '#ffc060', color2: '#ff2000', size: 0.4, life: 0.5, up: 1.5 }); }
      if (this.trapCd <= 0 && this.onGround && zone.trapAt?.(this.pos.x, this.pos.z)) { this.trapCd = 1; this.hurt(10 * lv, null, { trap: true }); }
    }
    for (const h of G.hazards.values()) {
      if (h.delay > 0 || Math.hypot(h.x - this.pos.x, h.z - this.pos.z) > h.r) continue;
      if (h.kind === 'web') this.slowT = Math.max(this.slowT, 0.35);
      else this.dotAcc += h.dps * dt;
    }
    if (this.dotAcc >= 4) { const n = Math.floor(this.dotAcc); this.dotAcc -= n; this.hurt(n, null, { dot: true }); }
  }

  finish(dt, zone) {
    this.vy -= 26 * dt;
    this.pos.y += this.vy * dt;
    const gh = zone.groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) {
      if (!this.onGround && this.vy < -12) G.fx.emit({ pos: this.pos.clone(), count: 8, speed: 2, color: '#a89878', color2: '#5a4a3a', size: 0.3, life: 0.5, flat: true });
      this.pos.y = gh; this.vy = 0; this.onGround = true;
    } else if (this.pos.y > gh + 0.3) this.onGround = false;
    this.root.position.copy(this.pos);
    const kit = this.kit;
    const spin = kit.whirlT > 0 ? (this.t * 22) % (Math.PI * 2) : 0;
    this.root.rotation.y = this.ry + spin;
    const atk = this.atk.t >= 0 ? this.atk.t : -1;
    animateRig(this.rig, {
      t: this.t, move: this.move, atk, combo: this.atk.combo, slam: this.slamT, dash: !!kit.bash, air: !this.onGround && this.slamT < 0, dead: this.dead ? this.deadAnim : 0, hurt: this.hurtT,
      roll: this.roll, block: this.blocking, channel: kit.whirlT > 0, sprint: this.sprinting, mount: this.mounted, cast: this.castT > 0 ? Math.min(1, this.castT * 4) : 0, emote: this.emote, emoteT: this.emoteT,
    });
    if (this.mounted) {
      animateSteed(this.steed, this.t, this.move); this.steed.rotation.y = 0;
      this.rig.body.position.y += 0.85 + this.steed.position.y;
      const P = this.rig.P; if (P.legL) { P.legL.rotation.x = P.legR.rotation.x = -1.3; P.shinL.rotation.x = P.shinR.rotation.x = 1.4; P.legL.rotation.z = -0.35; P.legR.rotation.z = 0.35; }
    } else if (this.rig.P.legL) { this.rig.P.legL.rotation.z = this.rig.P.legR.rotation.z = 0; }
    this.anim = this.dead ? ANIM.dead : this.roll ? ANIM.roll : this.slamT >= 0 ? ANIM.slam : kit.bash ? ANIM.bash : kit.whirlT > 0 ? ANIM.whirl : this.blocking ? ANIM.block : this.castT > 0 ? ANIM.cast : this.atk.t >= 0 ? ANIM.atk0 + this.atk.combo : !this.onGround ? ANIM.air : this.sprinting ? ANIM.sprint : this.move > 0.1 ? ANIM.run : ANIM.idle;
  }

  dismount() { if (!this.mounted) return; this.mounted = false; this.steed.visible = false; G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 30, speed: 2, color: '#ffc060', color2: '#ff3a00', size: 0.3, life: 0.6 }); }

  startRoll(dir) {
    this.roll = 0.0001; this.rollT = 0; this.rollCd = ROLL_CD; this.atk.t = -1; this.castT = 0;
    this.rollDir.copy(dir ? dir.clone().normalize() : new THREE.Vector3(Math.sin(this.ry), 0, Math.cos(this.ry)));
    this.ry = Math.atan2(this.rollDir.x, this.rollDir.z);
    this.invuln = Math.max(this.invuln, 0.38);
    if (this.stats.flags.g_tailwind) this.tailT = 2.5;
    if (this.stats.flags.afterimage) {
      const at = this.pos.clone();
      setTimeout(() => {
        if (!G.zone) return;
        for (const e of enemiesInRadius(at, 3)) this.dealDamage(e, this.stats.dmg * 1.2, { kb: 1.5 });
        this.kit.send('afterimage', { x: at.x, z: at.z });
      }, 250);
    }
    G.audio.dash();
  }

  startAttack(yaw) {
    if (this.stats.ranged) {
      this.atk.combo = 0; this.atk.dur = 0.42 / this.stats.atkSpeed; this.atk.t = 0.3; this.atk.hit = false; this.atk.face = this.aimDir(yaw);
      this.castT = 0.25;
      return;
    }
    const combo = this.comboT > 0 ? (this.atk.combo + 1) % 3 : 0;
    this.atk.combo = combo;
    this.atk.dur = (combo === 2 ? 0.6 : 0.46) / this.stats.atkSpeed;
    this.atk.t = 0; this.atk.hit = false; this.atk.queued = false;
    this.atk.face = this.aimDir(yaw);
    G.audio.swing(combo === 2);
  }

  doHit(yaw) {
    if (this.stats.ranged) { this.ry = this.atk.face; if (this.cls === 'ranger') this.kit.basicArrow(yaw); else this.kit.basicBolt(yaw); return; }
    const S = this.stats, c = this.atk.combo;
    const range = S.range + (c === 2 ? 0.5 : 0), arc = S.arc + (c === 2 ? 0.7 : 0) + (S.cleave ? 0.4 : 0);
    const mul = [1, 1.15, 1.7][c];
    const hit = enemiesInArc(this.pos, this.ry, range, arc);
    for (const e of hit) this.dealDamage(e, S.dmg * mul, { kb: c === 2 ? 1.6 : 0.5, stun: c === 2 ? 0.3 : 0 });
    const sp = this.pos.clone(); sp.y += 1.15;
    G.fx.slash(sp, this.ry, this.weaponColor, range + 0.3, c, arc);
    if (hit.length) { G.hitstop = c === 2 ? 0.08 : 0.045; G.shake = Math.max(G.shake, c === 2 ? 0.35 : 0.15); if (c === 2) { recoil.kick(-0.025); rumble(0.45, 0.2, 90); } else rumble(0.15, 0.25, 50); }
  }

  dealDamage(e, base, o = {}, quiet = false) {
    const S = this.stats;
    const crit = o.crit || Math.random() < S.crit;
    const dmg = Math.max(1, Math.round(base * (0.9 + Math.random() * 0.2) * (crit ? S.critDmg : 1) * (1 + 0.04 * this.rank) * (this.furyT > 0 ? 1.3 : 1)));
    G.net.send({ t: 'hit', id: e.id, dmg, crit, kb: o.kb || 0, stun: o.stun || 0 });
    e.hitByMe = G.time;
    if (crit && S.flags.g_bloodcrit) this.hp = Math.min(S.maxHp, this.hp + S.maxHp * 0.015);
    if (S.flags.g_thunder && !o.thunder && ++this.thunderN % 10 === 0) { fxPlay('chain', { x: e.pos.x, z: e.pos.z, pts: [[e.pos.x + 2, e.pos.z - 2], [e.pos.x, e.pos.z]] }); setTimeout(() => !e.dead && this.dealDamage(e, S.dmg * 2.5, { thunder: true, stun: 0.4 }), 80); }
    e.hit(crit);
    if (o.kb && e.def.poise > 0) { const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1; e.target.x += (dx / l) * o.kb * 0.5; e.target.z += (dz / l) * o.kb * 0.5; }
    const hp = e.pos.clone(); hp.y += e.height * 0.6;
    if (!quiet || Math.random() < 0.5) G.fx.hitSpark(hp, crit);
    G.fx.text(hp, crit ? `${dmg}!` : `${dmg}`, crit ? 'crit' : '');
    if (!quiet) G.audio.hit(crit);
    if (S.leech > 0) this.hp = Math.min(S.maxHp, this.hp + dmg * S.leech);
    if (this.R.onHit) this.resource = Math.min(S.resMax, this.resource + this.R.onHit);
    this.combatT = 0;
    this.comboCount++; this.comboTimer = 2.5;
    this.addStyle(crit ? 3 : 2, 'hit');
    return dmg;
  }

  drinkPotion() {
    if (this.char.potions <= 0 || this.potCd > 0 || this.hp >= this.stats.maxHp) return;
    this.potCd = POT_CD; this.char.potions--;
    G.net.send({ t: 'potion' });
    this.heal(this.stats.maxHp * 0.5);
    G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 0.3), count: 40, speed: 1.5, color: '#8affb0', color2: '#20a050', size: 0.3, life: 1.2, up: 1.5, radius: 0.6 });
    G.audio.potion();
  }

  perfectDodge() {
    G.slowmo = 1.1; rumble(0.2, 0.9, 160);
    this.resource = Math.min(this.stats.resMax, this.resource + this.stats.resMax * 0.4);
    this.addStyle(25, 'perfect');
    G.audio.perfect();
    G.ui.perfect();
    G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 60, speed: 4, color: '#bfe8ff', color2: '#4a8cff', size: 0.35, life: 0.8 });
    if (this.stats.flags.dodgeHeal) this.heal(this.stats.maxHp * 0.25);
    if (this.stats.flags.dance) { this.kit.resetCooldowns(); G.ui.toast('Ember Dance! Cooldowns reset', '#ffb347'); }
  }

  hurt(dmg, from, o = {}) {
    if (this.dead) return;
    if (!o.dot && !o.trap && this.roll && this.rollT < 0.32) { this.perfectDodge(); return; }
    if (this.invuln > 0 && !o.dot) return;
    const src = from != null ? G.enemies.get(from) : null;
    if (this.blocking && src && !o.dot) {
      const a = Math.atan2(src.pos.x - this.pos.x, src.pos.z - this.pos.z);
      if (angDiff(a, this.ry) < 1.3) {
        if (this.blockT < 0.3) {
          G.net.send({ t: 'hit', id: src.id, dmg: Math.round(this.stats.dmg * 0.5), crit: false, kb: 1.5, stun: 1.6 });
          this.resource = Math.min(this.stats.resMax, this.resource + 15);
          G.audio.block(true); G.ui.perfect('PERFECT BLOCK');
          this.addStyle(20, 'pblock');
          G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1.3).add(new THREE.Vector3(Math.sin(this.ry), 0, Math.cos(this.ry))), count: 40, speed: 6, color: '#ffffff', color2: '#5ab0ff', size: 0.3, life: 0.4 });
          if (this.stats.flags.aegis) { for (const e of enemiesInRadius(this.pos, 4)) this.dealDamage(e, this.stats.dmg * 1.5, { kb: 2.5, stun: 0.6 }, true); fxPlay('quake', { x: this.pos.x, z: this.pos.z, r: 4 }); }
          return;
        }
        if (this.stats.flags.w_reflect) G.net.send({ t: 'hit', id: src.id, dmg: Math.round(dmg * 0.5), crit: false, kb: 0.5, stun: 0 });
        dmg *= Math.max(0.05, 0.25 - (this.stats.T.block || 0));
        G.audio.block(false);
        this.resource = Math.min(this.stats.resMax, this.resource + 6);
      }
    }
    const armor = this.stats.armor * (this.tauntBuffT > 0 ? 1.4 : 1);
    const final = Math.max(1, Math.round(o.dot ? dmg : dmg * 100 / (100 + armor)));
    this.hp -= final; this.lastHurt = 0; this.combatT = 0;
    if (!o.dot) this.dismount();
    if (!o.dot) {
      this.hurtT = 1;
      this.style *= 0.6; this.lastRank = Math.min(this.lastRank, this.rank);
      if (this.R.onHurt) this.resource = Math.min(this.stats.resMax, this.resource + this.R.onHurt);
      G.shake = Math.max(G.shake, 0.25); G.ui.hurtFlash(); G.audio.hurt();
      const heavy = final > this.stats.maxHp * 0.12 || o.kb; recoil.kick(heavy ? 0.06 : 0.02, (Math.random() - 0.5) * (heavy ? 0.06 : 0.02)); rumble(heavy ? 0.8 : 0.35, heavy ? 0.5 : 0.25, heavy ? 260 : 110);
      if (heavy && Math.random() < 0.5) decals.add('splat', this.pos.x, this.pos.z, 0.9, '#5a0a0a', 12);
      G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1.2), count: 12, speed: 4, color: '#ff4a3a', color2: '#400000', size: 0.25, life: 0.5, gravity: 10 });
      if (o.affix === 'frozen') { this.slowT = 2; G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 20, speed: 2, color: '#dffaff', color2: '#3ab0ff', size: 0.3, life: 0.8 }); }
      if (o.affix === 'molten') { this.burnT = 3; this.burnDps = Math.max(3, dmg * 0.25); }
      if (o.affix === 'venom') this.slowT = 1.5;
      if (o.kb && src) { const dx = this.pos.x - src.pos.x, dz = this.pos.z - src.pos.z, l = Math.hypot(dx, dz) || 1; this.vel.x += (dx / l) * 9; this.vel.z += (dz / l) * 9; }
    }
    G.fx.text(this.pos.clone().setY(this.pos.y + 2.2), `-${final}`, 'hurt', o.dot ? 0.6 : 1);
    if (this.hp <= 0 && this.stats.flags.g_phoenix && this.phoenixCd <= 0) { this.hp = this.stats.maxHp * 0.4; this.phoenixCd = 120; this.invuln = 2; G.ui.toast('Phoenix Heart! You rise from the ashes', '#ff9a3c'); fxPlay('explode', { x: this.pos.x, z: this.pos.z, r: 4 }); return; }
    if (this.hp <= 0 && this.stats.flags.unbreakable && this.unbreakCd <= 0) { this.hp = 1; this.unbreakCd = 90; this.invuln = 1.5; G.ui.toast('Unbreakable!', '#ffd34d'); G.audio.block(true); return; }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.deadT = 6; this.deadAnim = 0; this.atk.t = -1; this.slamT = -1; this.roll = 0; this.style = 0;
      this.kit.whirlT = 0; G.lock = null;
      G.ui.showDeath(true);
    }
  }
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = 0.42; this.dist = 10;
    this.target = new THREE.Vector3();
  }
  snap(player) { this.target.copy(player.pos).add(new THREE.Vector3(0, 1.7, 0)); }
  update(dt, input, player, zone) {
    if (!G.uiOpen && !G.emoteWheel) {
      this.yaw -= input.dx * 0.0024;
      this.pitch = clamp(this.pitch + input.dy * 0.002, -0.15, 1.3);
    }
    if (G.lock && !G.lock.dead) {
      const dx = G.lock.pos.x - player.pos.x, dz = G.lock.pos.z - player.pos.z;
      if (Math.hypot(dx, dz) > 1.5) this.yaw = angleLerp(this.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 5));
    }
    if (!G.uiOpen) this.dist = clamp(this.dist + input.wheel * 1.0, 4, 18);
    const desired = player.pos.clone(); desired.y += 1.7;
    this.target.lerp(desired, 1 - Math.exp(-14 * dt));
    const cp = Math.cos(this.pitch);
    let cam = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.dist).add(this.target);
    if (zone.cameraClamp) cam = zone.cameraClamp(this.target, cam);
    const gh = zone.groundHeight(cam.x, cam.z) + 0.6;
    if (cam.y < gh) cam.y = gh;
    recoil.update(dt);
    G.shake = Math.max(0, G.shake - dt * 1.8);
    const s = G.shake * G.shake * 0.6;
    cam.x += (Math.random() - 0.5) * s; cam.y += (Math.random() - 0.5) * s; cam.z += (Math.random() - 0.5) * s;
    this.camera.position.copy(cam);
    this.camera.lookAt(this.target);
    if (recoil.pitch || recoil.yaw) { this.camera.rotateX(recoil.pitch); this.camera.rotateY(recoil.yaw); }
  }
}
