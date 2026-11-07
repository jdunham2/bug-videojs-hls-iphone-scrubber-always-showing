import * as THREE from 'three';
import { config } from './config.js';
import { resolveCircle } from './world.js';
import { makeArrowMesh } from './arrows.js';
import { stat, lv, OVERDRAW_TIME } from './skills.js';
import { models, instantiate, attachProp, findBone, orientProp } from './models.js';

export const PLAYER_RADIUS = 0.45;
export const ARROW_HEIGHT = 1.1;

const lerp = THREE.MathUtils.lerp;
const UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const RING_IDLE = new THREE.Color(0xffffff);
const RING_PERFECT = new THREE.Color(3, 2.2, 0.6);
const RING_LATE = new THREE.Color(0x777777);
const RING_OVER = new THREE.Color(1.6, 0.4, 1.8);
const RING_MEGA = new THREE.Color(3.2, 0.7, 2.2);

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.rollDir = new THREE.Vector3(0, 0, 1);
    this.yaw = Math.PI;

    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);

    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x3f7d4e, roughness: 0.8 });
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x2b5636, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48c, roughness: 0.7 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 4, 10), this.bodyMat);
    body.position.y = 0.73;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), skin);
    face.position.set(0, 1.4, 0.06);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.6, 8), hoodMat);
    hood.position.set(0, 1.62, -0.04);
    hood.rotation.x = -0.2;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.05, 6, 16).rotateX(Math.PI / 2), leather);
    belt.position.y = 0.72;
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8), leather);
    quiver.position.set(0.18, 1.05, -0.34);
    quiver.rotation.set(0.3, 0, -0.35);
    this.rig.add(body, face, hood, belt, quiver);
    this.rig.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });

    this.buildBow();
    scene.add(this.group);

    // Charge indicator: a ring that closes onto a fixed target ring. When they
    // meet you're at full draw, and they flash gold during the perfect window.
    const ringGeo = new THREE.RingGeometry(1.0, 1.06, 56).rotateX(-Math.PI / 2);
    this.targetRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    this.chargeRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    this.targetRing = new THREE.Mesh(ringGeo, this.targetRingMat);
    this.chargeRing = new THREE.Mesh(ringGeo, this.chargeRingMat);
    this.targetRing.renderOrder = this.chargeRing.renderOrder = 2;
    scene.add(this.targetRing, this.chargeRing);

    // Aim line on the ground.
    this.aimMat = new THREE.MeshBasicMaterial({
      color: 0xfff1c8,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), this.aimMat);
    this.aimLine.renderOrder = 1;
    scene.add(this.aimLine);

    this.reset();
  }

  buildBow() {
    const bow = new THREE.Group();
    bow.position.set(0.05, 1.05, 0.42);
    bow.rotation.z = -0.25;
    const r = 0.55;
    const arc = Math.PI * 0.8;
    const tipZ = r * Math.cos(arc / 2);
    const tipY = r * Math.sin(arc / 2);
    const geo = new THREE.TorusGeometry(r, 0.035, 6, 20, arc);
    geo.rotateZ(-arc / 2).rotateY(-Math.PI / 2).translate(0, 0, -tipZ);
    this.bowMat = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.6, emissive: 0x000000 });
    this.limb = new THREE.Mesh(geo, this.bowMat);
    this.limb.castShadow = true;
    bow.add(this.limb);

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([0, tipY, 0, 0, 0, 0, 0, -tipY, 0], 3));
    this.string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xf3ead2 }));
    bow.add(this.string);

    this.nocked = makeArrowMesh(false);
    this.nocked.visible = false;
    bow.add(this.nocked);

    this.bow = bow;
    this.rig.add(bow);
  }

  reset() {
    this.pos.set(0, 0, 3);
    this.vel.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.hp = stat.maxHp();
    this.dead = false;
    this.deathT = 0;
    this.drawing = false;
    this.drawT = 0;
    this.perfectCued = false;
    this.cooldown = 0;
    this.iframes = 0;
    this.hurtFlash = 0;
    this.recoil = 0;
    this.walkT = 0;
    this.hitT = 0;
    this.releaseT = 0;
    this.cheerT = 0;
    this.rolling = false;
    this.rollT = 0;
    this.charges = stat.dodgeCharges();
    this.rechargeT = 0;
    this.dodgeBuffer = 0;
    this.megaCued = false;
    this.counterT = 0;
    this.rig.rotation.set(0, 0, 0);
    this.rig.position.set(0, 0, 0);
    this.rig.scale.set(1, 1, 1);
    this.group.visible = true;
    if (this.anim) this.anim.set(['idle'], { fade: 0, restart: true });
  }

  /** True during the invulnerable part of a roll. */
  get rollInvuln() {
    const d = config.dodge;
    return this.rolling && this.rollT >= d.iFrameStart && this.rollT <= d.iFrameEnd;
  }

  get rechargeTime() {
    return config.dodge.duration + config.dodge.cooldown;
  }

  /** Dodge charges as a 0..max float, counting the one currently recharging. */
  get dodgeMeter() {
    const max = stat.dodgeCharges();
    const partial = this.charges < max && this.rechargeTime > 0 ? this.rechargeT / this.rechargeTime : 0;
    return Math.min(max, this.charges + partial);
  }

  refillDodge() {
    this.charges = stat.dodgeCharges();
    this.rechargeT = 0;
  }

  get charge() {
    return this.drawing ? Math.min(this.drawT / stat.drawTime(), 1) : 0;
  }

  /** 'none' | 'charging' | 'perfect' | 'late', plus 'overcharge' | 'mega' with Overdraw. */
  get drawPhase() {
    if (!this.drawing) return 'none';
    const drawTime = stat.drawTime();
    const windowEnd = drawTime + stat.perfectWindow();
    if (this.drawT < drawTime) return 'charging';
    if (this.drawT <= windowEnd) return 'perfect';
    if (lv('overdraw')) return this.drawT >= windowEnd + OVERDRAW_TIME ? 'mega' : 'overcharge';
    return 'late';
  }

  /** 0..1 progress from the end of the perfect window to a mega-shot. */
  get overchargeProgress() {
    const windowEnd = stat.drawTime() + stat.perfectWindow();
    return Math.min(1, Math.max(0, (this.drawT - windowEnd) / OVERDRAW_TIME));
  }

  update(dt, input, aimPoint, game) {
    const bowCfg = config.bow;
    this.cooldown -= dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.hitT = Math.max(0, this.hitT - dt);
    this.releaseT = Math.max(0, this.releaseT - dt);
    this.cheerT = Math.max(0, this.cheerT - dt);
    const maxCharges = stat.dodgeCharges();
    if (this.charges < maxCharges) {
      this.rechargeT += dt;
      if (this.rechargeT >= this.rechargeTime) {
        this.charges++;
        this.rechargeT = 0;
      }
    } else {
      this.rechargeT = 0;
    }
    this.counterT = Math.max(0, this.counterT - dt);
    this.dodgeBuffer = Math.max(0, this.dodgeBuffer - dt);

    if (this.dead) {
      this.deathT += dt;
      if (!this.model) this.rig.rotation.x = -Math.min(1, this.deathT * 3) * Math.PI * 0.5;
      this.hideIndicators();
      this.updateMaterials();
      this.updateModel(dt);
      return;
    }

    // Aim
    const ax = aimPoint.x - this.pos.x;
    const az = aimPoint.z - this.pos.z;
    if (ax * ax + az * az > 0.04) this.aimDir.set(ax, 0, az).normalize();

    // Dodge (buffered briefly so a slightly early press still counts)
    if (input.dodgePressed()) this.dodgeBuffer = 0.15;
    if (this.dodgeBuffer > 0 && !this.rolling && this.charges >= 1) this.startRoll(input, game);

    // Draw / release
    if ((input.mouse.down || input.mouse.clicked) && !this.drawing && this.cooldown <= 0 && !this.rolling) {
      this.drawing = true;
      this.drawT = 0;
      this.perfectCued = false;
      this.megaCued = false;
      if (this.counterT > 0) {
        // Counter shot after a perfect dodge: start already at full draw.
        this.drawT = stat.drawTime();
        this.counterT = 0;
        this.perfectCued = true;
        game.sfx.perfectReady();
      } else {
        game.sfx.drawStart(stat.drawTime());
      }
    }
    if (this.drawing) {
      this.drawT += dt;
      if (!this.perfectCued && this.drawT >= stat.drawTime()) {
        this.perfectCued = true;
        game.sfx.perfectReady();
      }
      if (!this.megaCued && this.drawPhase === 'mega') {
        this.megaCued = true;
        game.sfx.megaReady();
      }
      if (!input.mouse.down) this.release(game);
    }

    // Movement (screen-relative)
    if (this.rolling) {
      const d = config.dodge;
      this.rollT += dt;
      const p = Math.min(1, this.rollT / d.duration);
      // Fast out of the gate, easing off: integrates to exactly `distance`.
      const v = (d.distance / d.duration) * (0.6 + 0.8 * (1 - p));
      this.vel.set(this.rollDir.x * v, 0, this.rollDir.z * v);
      if (Math.random() < 0.6) {
        game.particles.spawn(new THREE.Vector3(this.pos.x, 0.1, this.pos.z), { count: 1, color: 0x8a7a66, speed: 1, up: 1, life: 0.35, size: 0.12, gravity: 4 });
      }
      if (this.rollT >= d.duration) this.rolling = false;
    } else {
      const axis = input.axis();
      const speed = config.player.moveSpeed * (this.drawing ? bowCfg.drawMoveMultiplier : 1);
      const tx = (game.camRight.x * axis.x + game.camForward.x * axis.y) * speed;
      const tz = (game.camRight.z * axis.x + game.camForward.z * axis.y) * speed;
      const k = 1 - Math.exp(-18 * dt);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      // Footsteps every ~1.6 units travelled.
      this.stepDist = (this.stepDist || 0) + Math.hypot(this.vel.x, this.vel.z) * dt;
      if (this.stepDist > 1.6) {
        this.stepDist = 0;
        game.sfx.step();
      }
    }
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-10 * dt));
    resolveCircle(this.pos, PLAYER_RADIUS);

    // Facing follows aim
    const faceDir = this.rolling ? this.rollDir : this.aimDir;
    this.yaw = lerpAngle(this.yaw, Math.atan2(faceDir.x, faceDir.z), 1 - Math.exp(-(this.rolling ? 40 : 25) * dt));
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    if (this.rolling) {
      // Tucked forward roll around a pivot at hip height.
      const p = Math.min(1, this.rollT / config.dodge.duration);
      const a = p * Math.PI * 2;
      const c = 0.5;
      this.rig.scale.set(1, 0.62, 1);
      this.rig.rotation.x = a;
      this.rig.position.set(0, c - c * Math.cos(a), -c * Math.sin(a));
    } else {
      // Walk bob
      const moving = Math.hypot(this.vel.x, this.vel.z);
      this.walkT += dt * moving * 1.6;
      this.rig.scale.set(1, 1, 1);
      this.rig.position.set(0, Math.abs(Math.sin(this.walkT)) * 0.06 * Math.min(1, moving / 3), 0);
      this.rig.rotation.x = -this.recoil * 0.15;
    }

    this.updateBow();
    this.updateIndicators();
    this.updateMaterials();
    this.updateModel(dt);
  }

  /** Swap the placeholder body for the Meshy hero (called once models finish loading). */
  attachModel() {
    if (this.model || !models.hero) return;
    const inst = instantiate('hero', config.models.heroHeight);
    if (!inst) return;
    this.model = inst;
    this.anim = inst.animator;
    this.rig.visible = false;
    this.group.add(inst.holder);
    const hand = findBone(inst.root, [/hand/i, /left|(^|[_.])l([_.]|$)/i]);
    this.bowProp = attachProp('bow', hand, 1.1);
  }

  /** Pick the hero's animation from game state each frame. */
  updateModel(dt) {
    const A = this.anim;
    if (!A) return;
    const mc = config.models;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const moving = speed > 0.8;
    const loco = moving && A.has('run') ? 'run' : 'idle';
    const locoScale = moving ? THREE.MathUtils.clamp(speed / mc.runAnimSpeed, 0.5, 1.6) : 1;
    // Turn side-on archery poses so the bow arm points down the aim line.
    const aiming = this.drawing || this.releaseT > 0;
    const yawTarget = aiming ? THREE.MathUtils.degToRad(mc.heroAimYaw) : 0;
    this.model.holder.rotation.y += (yawTarget - this.model.holder.rotation.y) * (1 - Math.exp(-20 * dt));

    if (this.dead) {
      A.set(['death'], { once: true, fade: 0.1 });
    } else if (this.rolling) {
      const rate = A.duration('roll') / config.dodge.duration;
      A.set(['roll'], { once: true, fade: 0.05, timeScale: rate || 1 });
    } else if (this.drawing || this.releaseT > 0) {
      const shoot = A.has('shoot:upper') ? 'shoot:upper' : 'shoot';
      const lowerBase = moving && A.has('aimWalk') ? 'aimWalk' : loco;
      const lower = shoot === 'shoot:upper' ? `${lowerBase}:lower` : null;
      A.set(lower ? [shoot, lower] : [shoot], { fade: 0.12 });
      if (lower) A.action(lower).timeScale = locoScale;
      const dur = A.duration('shoot');
      const a = A.action(shoot);
      if (a && this.drawing) {
        // Nock → full draw follows charge, then holds at full draw.
        a.timeScale = 0;
        A.scrub(shoot, dur * lerp(mc.shootStartAt, mc.shootFullAt, Math.min(1, this.charge)));
        this.releasing = false;
      } else if (a) {
        // Snap to the release frame, then play the follow-through.
        if (!this.releasing) {
          this.releasing = true;
          a.time = dur * mc.shootReleaseAt;
        }
        a.timeScale = 1.6;
      }
    } else if (this.hitT > 0 && A.has('hit')) {
      A.set(['hit'], { once: true, fade: 0.06 });
    } else if (this.cheerT > 0 && !moving && A.has('victory')) {
      A.set(['victory'], { once: true, fade: 0.2 });
    } else {
      A.set([loco], { fade: 0.2 });
      A.action(loco).timeScale = locoScale;
    }
    A.update(dt);
    if (this.bowProp) {
      // Keep the bow upright and facing the aim line, whatever the hand is doing.
      this.group.updateMatrixWorld(true);
      orientProp(this.bowProp, UP, this.aimDir);
    }
  }

  /** Short celebration after clearing a wave (only plays while standing still). */
  cheer() {
    this.cheerT = 2.2;
  }

  startRoll(input, game) {
    const d = config.dodge;
    const axis = input.axis();
    if (axis.x || axis.y) {
      this.rollDir
        .set(game.camRight.x * axis.x + game.camForward.x * axis.y, 0, game.camRight.z * axis.x + game.camForward.z * axis.y)
        .normalize();
    } else {
      this.rollDir.copy(this.aimDir).negate(); // standing still: hop back, away from your aim
    }
    this.rolling = true;
    this.rollT = 0;
    this.dodgeBuffer = 0;
    this.charges--;
    if (this.drawing && d.cancelsDraw) {
      this.drawing = false;
      game.sfx.drawStop();
    }
    game.onDodge();
  }

  release(game) {
    const cfg = config.bow;
    const charge = this.charge;
    const phase = this.drawPhase;
    const perfect = phase === 'perfect';
    const mega = phase === 'mega';
    this.drawing = false;
    this.cooldown = cfg.fireCooldown;
    this.recoil = mega ? 1.6 : 0.5 + 0.5 * charge;
    this.releaseT = 0.35;
    game.sfx.drawStop();

    let damage = lerp(cfg.minDamage, cfg.maxDamage, charge) * (1 + 0.2 * lv('heavyDraw') * charge);
    if (perfect) damage *= cfg.perfectMultiplier;
    if (mega) damage *= 3;
    const speed = lerp(cfg.minArrowSpeed, cfg.maxArrowSpeed, charge) * (mega ? 1.2 : 1);
    const origin = new THREE.Vector3(this.pos.x, ARROW_HEIGHT, this.pos.z).addScaledVector(this.aimDir, 0.7);
    game.fireArrow(origin, this.aimDir.clone(), speed, damage, charge, perfect, { mega });

    const split = lv('splitShot');
    if (split && charge >= 1) {
      const angles = split >= 3 ? [-0.34, -0.17, 0.17, 0.34] : [-0.2, 0.2];
      const factor = split >= 2 ? 1 : 0.5;
      for (const a of angles) {
        const dir = this.aimDir.clone().applyAxisAngle(UP, a);
        game.fireArrow(origin, dir, speed, damage * factor, charge, perfect, { mega, extra: true });
      }
    }

    if (perfect && lv('refresh') && this.charges < stat.dodgeCharges()) {
      this.refillDodge();
      game.onRefresh();
    }
  }

  /** Returns true if damage landed, 'dodged' if a roll avoided it, false otherwise. */
  takeDamage(amount, dir, game) {
    if (this.dead) return false;
    if (this.rollInvuln) return 'dodged';
    if (this.iframes > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.iframes = config.player.iFrames;
    this.hurtFlash = 0.25;
    this.hitT = 0.35;
    this.knock.addScaledVector(dir, 10);
    if (this.drawing) {
      // Getting hit cancels your draw: protects the "don't get greedy" tension.
      this.drawing = false;
      game.sfx.drawStop();
    }
    if (this.hp <= 0) this.dead = true;
    return true;
  }

  updateBow() {
    const c = this.charge;
    const phase = this.drawPhase;
    const pull = 0.42 * c;
    const p = this.string.geometry.attributes.position;
    p.setZ(1, -pull);
    p.needsUpdate = true;
    // Limbs flex a little as you draw.
    this.limb.scale.set(1, 1 - 0.08 * c, 1 + 0.15 * c);
    this.nocked.visible = this.drawing;
    this.nocked.position.set(0, 0, 0.5 - pull);
    // Overdrawn: the bow trembles (harder while charging a mega-shot).
    const shake = phase === 'late' ? 0.025 : phase === 'overcharge' ? 0.02 + 0.04 * this.overchargeProgress : phase === 'mega' ? 0.07 : 0;
    this.bow.position.x = 0.05 + (Math.random() - 0.5) * shake;
    this.bow.position.y = 1.05 + (Math.random() - 0.5) * shake;
    const glow = phase === 'perfect' || this.counterT > 0 ? 1 : 0;
    if (phase === 'mega' || phase === 'overcharge') {
      const m = phase === 'mega' ? 1 : this.overchargeProgress * 0.6;
      this.bowMat.emissive.setRGB(2 * m, 0.3 * m, 1.6 * m);
    } else {
      this.bowMat.emissive.setRGB(1.2 * glow, 0.8 * glow, 0.2 * glow);
    }
    this.bow.visible = !this.rolling;
  }

  updateIndicators() {
    const phase = this.drawPhase;
    const c = this.charge;
    this.targetRing.position.set(this.pos.x, 0.04, this.pos.z);
    this.chargeRing.position.set(this.pos.x, 0.05, this.pos.z);
    this.aimLine.position.set(this.pos.x, 0.03, this.pos.z);
    this.aimLine.rotation.y = Math.atan2(this.aimDir.x, this.aimDir.z);

    if (phase === 'none' && this.counterT > 0) {
      // Counter ready: pulsing gold ring says "tap to fire a perfect shot".
      this.targetRingMat.color.copy(RING_PERFECT);
      this.targetRingMat.opacity = 0.4 + 0.3 * Math.sin(performance.now() * 0.02);
      this.chargeRingMat.opacity = 0;
      this.aimMat.color.copy(RING_PERFECT);
      this.aimMat.opacity = 0.25;
      this.aimLine.scale.z = config.bow.range * 0.6;
      return;
    }
    if (phase === 'none') {
      this.targetRingMat.opacity = 0;
      this.chargeRingMat.opacity = 0;
      this.aimMat.color.copy(RING_IDLE);
      this.aimMat.opacity = 0.08;
      this.aimLine.scale.z = 3;
      return;
    }
    // With Overdraw, the ring keeps closing inward after the perfect window.
    const over = phase === 'overcharge' || phase === 'mega' ? this.overchargeProgress : 0;
    this.chargeRing.scale.setScalar(over > 0 ? lerp(1, 0.45, over) : lerp(2.6, 1, c));
    this.targetRingMat.opacity = 0.35;
    this.chargeRingMat.opacity = 0.35 + 0.5 * c;
    const col =
      phase === 'perfect'
        ? RING_PERFECT
        : phase === 'late'
          ? RING_LATE
          : phase === 'overcharge'
            ? RING_OVER
            : phase === 'mega'
              ? RING_MEGA
              : RING_IDLE;
    this.chargeRingMat.color.copy(col);
    this.targetRingMat.color.copy(col);
    this.aimMat.opacity = 0.12 + 0.3 * c;
    this.aimLine.scale.z = lerp(3, config.bow.range * 0.6, c);
    this.aimMat.color.copy(phase === 'perfect' ? RING_PERFECT : phase === 'mega' ? RING_MEGA : RING_IDLE);
  }

  hideIndicators() {
    this.targetRingMat.opacity = 0;
    this.chargeRingMat.opacity = 0;
    this.aimMat.opacity = 0;
  }

  updateMaterials() {
    const f = this.hurtFlash > 0 ? this.hurtFlash / 0.25 : 0;
    const ghost = this.rollInvuln ? 1 : 0; // faint blue tint = can't be hit
    this.bodyMat.emissive.setRGB(f * 1.5 + ghost * 0.04, ghost * 0.08, ghost * 0.22);
    if (this.model) {
      for (const m of this.model.materials) m.emissive.setRGB(f * 0.9 + ghost * 0.04, ghost * 0.08, ghost * 0.22);
    }
    // Blink while invulnerable.
    const shown = this.dead || this.iframes <= 0 || Math.floor(this.iframes * 20) % 2 === 0;
    if (this.model) this.model.holder.visible = shown;
    else this.rig.visible = shown;
  }
}
