import * as THREE from 'three';
import { config } from './config.js';
import { resolveCircle } from './world.js';
import { makeBowParts, holdInHand } from './bow.js';
import { gearStats, equipped, baseOf, onGearChange } from './gear.js';
import { makeArrowMesh } from './arrows.js';
import { stat, lv, OVERDRAW_TIME, buffs } from './skills.js';
import { models, outfits, instantiate, findBone, loadTexture, disposeInstance } from './models.js';
import { profile } from './profile.js';

export const PLAYER_RADIUS = 0.45;
export const ARROW_HEIGHT = 1.1;

const lerp = THREE.MathUtils.lerp;
const UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const BOW_CARRY_TILT = THREE.MathUtils.degToRad(55);
const MAX_TWIST = THREE.MathUtils.degToRad(100); // how far the upper body may turn from the legs
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _qRelax = new THREE.Quaternion();
const _qAim = new THREE.Quaternion();

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
    this.moveDir = new THREE.Vector3(0, 0, -1);
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
    this.indicators = [this.targetRing, this.chargeRing, this.aimLine];

    this.reset();
  }

  /**
   * A recurve bow built from curves, so it is clean from every angle and its
   * string really pulls back with the draw. Local frame: +Y along the limbs,
   * +Z toward the target, limbs curving back toward the archer, grip at the origin.
   */
  buildBow() {
    const bow = new THREE.Group();
    bow.position.set(0.05, 1.05, 0.42);
    bow.rotation.z = -0.25;
    const inner = new THREE.Group();
    bow.add(inner);
    const parts = makeBowParts();
    this.bowMat = parts.mat;
    this.bowGripMat = parts.grip.material = parts.grip.material.clone();
    this.limbs = parts.limbs;
    this.bowTip = parts.tip;
    inner.add(parts.limbs, parts.grip);
    const tip = parts.tip;

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([0, tip.y, tip.z, 0, 0, tip.z, 0, -tip.y, tip.z], 3));
    this.string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xf3ead2 }));
    this.string.frustumCulled = false;
    inner.add(this.string);

    this.nocked = makeArrowMesh(false);
    this.nocked.getObjectByName('trail').visible = false;
    this.nocked.visible = false;
    inner.add(this.nocked);

    this.bow = bow;
    this.bowInner = inner;
    this.stringKick = 0;
    this.rig.add(bow);
    this.applyGearLook();
    onGearChange(() => this.applyGearLook());
  }

  /** The equipped bow's look: wood colour and size by type, grip wrap by rarity. */
  applyGearLook() {
    const item = equipped('bow');
    if (!item) return;
    const base = baseOf(item);
    this.bowMat.color.set(base.color);
    this.bowInner.scale.setScalar(base.scale);
    this.bowGripMat.color.set(item.rarity === 'unique' ? 0xd8a23a : item.rarity === 'rare' ? 0x2c5a8a : 0x2e1f14);
    this.bowGripMat.metalness = item.rarity === 'unique' ? 0.7 : 0;
    this.bowGripMat.roughness = item.rarity === 'unique' ? 0.35 : 0.9;
  }

  /** Move the bow into the model's bow hand (it stays world-upright; see updateModel). */
  holdBow(hand) {
    if (!hand) return;
    holdInHand(this.bow, hand, 0.95);
    this.bowInHand = true;
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
    this.casting = 0;
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
    return (config.dodge.duration + config.dodge.cooldown) * stat.dodgeRecharge();
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
    this.cooldown -= dt;
    this.momentumT = Math.max(0, (this.momentumT || 0) - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.hitT = Math.max(0, this.hitT - dt);
    this.casting = Math.max(0, this.casting - dt);
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
    if ((input.mouse.down || input.mouse.clicked) && !this.drawing && this.cooldown <= 0 && !this.rolling && this.casting <= 0 && !(game.state === 'camp' && game.camp.openKind) && game.state !== 'title') {
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
      const axis = this.casting > 0 ? { x: 0, y: 0 } : input.axis();
      const speed = stat.moveSpeed() * (this.drawing ? stat.drawMove() : 1);
      const tx = (game.camRight.x * axis.x + game.camForward.x * axis.y) * speed;
      const tz = (game.camRight.z * axis.x + game.camForward.z * axis.y) * speed;
      const k = 1 - Math.exp(-(buffs.slippery ? 2.2 : 18) * dt); // ice: slow to start and stop
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      // Footsteps every ~1.6 units travelled.
      this.stepDist = (this.stepDist || 0) + Math.hypot(this.vel.x, this.vel.z) * dt;
      if (this.stepDist > 1.6) {
        this.stepDist = 0;
        game.sfx.step();
        game.particles.spawn(new THREE.Vector3(this.pos.x, 0.08, this.pos.z), { count: 3, color: 0x6a5c4c, speed: 0.8, up: 0.6, life: 0.45, size: 0.12, gravity: 1, drag: 3 });
      }
    }
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-10 * dt));
    (this.collide || resolveCircle)(this.pos, PLAYER_RADIUS);

    // Facing. The legs (the whole group) and the upper body are aimed separately:
    //  - not aiming: face where you run (or the cursor when standing still);
    //  - aiming, standing: the whole body takes the side-on archery stance;
    //  - aiming on the run: the legs run (or backpedal) along the movement, picking
    //    whichever keeps the upper body's turn smallest (never past 90°), and the
    //    spine makes up the rest (see applyTwist).
    const aimingNow = this.drawing || this.releaseT > 0 || this.casting > 0;
    const speedNow = Math.hypot(this.vel.x, this.vel.z);
    if (speedNow > 0.8) this.moveDir.set(this.vel.x, 0, this.vel.z).normalize();
    const still = speedNow < 0.8;
    const aimYaw = Math.atan2(this.aimDir.x, this.aimDir.z);
    const moveYaw = Math.atan2(this.moveDir.x, this.moveDir.z);
    const canTwist = !!this.spineBones?.length;
    // Body heading that puts the bow arm on the aim line (the archery stance is
    // side-on; armOffset is measured from the animation, see measureArm).
    const upperYaw = canTwist ? aimYaw - this.armOffset : aimYaw;
    let legYaw;
    this.backpedal = false;
    if (this.rolling) legYaw = Math.atan2(this.rollDir.x, this.rollDir.z);
    else if (!aimingNow) legYaw = still ? aimYaw : moveYaw;
    else if (still || !canTwist) legYaw = upperYaw;
    else {
      // Forward or backpedal, with some hysteresis so it doesn't flicker at the boundary.
      const fwd = Math.abs(wrapAngle(upperYaw - moveYaw));
      const back = Math.abs(wrapAngle(upperYaw - moveYaw - Math.PI));
      this.legsBack = this.legsBack ? back < fwd + 0.35 : back < fwd - 0.35;
      this.backpedal = this.legsBack;
      const base = this.legsBack ? moveYaw + Math.PI : moveYaw;
      // Angle the stride up to ~35° toward the stance (a strafe) so the spine twists less.
      legYaw = base + THREE.MathUtils.clamp(wrapAngle(upperYaw - base), -0.6, 0.6);
    }
    this.yaw = lerpAngle(this.yaw, legYaw, 1 - Math.exp(-(this.rolling ? 40 : 18) * dt));
    this.aimingNow = aimingNow;
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
  /**
   * The hand that holds the bow is the one the shoot clip pushes out straight at
   * full draw (the other pulls the string back to the face). Clips differ on
   * which side that is, so measure it instead of assuming the left hand.
   */
  bowHand(inst) {
    const L = findBone(inst.root, [/hand/i, /left|(^|[_.])l([_.]|$)/i]);
    const R = findBone(inst.root, [/hand/i, /right|(^|[_.])r([_.]|$)/i]);
    const head = findBone(inst.root, [/head/i]);
    const A = inst.animator;
    if (!L || !R || !head || !A.has('shoot')) return L || R;
    const a = A.action('shoot');
    a.reset().play();
    a.time = A.duration('shoot') * config.models.shootFullAt;
    A.mixer.update(0);
    inst.holder.updateMatrixWorld(true);
    const h = head.getWorldPosition(new THREE.Vector3());
    const reach = (bone) => {
      const p = bone.getWorldPosition(new THREE.Vector3());
      return Math.hypot(p.x - h.x, p.z - h.z);
    };
    const hand = reach(R) > reach(L) ? R : L;
    // While aiming, the bow hand's thumb points straight up. Remember that direction
    // in the hand's own frame: it's the bow's long axis for a relaxed grip.
    const fore = hand.getWorldPosition(new THREE.Vector3()).sub(hand.parent.getWorldPosition(new THREE.Vector3())).normalize();
    const thumb = UP.clone().addScaledVector(fore, -UP.dot(fore)).normalize();
    this.thumbLocal = thumb.applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()).invert());
    a.stop();
    A.mixer.update(0);
    return hand;
  }

  /** Use the selected character and outfit from the profile (called on load and from the camp). */
  attachModel() {
    const id = models[profile.character] ? profile.character : 'hero';
    this.setCharacter(id, profile.outfit[id] || 'default');
  }

  setCharacter(id, outfitId = 'default') {
    if (!models[id]) return;
    if (this.model) {
      this.model.holder.removeFromParent();
      this.anim?.mixer.stopAllAction();
      disposeInstance(this.model);
    }
    const height = id === 'dwarf' ? config.models.heroHeight * 0.82 : config.models.heroHeight;
    const inst = instantiate(id, height);
    if (!inst) return;
    this.model = inst;
    this.anim = inst.animator;
    this.characterId = id;
    this.rig.visible = false;
    this.group.add(inst.holder);
    const bowHand = this.bowHand(inst);
    this.holdBow(bowHand);
    const L = findBone(inst.root, [/hand/i, /left|(^|[_.])l([_.]|$)/i]);
    const R = findBone(inst.root, [/hand/i, /right|(^|[_.])r([_.]|$)/i]);
    this.stringHand = bowHand === L ? R : L;
    // The side-on stance: the bow arm points this far round from the body heading.
    this.armOffset = -THREE.MathUtils.degToRad(config.models.heroAimYaw);
    this.twist = 0;
    this.spineBase = null;
    // Spine bones (root to chest) for the upper-body twist while aiming on the run.
    this.spineBones = [];
    inst.root.traverse((o) => o.isBone && /spine/i.test(o.name) && this.spineBones.push(o));
    this.applyOutfit(outfitId);
  }

  /** Swap the character's texture for an outfit painted on the same UV layout. */
  applyOutfit(outfitId) {
    if (!this.model) return;
    if (!this.baseMaps) this.baseMaps = new Map();
    const mats = this.model.materials;
    const o = outfits[outfitId];
    if (!o || o.base !== this.characterId) {
      return; // default look: the model's own texture
    }
    loadTexture(o.texture, (tex) => {
      if (this.model?.materials !== mats) return; // character changed meanwhile
      for (const m of mats) {
        m.map = tex;
        m.color.set(0xffffff);
        m.needsUpdate = true;
      }
    });
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
    // Without spine bones to twist, turn the whole model side-on while aiming instead.
    const yawTarget = aiming && !this.spineBones?.length ? THREE.MathUtils.degToRad(mc.heroAimYaw) : 0;
    this.model.holder.rotation.y += (yawTarget - this.model.holder.rotation.y) * (1 - Math.exp(-20 * dt));

    if (this.dead) {
      A.set(['death'], { once: true, fade: 0.1 });
    } else if (this.casting > 0 && A.has('shoot')) {
      // Loosing the volley: snap through the release of the shoot clip.
      A.set(['shoot'], { once: true, fade: 0.08, timeScale: 1.4 });
    } else if (this.rolling) {
      const rate = A.duration('roll') / config.dodge.duration;
      A.set(['roll'], { once: true, fade: 0.05, timeScale: rate || 1 });
    } else if (this.drawing || this.releaseT > 0) {
      // Moving: arms aim while the legs keep running. Standing still: the whole body
      // takes the archery stance (no idle sway in the legs).
      const shoot = moving && A.has('shoot:upper') ? 'shoot:upper' : 'shoot';
      // Legs: an aim-walk along the movement, played backwards when backpedalling.
      const lowerBase = moving && A.has('aimWalk') ? 'aimWalk' : loco;
      const lower = shoot === 'shoot:upper' ? `${lowerBase}:lower` : null;
      A.set(lower ? [shoot, lower] : [shoot], { fade: 0.12 });
      if (lower) A.action(lower).timeScale = locoScale * (this.backpedal ? -1 : 1);
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
        // Switched between full-body and upper-body mid follow-through: don't replay the draw.
        if (a.time < dur * mc.shootReleaseAt) a.time = dur * mc.shootReleaseAt;
      }
    } else if (this.hitT > 0 && A.has('hit')) {
      A.set(['hit'], { once: true, fade: 0.06 });
    } else if (this.cheerT > 0 && !moving && A.has('victory')) {
      A.set(['victory'], { once: true, fade: 0.2 });
    } else {
      A.set([loco], { fade: 0.2 });
      A.action(loco).timeScale = locoScale;
    }
    // A held (scrubbed) clip doesn't always rewrite the spine, so put back last
    // frame's untwisted spine first; otherwise each frame's twist would pile up.
    const spine = this.spineBones || [];
    if (this.spineBase) spine.forEach((b, i) => b.quaternion.copy(this.spineBase[i]));
    A.update(dt);
    this.spineBase ||= spine.map(() => new THREE.Quaternion());
    spine.forEach((b, i) => this.spineBase[i].copy(b.quaternion));
    this.measureArm();
    this.applyTwist(dt);
    if (this.bowInHand) this.poseBow(dt);
  }

  /**
   * The bow sits in the palm (not the wrist pivot) and follows the hand: relaxed,
   * its limbs run along the thumb and its front along the forearm, so it swings and
   * tilts with the arm. While drawing it eases into an exact upright pose on the aim
   * line. The two poses blend as rotations, so it never flips or spins.
   */
  poseBow(dt) {
    const hand = this.bow.parent;
    const aiming = this.drawing || this.releaseT > 0;
    this.bowAim = (this.bowAim || 0) + ((aiming ? 1 : 0) - (this.bowAim || 0)) * (1 - Math.exp(-(aiming ? 16 : 8) * dt));
    this.group.updateMatrixWorld(true);
    const wrist = hand.getWorldPosition(_v1);
    const fore = _v2.copy(wrist).sub(hand.parent.getWorldPosition(_v3));
    const foreLen = fore.length();
    fore.normalize();
    // Relaxed: limbs along the thumb (kept square to the forearm), front along the forearm.
    hand.getWorldQuaternion(_q1);
    const limb = _v3.copy(this.thumbLocal || UP).applyQuaternion(_q1);
    limb.addScaledVector(fore, -limb.dot(fore)).normalize();
    // Tip the upper limb back up the arm, so with the arm hanging the bow rests
    // mostly upright along the leg, upper limb forward, as archers carry one.
    limb.multiplyScalar(Math.cos(BOW_CARRY_TILT)).addScaledVector(fore, -Math.sin(BOW_CARRY_TILT)).normalize();
    const front = _v5.copy(fore).addScaledVector(limb, -fore.dot(limb)).normalize();
    _m1.makeBasis(_v4.crossVectors(limb, front), limb, front);
    _qRelax.setFromRotationMatrix(_m1);
    // Aiming: upright, front on the aim line.
    const aimYaw = Math.atan2(this.aimDir.x, this.aimDir.z);
    _v5.set(Math.sin(aimYaw), 0, Math.cos(aimYaw));
    _m1.makeBasis(_v4.crossVectors(UP, _v5), UP, _v5);
    _qAim.setFromRotationMatrix(_m1);
    _qRelax.slerp(_qAim, this.bowAim);
    this.bow.quaternion.copy(hand.getWorldQuaternion(_q2).invert().multiply(_qRelax));
    // Grip in the palm, a little past the wrist joint.
    const grip = _v4.copy(wrist).addScaledVector(fore, foreLen * 0.32);
    this.bow.position.copy(hand.worldToLocal(grip));
  }

  /**
   * Where does the bow arm point in this frame's pose (before any twist)? The
   * direction from the string hand to the bow hand, compared with the aim, gives
   * the spine turn needed; compared with the body heading, it gives armOffset.
   */
  measureArm() {
    this.twistTarget = 0;
    if (!this.aimingNow || this.rolling || !this.spineBones?.length || !this.stringHand) return;
    this.group.updateMatrixWorld(true);
    const b = this.bow.parent.getWorldPosition(_v1);
    const s = this.stringHand.getWorldPosition(_v2);
    const dx = b.x - s.x;
    const dz = b.z - s.z;
    if (Math.hypot(dx, dz) < 0.25) return; // hands together (reaching for an arrow): no reading
    const armYaw = Math.atan2(dx, dz);
    this.armOffset = lerpAngle(this.armOffset, wrapAngle(armYaw - this.yaw), 0.1);
    this.twistTarget = THREE.MathUtils.clamp(wrapAngle(Math.atan2(this.aimDir.x, this.aimDir.z) - armYaw), -MAX_TWIST, MAX_TWIST);
  }

  /**
   * Turn the spine toward the aim, spread over the spine bones, around the world
   * up axis (on top of whatever the clip is doing). Eases in and out.
   */
  applyTwist(dt) {
    // Plain (not wrapped) easing: the target is clamped to ±MAX_TWIST, so this stays bounded.
    this.twist = (this.twist || 0) + ((this.twistTarget || 0) - (this.twist || 0)) * (1 - Math.exp(-18 * dt));
    const bones = this.spineBones;
    if (!bones?.length || Math.abs(this.twist) < 1e-3) return;
    const per = this.twist / bones.length;
    for (const b of bones) {
      b.parent.updateWorldMatrix(true, false);
      b.parent.getWorldQuaternion(_q1);
      _axis.copy(UP).applyQuaternion(_q1.invert());
      b.quaternion.premultiply(_q2.setFromAxisAngle(_axis, per));
    }
  }

  /** Short celebration after clearing a wave (only plays while standing still). */
  cheer() {
    this.cheerT = 2.2;
  }

  startRoll(input, game) {
    const d = config.dodge;
    if (gearStats().perk('momentum')) this.momentumT = 3;
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
    this.stringKick = 1;
    game.sfx.drawStop();

    let damage = lerp(cfg.minDamage, cfg.maxDamage, charge) * (1 + 0.2 * lv('heavyDraw') * charge) * stat.damage() * (game.mods?.damage || 1);
    if (perfect) damage *= cfg.perfectMultiplier * (1 + gearStats().perk('keenEye'));
    if (mega) damage *= 3;
    // Momentum (gear): the first shot after a dodge hits harder.
    if (this.momentumT > 0) {
      damage *= 1 + gearStats().perk('momentum');
      this.momentumT = 0;
    }
    const speed = lerp(cfg.minArrowSpeed, cfg.maxArrowSpeed, charge) * (mega ? 1.2 : 1) * stat.arrowSpeed();
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
    amount *= stat.damageTaken() * (game?.difficulty?.enemyDamage || 1) * (game?.mods?.taken || 1);
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
    const tip = this.bowTip;
    // The string pulls back to the nock with the draw, then snaps forward and
    // quivers for a moment after release.
    this.stringKick *= 0.82;
    const pull = this.drawing ? 0.45 * c : 0;
    const quiver = Math.sin(performance.now() * 0.09) * 0.03 * this.stringKick;
    const p = this.string.geometry.attributes.position;
    p.setZ(1, tip.z - pull + quiver);
    // Limbs flex as you draw: tips come back and in.
    const flex = this.drawing ? c : 0;
    this.limbs.scale.set(1, 1 - 0.06 * flex, 1 + 0.35 * flex);
    p.setY(0, tip.y * (1 - 0.06 * flex));
    p.setZ(0, tip.z * (1 + 0.35 * flex));
    p.setY(2, -tip.y * (1 - 0.06 * flex));
    p.setZ(2, tip.z * (1 + 0.35 * flex));
    p.needsUpdate = true;
    this.nocked.visible = this.drawing;
    this.nocked.position.set(0, 0, tip.z - pull + 0.5);
    // Overdrawn: the bow trembles (harder while charging a mega-shot).
    const shake = phase === 'late' ? 0.012 : phase === 'overcharge' ? 0.01 + 0.025 * this.overchargeProgress : phase === 'mega' ? 0.04 : 0;
    this.bowInner.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
    const glow = phase === 'perfect' || this.counterT > 0 ? 1 : 0;
    if (phase === 'mega' || phase === 'overcharge') {
      const m = phase === 'mega' ? 1 : this.overchargeProgress * 0.6;
      this.bowMat.emissive.setRGB(2 * m, 0.3 * m, 1.6 * m);
    } else {
      this.bowMat.emissive.setRGB(1.2 * glow, 0.8 * glow, 0.2 * glow);
    }
    this.bow.visible = !this.rolling || this.bowInHand;
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
