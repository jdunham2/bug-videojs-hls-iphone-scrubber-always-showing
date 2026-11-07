import * as THREE from 'three';
import { config } from './config.js';
import { resolveCircle } from './world.js';
import { PLAYER_RADIUS } from './player.js';
import { instantiate, attachProp, findBone, enableDissolve } from './models.js';

const bodyGeo = new THREE.CapsuleGeometry(0.45, 0.55, 4, 10);
const headGeo = new THREE.SphereGeometry(0.32, 10, 8);
const hornGeo = new THREE.ConeGeometry(0.07, 0.32, 6);
const eyeGeo = new THREE.SphereGeometry(0.06, 6, 4);
const clubGeo = new THREE.CylinderGeometry(0.08, 0.17, 0.95, 6);
const hornMat = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.6 });
const clubMat = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.9, flatShading: true });
const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 0.4) });

const spawnRingGeo = new THREE.RingGeometry(0.55, 0.8, 32).rotateX(-Math.PI / 2);
const wedgeGeo = new THREE.BufferGeometry();
wedgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0.2, 0.5, 0, 0.2, 0, 0, 1], 3));

const hpBgGeo = new THREE.PlaneGeometry(1, 0.13);
const hpFgGeo = new THREE.PlaneGeometry(1, 0.09).translate(0.5, 0, 0);
const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false });
const hpFgMat = new THREE.MeshBasicMaterial({ color: 0xe0413a, depthTest: false });

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const tmp = new THREE.Vector3();

export class Grunt {
  constructor(game, pos, level) {
    this.game = game;
    this.level = level;
    const g = config.grunt;
    const w = config.waves;
    this.maxHp = this.hp = g.baseHp * (1 + w.hpGrowth * (level - 1));
    this.speed = g.speed * (1 + w.speedGrowth * (level - 1));
    const scale = Math.min(1.4, 1 + 0.03 * (level - 1));
    this.radius = 0.55 * scale;

    this.pos = pos.clone();
    this.knock = new THREE.Vector3();
    this.lungeDir = new THREE.Vector3(0, 0, 1);
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'spawning';
    this.t = 0;
    this.flash = 0;
    this.removed = false;
    this.staggered = false;
    // Status effects from elemental arrows.
    this.burnT = 0;
    this.burnDps = 0;
    this.burnShown = 0;
    this.slowT = 0;
    this.slowAmt = 0;
    this.frostHits = 0;
    this.frozenT = 0;

    // Higher levels get darker, more saturated skin.
    const color = new THREE.Color().setHSL(0.01, Math.min(0.85, 0.6 + 0.03 * level), Math.max(0.12, 0.24 - 0.015 * (level - 1)));
    this.bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, emissive: 0x000000 });

    this.group = new THREE.Group();
    this.group.scale.setScalar(scale);
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    body.position.y = 0.72;
    const head = new THREE.Mesh(headGeo, this.bodyMat);
    head.position.set(0, 1.42, 0.08);
    const hornL = new THREE.Mesh(hornGeo, hornMat);
    hornL.position.set(-0.2, 1.68, 0.05);
    hornL.rotation.z = 0.5;
    const hornR = hornL.clone();
    hornR.position.x = 0.2;
    hornR.rotation.z = -0.5;
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.11, 1.46, 0.36);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.11;
    this.club = new THREE.Group();
    this.club.position.set(0.5, 0.95, 0.1);
    const clubMesh = new THREE.Mesh(clubGeo, clubMat);
    clubMesh.position.y = 0.4;
    this.club.add(clubMesh);
    this.rig.add(body, head, hornL, hornR, eyeL, eyeR, this.club);
    this.rig.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.group.position.copy(this.pos);
    game.scene.add(this.group);
    this.hitT = 0;
    this.attachModel(level);

    // Spawn telegraph ring + lunge direction wedge (ground decals).
    this.spawnRingMat = new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0, depthWrite: false });
    this.spawnRing = new THREE.Mesh(spawnRingGeo, this.spawnRingMat);
    this.spawnRing.position.set(pos.x, 0.04, pos.z);
    game.scene.add(this.spawnRing);

    this.wedgeMat = new THREE.MeshBasicMaterial({
      color: 0xff3020,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.wedge = new THREE.Mesh(wedgeGeo, this.wedgeMat);
    this.wedge.renderOrder = 1;
    this.wedge.visible = false;
    game.scene.add(this.wedge);

    this.hpBar = new THREE.Group();
    const bg = new THREE.Mesh(hpBgGeo, hpBgMat);
    this.hpFg = new THREE.Mesh(hpFgGeo, hpFgMat);
    this.hpFg.position.set(-0.5, 0, 0.001);
    bg.renderOrder = 10;
    this.hpFg.renderOrder = 11;
    this.hpBar.add(bg, this.hpFg);
    this.hpBar.visible = false;
    game.scene.add(this.hpBar);
  }

  /** Use the Meshy grunt if it's loaded: placeholder meshes hide, the rig group stays for spawn/arrows. */
  attachModel(level) {
    const inst = instantiate('grunt', config.models.gruntHeight);
    if (!inst) return;
    this.model = inst;
    this.anim = inst.animator;
    for (const c of this.rig.children) c.visible = false;
    this.rig.add(inst.holder);
    this.dissolve = enableDissolve(inst.materials, new THREE.Color(2.2, 0.8, 3)).u;
    this.dissolveEdge = null;
    this.dissolve.value = 1; // materializes during the spawn
    // Higher levels: darker, redder skin.
    const k = Math.min(0.45, 0.05 * (level - 1));
    const tint = new THREE.Color(1, 1 - k, 1 - k * 1.2);
    for (const m of inst.materials) m.color?.multiply(tint);
    const hand = findBone(inst.root, [/hand/i, /right|(^|[_.])r([_.]|$)/i]);
    attachProp('club', hand, 1.0);
  }

  /** Pick the grunt's animation from its state. `dt` is its own (slowed/frozen) clock. */
  updateModel(dt) {
    const A = this.anim;
    if (!A) return;
    const g = config.grunt;
    const atk = A.duration('attack');
    const hitAt = atk * config.models.attackHitAt;
    const crouchEnd = atk * config.models.attackWindupEnd;
    switch (this.state) {
      case 'dying':
        A.set(['death'], { once: true, fade: 0.08 });
        break;
      case 'spawning':
        A.set(['idle']);
        break;
      case 'chase':
        if (this.hitT > 0 && A.has('hit')) {
          A.set(['hit'], { once: true, fade: 0.05 });
        } else {
          A.set(['walk']);
          const a = A.action('walk');
          if (a) a.timeScale = this.speed / g.speed;
        }
        break;
      case 'windup': {
        // The crouch before the leap follows the windup timer.
        A.set(['attack'], { once: true, fade: 0.1 });
        const a = A.action('attack');
        if (a) a.timeScale = 0;
        A.scrub('attack', crouchEnd * Math.min(1, this.t / g.windupTime));
        break;
      }
      case 'lunge': {
        // The leap itself is squeezed into the lunge.
        const a = A.action('attack');
        if (a) a.timeScale = 0;
        A.scrub('attack', crouchEnd + (hitAt - crouchEnd) * Math.min(1, this.t / g.lungeTime));
        break;
      }
      case 'recover':
        if (this.staggered && A.has('hit')) {
          A.set(['hit'], { once: true, fade: 0.05 });
        } else {
          const a = A.action('attack');
          if (a) a.timeScale = 1.5; // recover from the landing
        }
        break;
    }
    A.update(dt);
  }

  isHittable() {
    return this.state !== 'spawning' && this.state !== 'dying';
  }

  enter(state) {
    this.lastState = this.state;
    this.state = state;
    this.t = 0;
    const pan = this.game.panAt(this.pos);
    if (state === 'windup') this.game.sfx.windup(pan);
    if (state === 'lunge') {
      this.hasHit = false;
      this.game.sfx.lunge(pan);
    }
    if (state === 'recover' && this.lastState === 'lunge' && !this.staggered) {
      this.game.sfx.slam(pan);
      this.game.onSlam(this.pos.clone().addScaledVector(this.lungeDir, 0.6), 1);
    }
    if (state === 'chase') this.staggered = false;
    this.wedge.visible = state === 'windup';
  }

  applyBurn(dps, duration) {
    this.burnT = duration;
    this.burnDps = Math.max(this.burnDps, dps);
  }

  /** Returns true if this hit froze the grunt. */
  applyFrost(slow, duration, hitsToFreeze, freezeTime) {
    this.slowT = duration;
    this.slowAmt = slow;
    this.frostHits++;
    if (this.frostHits >= hitsToFreeze) {
      this.frostHits = 0;
      this.frozenT = freezeTime;
      // Freezing interrupts an attack in progress.
      if (this.state === 'windup' || this.state === 'lunge') this.enter('recover');
      return true;
    }
    return false;
  }

  /** Burn damage and effect timers (real time). Returns true if the burn killed it. */
  updateStatus(dt) {
    if (this.burnT > 0) {
      this.burnT -= dt;
      const dmg = this.burnDps * Math.min(dt, this.burnT + dt);
      this.hp -= dmg;
      this.burnShown += dmg;
      if (Math.random() < dt * 18) {
        this.game.particles.spawn(this.pos.clone().setY(0.6 + Math.random()), {
          count: 1,
          color: [3, 1.1, 0.2],
          speed: 0.6,
          up: 2.5,
          life: 0.45,
          size: 0.1,
          gravity: -2,
        });
      }
      if (this.burnShown >= 4 || (this.burnT <= 0 && this.burnShown >= 1)) {
        this.game.numbers.spawn(this.pos.clone().setY(2), Math.round(this.burnShown), 'burn');
        this.burnShown = 0;
      }
      if (this.burnT <= 0) this.burnDps = 0;
      if (this.hp <= 0) {
        this.die(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize());
        this.game.onKill(this);
        return true;
      }
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) {
        this.slowAmt = 0;
        this.frostHits = 0;
      }
    }
    if (this.frozenT > 0) this.frozenT -= dt;
    return false;
  }

  /** How fast this grunt's own clock runs (frozen = 0, slowed < 1). */
  get timeScale() {
    if (this.frozenT > 0) return 0;
    return 1 - this.slowAmt;
  }

  update(realDt, player) {
    const g = config.grunt;
    this.flash = Math.max(0, this.flash - realDt);

    this.hitT = Math.max(0, this.hitT - realDt);
    if (this.state === 'dying') {
      this.t += realDt;
      this.updateDying(realDt);
      this.updateModel(realDt);
      return;
    }
    if (this.updateStatus(realDt)) return;
    const dt = realDt * this.timeScale;
    this.t += dt;

    tmp.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = tmp.length();
    if (dist > 1e-4) tmp.divideScalar(dist);

    let mx = 0;
    let mz = 0;
    let faceX = tmp.x;
    let faceZ = tmp.z;
    let turnRate = 10;
    let lean = 0;
    let clubAngle = 0.2;

    switch (this.state) {
      case 'spawning': {
        const p = Math.min(1, this.t / 0.9);
        this.rig.position.y = (this.model ? -0.6 : -1.8) * (1 - easeOut(p));
        if (this.dissolve) this.dissolve.value = 1 - easeOut(p);
        this.spawnRingMat.opacity = 0.7 * (1 - p * 0.5);
        this.spawnRing.scale.setScalar(0.6 + p * 0.6);
        if (p >= 1) {
          this.rig.position.y = 0;
          this.spawnRing.visible = false;
          this.enter('chase');
        }
        break;
      }
      case 'chase':
        mx = tmp.x * this.speed;
        mz = tmp.z * this.speed;
        lean = 0.1;
        if (dist < g.attackRange && !player.dead && this.frozenT <= 0) this.enter('windup');
        break;
      case 'windup': {
        // Tracks you for the first 70% of the windup, then commits.
        if (this.t < g.windupTime * 0.7) this.lungeDir.copy(tmp);
        faceX = this.lungeDir.x;
        faceZ = this.lungeDir.z;
        turnRate = 20;
        const p = Math.min(1, this.t / g.windupTime);
        lean = -0.35 * p;
        clubAngle = 0.2 - 2.2 * p;
        this.wedgeMat.opacity = 0.12 + 0.45 * p;
        const reach = g.lungeSpeed * g.lungeTime + this.radius;
        this.wedge.position.set(this.pos.x, 0.045, this.pos.z);
        this.wedge.rotation.y = Math.atan2(this.lungeDir.x, this.lungeDir.z);
        this.wedge.scale.set(1.2, 1, reach);
        if (this.t >= g.windupTime) this.enter('lunge');
        break;
      }
      case 'lunge':
        mx = this.lungeDir.x * g.lungeSpeed;
        mz = this.lungeDir.z * g.lungeSpeed;
        faceX = this.lungeDir.x;
        faceZ = this.lungeDir.z;
        lean = 0.45;
        clubAngle = 1.6;
        if (!this.hasHit && dist < this.radius + PLAYER_RADIUS + 0.25) {
          this.hasHit = true;
          const res = player.takeDamage(g.damage, this.lungeDir, this.game);
          if (res === true) this.game.onPlayerHit(this);
          else if (res === 'dodged') this.game.onPerfectDodge(this);
        }
        if (this.t >= g.lungeTime) this.enter('recover');
        break;
      case 'recover': {
        turnRate = 2;
        const dur = g.recoverTime * (this.staggered ? 1.5 : 1);
        lean = this.staggered ? -0.25 : 0.25;
        clubAngle = this.staggered ? -0.6 : 1.2;
        if (this.t >= dur) this.enter('chase');
        break;
      }
    }

    this.pos.x += mx * dt + this.knock.x * realDt;
    this.pos.z += mz * dt + this.knock.z * realDt;
    this.knock.multiplyScalar(Math.exp(-9 * realDt));
    resolveCircle(this.pos, this.radius);

    const targetYaw = Math.atan2(faceX, faceZ);
    let d = targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-turnRate * dt));

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (!this.model) {
      const k = 1 - Math.exp(-14 * dt);
      this.rig.rotation.x += (lean - this.rig.rotation.x) * k;
      this.club.rotation.x += (clubAngle - this.club.rotation.x) * k;
      if (this.state === 'chase') this.rig.position.y = Math.abs(Math.sin(this.t * 9)) * 0.08;
    }

    const windGlow = this.state === 'windup' ? Math.min(1, this.t / g.windupTime) : 0;
    const f = this.flash > 0 ? 1 : 0;
    let r = f * 2 + windGlow * 0.9;
    let gr = f * 2;
    let b = f * 2;
    if (this.frozenT > 0) {
      r += 0.35;
      gr += 0.75;
      b += 1.4;
    } else if (this.slowT > 0) {
      gr += 0.1;
      b += 0.45;
    }
    if (this.burnT > 0) {
      const fl = 0.35 + 0.2 * Math.sin(performance.now() * 0.03 + this.yaw * 10);
      r += fl;
      gr += fl * 0.3;
    }
    this.bodyMat.emissive.setRGB(r, gr, b);
    if (this.model) {
      for (const m of this.model.materials) m.emissive.setRGB(r * 0.4, gr * 0.4, b * 0.4);
      // Flinch: snap back from the hit, then settle.
      this.flinch = Math.max(0, (this.flinch || 0) - realDt * 5);
      this.model.holder.rotation.x = -0.45 * this.flinch * this.flinch;
    }

    this.updateHpBar();
    this.updateModel(dt);
  }

  updateHpBar() {
    const show = this.hp < this.maxHp && this.state !== 'dying';
    this.hpBar.visible = show;
    if (!show) return;
    this.hpBar.position.set(this.pos.x, 2.3 * this.group.scale.y, this.pos.z);
    this.hpBar.quaternion.copy(this.game.camera.quaternion);
    this.hpFg.scale.x = Math.max(0.001, this.hp / this.maxHp);
  }

  /** Returns 'hit' | 'stagger' | 'kill' (or null if not hittable). */
  hit(damage, dir, charge, perfect) {
    if (!this.isHittable()) return null;
    this.hp -= damage;
    this.flash = 0.08;
    this.flinch = Math.min(1, 0.5 + charge * 0.5 + (perfect ? 0.3 : 0));
    const kb = config.feel.knockback * (0.35 + 0.65 * charge) * (perfect ? 1.5 : 1) * (this.state === 'lunge' ? 0.3 : 1);
    this.knock.addScaledVector(dir, kb);
    if (this.hp <= 0) {
      this.die(dir);
      return 'kill';
    }
    if (this.state === 'chase') this.hitT = 0.3;
    if (this.state === 'windup' && (charge >= config.grunt.staggerCharge || perfect)) {
      this.staggered = true;
      this.enter('recover');
      return 'stagger';
    }
    return 'hit';
  }

  die(dir) {
    this.state = 'dying';
    this.t = 0;
    this.wedge.visible = false;
    this.hpBar.visible = false;
    // Face the shooter so the fall goes backwards, away from the arrow.
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.group.rotation.y = this.yaw;
    this.bodyMat.emissive.setRGB(0, 0, 0);
  }

  updateDying(dt) {
    const p = Math.min(1, this.t / 0.35);
    if (!this.model) this.rig.rotation.x = -Math.PI * 0.5 * easeOut(p);
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-6 * dt));
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    if (this.dissolve) {
      // Burn away with glowing edges once the death animation has played a little.
      const k = Math.max(0, (this.t - 0.75) / 0.9);
      if (k > 0 && !this.dissolveEdge) {
        this.dissolveEdge = true;
        for (const m of this.model.materials) m.emissive.setRGB(0, 0, 0);
      }
      this.dissolve.value = Math.min(1, k);
      if (k > 0 && k < 1 && Math.random() < dt * 40) {
        this.game.particles.spawn(this.pos.clone().setY(0.3 + Math.random() * 1.4), {
          count: 1,
          color: [2.2, 0.8, 3],
          speed: 0.5,
          up: 2,
          life: 0.6,
          size: 0.07,
          gravity: -2,
        });
      }
      if (this.t > 1.75) this.dispose();
    } else {
      if (this.t > 0.9) this.group.position.y -= dt * 1.2;
      if (this.t > 1.8) this.dispose();
    }
  }

  dispose() {
    if (this.removed) return;
    this.removed = true;
    this.group.removeFromParent();
    this.spawnRing.removeFromParent();
    this.wedge.removeFromParent();
    this.hpBar.removeFromParent();
    this.bodyMat.dispose();
    if (this.model) for (const m of this.model.materials) m.dispose();
    this.spawnRingMat.dispose();
    this.wedgeMat.dispose();
  }
}
