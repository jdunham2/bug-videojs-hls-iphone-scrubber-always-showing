// Bandit Archer: a ranged enemy that keeps its distance, telegraphs an aim
// line, and fires arrows the player has to sidestep or roll through.

import * as THREE from 'three';
import { config } from './config.js';
import { resolveCircle } from './world.js';
import { Grunt } from './enemy.js';
import { makeArrowMesh } from './arrows.js';
import { PLAYER_RADIUS, ARROW_HEIGHT } from './player.js';
import { arrowBlocked } from './world.js';
import { updateElite } from './elites.js';

const tmp = new THREE.Vector3();
const aimGeo = new THREE.PlaneGeometry(0.12, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);

export class Archer extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    const s = config.archer;
    const w = config.waves;
    this.kind = 'archer';
    this.maxHp = this.hp = s.baseHp * (1 + w.hpGrowth * (level - 1));
    this.speed = s.speed * (1 + w.speedGrowth * 0.5 * (level - 1));
    this.radius = 0.5;
    this.group.scale.setScalar(1);
    this.cool = 0.8 + Math.random();
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.aimDir = new THREE.Vector3(0, 0, 1);
    // Aim telegraph: a thin line on the floor that brightens as the shot nears.
    this.aimMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.6, 2.2, 2.6),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.aimLine = new THREE.Mesh(aimGeo, this.aimMat);
    this.aimLine.renderOrder = 2;
    this.aimLine.visible = false;
    game.scene.add(this.aimLine);
    if (!this.model) {
      // Placeholder look: brown leather instead of red skin.
      this.bodyMat.color.set(0x7a5a3a);
    }
  }

  get modelId() {
    return 'bandit';
  }
  /** Archery clips stand side-on, so the model turns while aiming. */
  get aimYawDeg() {
    return config.models.heroAimYaw;
  }
  get modelHeight() {
    return 1.9;
  }
  get propId() {
    return 'bow';
  }
  get propRightHand() {
    return false;
  }
  get propLength() {
    return 1.1;
  }

  enter(state) {
    this.lastState = this.state;
    this.state = state;
    this.t = 0;
    if (state === 'aim') this.game.sfx.sample('whoosh', { vol: 0.15, rate: 0.6, pan: this.game.panAt(this.pos) });
    if (state !== 'aim') this.aimLine.visible = false;
    if (state === 'chase') this.staggered = false;
  }

  update(realDt, player) {
    const s = config.archer;
    this.flash = Math.max(0, this.flash - realDt);
    this.hitT = Math.max(0, this.hitT - realDt);
    if (this.state === 'dying') {
      this.t += realDt;
      this.aimLine.visible = false;
      this.updateDying(realDt);
      this.updateModel(realDt);
      return;
    }
    if (this.updateStatus(realDt)) return;
    const dt = realDt * this.timeScale;
    this.t += dt;
    this.cool -= dt;

    tmp.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = tmp.length();
    if (dist > 1e-4) tmp.divideScalar(dist);
    let mx = 0;
    let mz = 0;
    let face = tmp;

    switch (this.state) {
      case 'spawning':
        if (this.updateLeapIn(0.75)) this.enter('chase');
        break;
      case 'chase': {
        // Hold a ring around the player: back off, close in, or strafe.
        let want = 0;
        if (dist < s.minRange) want = -1;
        else if (dist > s.maxRange) want = 1;
        const strafeX = -tmp.z * this.strafe;
        const strafeZ = tmp.x * this.strafe;
        mx = (tmp.x * want + strafeX * 0.45) * this.speed;
        mz = (tmp.z * want + strafeZ * 0.45) * this.speed;
        this.backing = want < 0;
        if (Math.random() < dt * 0.4) this.strafe *= -1;
        if (this.cool <= 0 && dist < s.maxRange + 3 && !player.dead && this.frozenT <= 0 && !(this.blindT > 0)) this.enter('aim');
        break;
      }
      case 'aim': {
        const p = Math.min(1, this.t / s.aimTime);
        if (p < 0.75) this.aimDir.copy(tmp); // locks for the last quarter
        face = this.aimDir;
        this.aimLine.visible = true;
        this.aimLine.position.set(this.pos.x, 0.05, this.pos.z);
        this.aimLine.rotation.y = Math.atan2(this.aimDir.x, this.aimDir.z);
        this.aimLine.scale.set(p > 0.75 ? 1.6 : 1, 1, 18);
        this.aimMat.opacity = 0.1 + 0.55 * p * p;
        if (p >= 1) {
          this.fire();
          this.enter('recover');
        }
        break;
      }
      case 'recover':
        face = this.aimDir;
        if (this.t >= (this.staggered ? 1.0 : 0.45)) {
          this.cool = s.cooldown * (0.8 + Math.random() * 0.5);
          this.enter('chase');
        }
        break;
    }

    this.pos.x += mx * dt + this.knock.x * realDt;
    this.pos.z += mz * dt + this.knock.z * realDt;
    this.knock.multiplyScalar(Math.exp(-9 * realDt));
    resolveCircle(this.pos, this.radius);
    const targetYaw = Math.atan2(face.x, face.z);
    let d = targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-12 * dt));
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    const f = this.flash > 0 ? 1 : 0;
    let r = f * 2;
    let g = f * 2;
    let b = f * 2;
    if (this.frozenT > 0) {
      r += 0.35;
      g += 0.75;
      b += 1.4;
    } else if (this.slowT > 0) {
      g += 0.1;
      b += 0.45;
    }
    if (this.burnT > 0) r += 0.45;
    this.bodyMat.emissive.setRGB(r, g, b);
    if (this.model) {
      for (const m of this.model.materials) m.emissive.setRGB(r * 0.4, g * 0.4, b * 0.4);
      this.flinch = Math.max(0, (this.flinch || 0) - realDt * 5);
      this.model.holder.rotation.x = -0.45 * this.flinch * this.flinch;
      // Archery clips stand side-on; turn so the bow arm points at the target while aiming.
      const aiming = this.state === 'aim' || this.state === 'recover';
      const yawT = aiming ? THREE.MathUtils.degToRad(this.aimYawDeg) : 0;
      this.model.holder.rotation.y += (yawT - this.model.holder.rotation.y) * (1 - Math.exp(-15 * realDt));
    }
    updateElite(this, realDt);
    this.updateHpBar();
    this.updateModel(dt);
  }

  fire() {
    const origin = new THREE.Vector3(this.pos.x, ARROW_HEIGHT, this.pos.z).addScaledVector(this.aimDir, 0.7);
    this.game.enemyArrows.spawn(origin, this.aimDir.clone(), config.archer.arrowSpeed, config.archer.damage, this);
    this.game.sfx.release(0.7, false, this.game.panAt(this.pos));
  }

  /** Interrupts the aim when staggered (full draw or perfect hit), like a grunt's windup. */
  hit(damage, dir, charge, perfect) {
    const wasAim = this.state === 'aim';
    if (wasAim) this.state = 'windup'; // let the base class apply its stagger rule
    const res = super.hit(damage, dir, charge, perfect);
    if (this.state === 'windup') this.state = 'aim';
    if (res === 'stagger') this.aimLine.visible = false;
    return res;
  }

  updateModel(dt) {
    const A = this.anim;
    if (!A) return;
    switch (this.state) {
      case 'dying':
        A.set(['death'], { once: true, fade: 0.08 });
        break;
      case 'spawning':
        A.set(['idle']);
        break;
      case 'chase':
        if (this.hitT > 0 && A.has('hit')) A.set(['hit'], { once: true, fade: 0.05 });
        else if (this.backing && A.has('backstep')) A.set(['backstep']);
        else A.set(['walk']);
        break;
      case 'aim': {
        A.set(['shoot'], { once: true, fade: 0.1 });
        const a = A.action('shoot');
        if (a) a.timeScale = 0;
        const dur = A.duration('shoot');
        const p = Math.min(1, this.t / config.archer.aimTime);
        // This clip runs reach → nock (≈45%) → full draw (end); the aim follows nock → full draw.
        A.scrub('shoot', dur * THREE.MathUtils.lerp(0.45, 0.98, p));
        break;
      }
      case 'recover': {
        if (this.staggered && A.has('hit')) {
          A.set(['hit'], { once: true, fade: 0.05 });
          break;
        }
        // The clip has no release frames: relax straight back to idle.
        A.set(['idle'], { fade: 0.25 });
        break;
      }
    }
    A.update(dt);
    this.orientBow();
  }

  dispose() {
    super.dispose();
    this.aimLine.removeFromParent();
    this.aimMat.dispose();
  }
}

/** Arrows fired by enemies. They hurt the player, and rolling through them is a perfect dodge. */
export class EnemyArrows {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  spawn(origin, dir, speed, damage, owner) {
    const mesh = makeArrowMesh(false);
    mesh.traverse((m) => {
      if (m.isMesh && m.name !== 'trail') {
        m.material = m.material.clone();
        m.material.emissive?.setRGB(0.2, 0.9, 1.1);
      }
    });
    const trail = mesh.getObjectByName('trail');
    trail.material = trail.material.clone();
    trail.material.color.setRGB(0.6, 2.2, 2.6);
    trail.material.opacity = 0.8;
    mesh.position.copy(origin);
    mesh.lookAt(tmp.copy(origin).add(dir));
    this.game.scene.add(mesh);
    this.list.push({ mesh, pos: origin.clone(), dir, speed, damage, owner, traveled: 0, dodged: false });
  }

  update(dt) {
    const P = this.game.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.pos.addScaledVector(a.dir, a.speed * dt);
      a.traveled += a.speed * dt;
      a.mesh.position.copy(a.pos);
      const d = Math.hypot(P.pos.x - a.pos.x, P.pos.z - a.pos.z);
      let done = false;
      if (!P.dead && d < PLAYER_RADIUS + 0.2) {
        const res = P.takeDamage(a.damage, a.dir, this.game);
        if (res === true) {
          this.game.onPlayerHit({ lungeDir: a.dir }, a.damage);
          done = true;
        } else if (res === 'dodged' && !a.dodged) {
          a.dodged = true;
          this.game.onPerfectDodge(a.owner);
        }
      } else if (!P.dead && !a.dodged && P.rollInvuln && d < 1.3) {
        // A close call while rolling counts as a perfect dodge too.
        a.dodged = true;
        this.game.onPerfectDodge(a.owner);
      }
      if (!done && (arrowBlocked(a.pos) || a.traveled > 30)) {
        this.game.onArrowStopped({ pos: a.pos }, true);
        done = true;
      }
      if (done) {
        a.mesh.removeFromParent();
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const a of this.list) a.mesh.removeFromParent();
    this.list.length = 0;
  }
}
