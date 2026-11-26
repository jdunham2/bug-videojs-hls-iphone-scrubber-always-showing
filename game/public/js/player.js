// Local hero controller (movement, combo combat, skills) and the third-person camera rig.
import * as THREE from 'three';
import { G, clamp, angleLerp, damp } from './state.js';
import { buildHero, animateRig, applyGear } from './models.js';
import { computeStats, gearVisual } from './save.js';
import { RARITIES } from '../shared/items.js';
import { ANIM } from './entities.js';

const angDiff = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
export const SLAM_CD = 6, DASH_CD = 1.0, POT_CD = 1.0;

export class LocalPlayer {
  constructor(save) {
    this.save = save;
    this.rig = buildHero(save.color);
    this.root = this.rig.root;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0; this.onGround = true;
    this.ry = Math.PI; this.t = 0; this.move = 0;
    this.refreshStats(true);
    this.atk = { t: -1, combo: 0, hit: false, queued: false, dur: 0.5, face: 0 };
    this.comboT = 0; this.slamT = -1; this.slamCd = 0; this.dashT = 0; this.dashCd = 0; this.dashDir = new THREE.Vector3();
    this.potCd = 0; this.invuln = 0; this.hurtT = 0; this.lastHurt = 99; this.dead = false; this.deadT = 0; this.deadAnim = 0;
    this.anim = 0;
  }

  refreshStats(full) {
    this.stats = computeStats(this.save);
    applyGear(this.rig, gearVisual(this.save), this.save.color);
    if (full || this.hp === undefined) this.hp = this.stats.maxHp;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  get weaponColor() { const w = this.save.equipped.weapon; return w ? (w.rarity >= 2 ? RARITIES[w.rarity].color : '#ffe9c0') : '#ffe9c0'; }

  teleport(x, z, zone) {
    this.pos.set(x, zone.groundHeight(x, z), z);
    this.vel.set(0, 0, 0); this.vy = 0;
    this.root.position.copy(this.pos);
  }

  aimDir(camYaw) {
    let best = null, bd = 1e9;
    const fwd = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
    for (const e of G.enemies.values()) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > this.stats.range + e.radius + 2.5) continue;
      const a = Math.atan2(dx, dz);
      const diff = angDiff(a, fwd);
      if (diff < 0.9 && d + diff * 3 < bd) { bd = d + diff * 3; best = a; }
    }
    if (best === null) {
      // nothing in front of the camera: lock onto the closest enemy within melee reach (any direction)
      let nd = this.stats.range + 1.5;
      for (const e of G.enemies.values()) {
        if (e.dead) continue;
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz) - e.radius;
        if (d < nd) { nd = d; best = Math.atan2(dx, dz); }
      }
    }
    return best ?? fwd;
  }

  update(dt, input, cam, zone) {
    this.t += dt;
    const S = this.stats;
    this.dashCd -= dt; this.slamCd -= dt; this.potCd -= dt; this.invuln -= dt; this.comboT -= dt; this.lastHurt += dt;
    this.hurtT = Math.max(0, this.hurtT - dt * 4);
    if (this.dead) {
      this.deadT -= dt;
      this.deadAnim = Math.min(1, this.deadAnim + dt);
      this.vel.set(0, 0, 0);
      if (this.deadT <= 0) G.actions.respawn();
      this.finish(dt, zone);
      return;
    }
    const active = G.inGame && !G.uiOpen;
    const yaw = cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = 0, mz = 0;
    if (active) {
      if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    }
    const dir = new THREE.Vector3(rx * mx + fx * mz, 0, rz * mx + fz * mz);
    const moving = dir.lengthSq() > 0;
    if (moving) dir.normalize();

    // actions
    if (active && !G.buildMode) {
      if ((input.mouse(0) || input.down('KeyF')) && this.slamT < 0) {
        if (this.atk.t < 0) this.startAttack(yaw);
        else if (this.atk.t > 0.4) this.atk.queued = true;
      }
      if ((input.hit('KeyQ') || input.click(2)) && this.slamCd <= 0 && this.slamT < 0 && this.onGround) {
        this.slamT = 0; this.slamCd = SLAM_CD; this.vy = 7; this.onGround = false; this.atk.t = -1;
        this.ry = this.aimDir(yaw);
        G.audio.swing(true);
      }
    }
    if (active) {
      if ((input.hit('ShiftLeft') || input.hit('ShiftRight')) && this.dashCd <= 0) {
        this.dashT = 0.2; this.dashCd = DASH_CD; this.invuln = 0.3;
        this.dashDir.copy(moving ? dir : new THREE.Vector3(Math.sin(this.ry), 0, Math.cos(this.ry)));
        this.ry = Math.atan2(this.dashDir.x, this.dashDir.z);
        this.atk.t = -1;
        G.audio.dash();
      }
      if (input.hit('Space') && this.onGround && this.slamT < 0) { this.vy = 9; this.onGround = false; G.audio.jump(); }
      if (input.hit('KeyR')) this.drinkPotion();
    }

    // attack progression
    if (this.atk.t >= 0) {
      this.atk.t += dt / this.atk.dur;
      if (!this.atk.hit && this.atk.t >= 0.45) { this.atk.hit = true; this.doHit(); }
      if (this.atk.t >= 1) {
        this.atk.t = -1; this.comboT = 0.4;
        if (this.atk.queued || (active && input.mouse(0) && !G.buildMode)) { this.atk.queued = false; this.startAttack(yaw); }
      }
    }
    if (this.slamT >= 0) {
      const prev = this.slamT;
      this.slamT += dt / 0.7;
      if (prev < 0.55 && this.slamT >= 0.55) this.doSlam();
      if (this.slamT >= 1) this.slamT = -1;
    }

    // movement
    let speed = 7.2 * S.moveSpeed;
    if (this.atk.t >= 0) speed *= 0.3;
    if (this.slamT >= 0) speed *= 0.15;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.copy(this.dashDir).multiplyScalar(24);
      G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 3, speed: 0.5, color: this.save.color, color2: '#ffffff', size: 0.5, life: 0.35, radius: 0.3 });
    } else {
      this.vel.x = damp(this.vel.x, dir.x * speed, 14, dt);
      this.vel.z = damp(this.vel.z, dir.z * speed, 14, dt);
    }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    zone.collide(this.pos, 0.45);
    if (this.atk.t >= 0) this.ry = angleLerp(this.ry, this.atk.face, Math.min(1, dt * 25));
    else if (moving && this.dashT <= 0 && this.slamT < 0) this.ry = angleLerp(this.ry, Math.atan2(dir.x, dir.z), Math.min(1, dt * 14));
    this.move = damp(this.move, Math.hypot(this.vel.x, this.vel.z) / 7.2, 12, dt);

    // regen
    if (this.lastHurt > 6 && this.hp < S.maxHp) this.hp = Math.min(S.maxHp, this.hp + S.maxHp * 0.03 * dt);
    this.finish(dt, zone);
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
    this.root.rotation.y = this.ry;
    const atk = this.atk.t >= 0 ? this.atk.t : -1;
    animateRig(this.rig, { t: this.t, move: this.move, atk, combo: this.atk.combo, slam: this.slamT, dash: this.dashT > 0, air: !this.onGround && this.slamT < 0, dead: this.dead ? this.deadAnim : 0, hurt: this.hurtT });
    this.anim = this.dead ? ANIM.dead : this.slamT >= 0 ? ANIM.slam : this.dashT > 0 ? ANIM.dash : this.atk.t >= 0 ? ANIM.atk0 + this.atk.combo : !this.onGround ? ANIM.air : this.move > 0.1 ? ANIM.run : ANIM.idle;
  }

  startAttack(yaw) {
    const combo = this.comboT > 0 ? (this.atk.combo + 1) % 3 : 0;
    this.atk.combo = combo;
    this.atk.dur = (combo === 2 ? 0.6 : 0.46) / this.stats.atkSpeed;
    this.atk.t = 0; this.atk.hit = false; this.atk.queued = false;
    this.atk.face = this.aimDir(yaw);
    G.audio.swing(combo === 2);
  }

  doHit() {
    const S = this.stats, c = this.atk.combo;
    const range = S.range + (c === 2 ? 0.5 : 0), arc = S.arc + (c === 2 ? 0.7 : 0) + (S.cleave ? 0.4 : 0);
    const mul = [1, 1.15, 1.7][c];
    let any = false;
    for (const e of G.enemies.values()) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > range + e.radius) continue;
      if (angDiff(Math.atan2(dx, dz), this.ry) > arc / 2 && d > e.radius + 0.6) continue;
      this.dealDamage(e, S.dmg * mul);
      e.target.x += (dx / (d || 1)) * 0.35; e.target.z += (dz / (d || 1)) * 0.35;
      any = true;
    }
    const sp = this.pos.clone(); sp.y += 1.15;
    G.fx.slash(sp, this.ry, this.weaponColor, range + 0.3, c, arc);
    if (any) { G.hitstop = c === 2 ? 0.08 : 0.045; G.shake = Math.max(G.shake, c === 2 ? 0.35 : 0.15); }
  }

  dealDamage(e, base) {
    const S = this.stats;
    const crit = Math.random() < S.crit;
    const dmg = Math.max(1, Math.round(base * (0.9 + Math.random() * 0.2) * (crit ? 2 : 1)));
    G.net.send({ t: 'hit', id: e.id, dmg, crit });
    e.hit(crit);
    const hp = e.pos.clone(); hp.y += e.height * 0.6;
    G.fx.hitSpark(hp, crit);
    G.fx.text(hp, crit ? `${dmg}!` : `${dmg}`, crit ? 'crit' : '');
    G.audio.hit(crit);
    if (S.leech > 0) this.hp = Math.min(S.maxHp, this.hp + dmg * S.leech);
  }

  doSlam() {
    const R = 4.8;
    let any = false;
    for (const e of G.enemies.values()) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < R + e.radius) { this.dealDamage(e, this.stats.dmg * 2.3); any = true; }
    }
    const p = this.pos.clone();
    G.fx.shockwave(p, R, '#ffb347', 0.45);
    G.fx.shockwave(p, R * 0.6, '#ffffff', 0.3);
    G.fx.emit({ pos: p.clone().setY(p.y + 0.2), count: 70, speed: 9, color: '#ffd080', color2: '#ff3a00', size: 0.4, life: 0.7, flat: true, drag: 3 });
    G.fx.emit({ pos: p.clone().setY(p.y + 0.2), count: 30, speed: 4, color: '#9a8a70', color2: '#3a3020', size: 0.6, life: 1, up: 1, gravity: 6 });
    G.shake = Math.max(G.shake, 0.6); G.hitstop = any ? 0.09 : 0.03;
    G.audio.slam();
  }

  drinkPotion() {
    if (this.save.potions <= 0 || this.potCd > 0 || this.hp >= this.stats.maxHp) return;
    this.potCd = POT_CD; this.save.potions--;
    const heal = Math.round(this.stats.maxHp * 0.5);
    this.hp = Math.min(this.stats.maxHp, this.hp + heal);
    G.fx.text(this.pos.clone().setY(this.pos.y + 2.2), `+${heal}`, 'heal');
    G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 0.3), count: 40, speed: 1.5, color: '#8affb0', color2: '#20a050', size: 0.3, life: 1.2, up: 1.5, radius: 0.6 });
    G.audio.potion();
    G.actions.saveNow();
  }

  hurt(dmg) {
    if (this.dead || this.invuln > 0) return;
    const final = Math.max(1, Math.round(dmg * 100 / (100 + this.stats.armor)));
    this.hp -= final; this.hurtT = 1; this.lastHurt = 0;
    G.fx.text(this.pos.clone().setY(this.pos.y + 2.2), `-${final}`, 'hurt');
    G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1.2), count: 12, speed: 4, color: '#ff4a3a', color2: '#400000', size: 0.25, life: 0.5, gravity: 10 });
    G.shake = Math.max(G.shake, 0.25);
    G.ui.hurtFlash();
    G.audio.hurt();
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.deadT = 6; this.deadAnim = 0; this.atk.t = -1; this.slamT = -1;
      G.ui.showDeath(true);
    }
  }
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = 0.42; this.dist = 10;
    this.target = new THREE.Vector3();
    this.cur = new THREE.Vector3();
  }
  snap(player) { this.target.copy(player.pos).add(new THREE.Vector3(0, 1.7, 0)); }
  update(dt, input, player, zone) {
    if (input.locked && !G.uiOpen) {
      this.yaw -= input.dx * 0.0024;
      this.pitch = clamp(this.pitch + input.dy * 0.002, -0.15, 1.3);
    }
    if (!G.uiOpen) this.dist = clamp(this.dist + input.wheel * 1.0, 4, 18);
    const desired = player.pos.clone(); desired.y += 1.7;
    this.target.lerp(desired, 1 - Math.exp(-14 * dt));
    const cp = Math.cos(this.pitch);
    let cam = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.dist).add(this.target);
    if (zone.cameraClamp) cam = zone.cameraClamp(this.target, cam);
    const gh = zone.groundHeight(cam.x, cam.z) + 0.6;
    if (cam.y < gh) cam.y = gh;
    G.shake = Math.max(0, G.shake - dt * 1.8);
    const s = G.shake * G.shake * 0.6;
    cam.x += (Math.random() - 0.5) * s; cam.y += (Math.random() - 0.5) * s; cam.z += (Math.random() - 0.5) * s;
    this.camera.position.copy(cam);
    this.camera.lookAt(this.target);
  }
}
