import * as THREE from 'three';
import { config } from './config.js';
import { resolveCircle } from './world.js';
import { makeArrowMesh } from './arrows.js';

export const PLAYER_RADIUS = 0.45;
export const ARROW_HEIGHT = 1.1;

const lerp = THREE.MathUtils.lerp;

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const RING_IDLE = new THREE.Color(0xffffff);
const RING_PERFECT = new THREE.Color(3, 2.2, 0.6);
const RING_LATE = new THREE.Color(0x777777);

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, -1);
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
    this.hp = config.player.maxHp;
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
    this.rig.rotation.set(0, 0, 0);
    this.rig.position.set(0, 0, 0);
    this.group.visible = true;
  }

  get charge() {
    return this.drawing ? Math.min(this.drawT / config.bow.drawTime, 1) : 0;
  }

  /** 'none' | 'charging' | 'perfect' | 'late' */
  get drawPhase() {
    if (!this.drawing) return 'none';
    const { drawTime, perfectWindow } = config.bow;
    if (this.drawT < drawTime) return 'charging';
    if (this.drawT <= drawTime + perfectWindow) return 'perfect';
    return 'late';
  }

  update(dt, input, aimPoint, game) {
    const bowCfg = config.bow;
    this.cooldown -= dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);

    if (this.dead) {
      this.deathT += dt;
      this.rig.rotation.x = -Math.min(1, this.deathT * 3) * Math.PI * 0.5;
      this.hideIndicators();
      this.updateMaterials();
      return;
    }

    // Aim
    const ax = aimPoint.x - this.pos.x;
    const az = aimPoint.z - this.pos.z;
    if (ax * ax + az * az > 0.04) this.aimDir.set(ax, 0, az).normalize();

    // Draw / release
    if ((input.mouse.down || input.mouse.clicked) && !this.drawing && this.cooldown <= 0) {
      this.drawing = true;
      this.drawT = 0;
      this.perfectCued = false;
      game.sfx.drawStart(bowCfg.drawTime);
    }
    if (this.drawing) {
      this.drawT += dt;
      if (!this.perfectCued && this.drawT >= bowCfg.drawTime) {
        this.perfectCued = true;
        game.sfx.perfectReady();
      }
      if (!input.mouse.down) this.release(game);
    }

    // Movement (screen-relative)
    const axis = input.axis();
    const speed = config.player.moveSpeed * (this.drawing ? bowCfg.drawMoveMultiplier : 1);
    const tx = (game.camRight.x * axis.x + game.camForward.x * axis.y) * speed;
    const tz = (game.camRight.z * axis.x + game.camForward.z * axis.y) * speed;
    const k = 1 - Math.exp(-18 * dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-10 * dt));
    resolveCircle(this.pos, PLAYER_RADIUS);

    // Facing follows aim
    this.yaw = lerpAngle(this.yaw, Math.atan2(this.aimDir.x, this.aimDir.z), 1 - Math.exp(-25 * dt));
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    // Walk bob
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.walkT += dt * moving * 1.6;
    this.rig.position.y = Math.abs(Math.sin(this.walkT)) * 0.06 * Math.min(1, moving / 3);
    this.rig.rotation.x = -this.recoil * 0.15;

    this.updateBow();
    this.updateIndicators();
    this.updateMaterials();
  }

  release(game) {
    const cfg = config.bow;
    const charge = Math.min(this.drawT / cfg.drawTime, 1);
    const perfect = this.drawPhase === 'perfect';
    this.drawing = false;
    this.cooldown = cfg.fireCooldown;
    this.recoil = 0.5 + 0.5 * charge;
    game.sfx.drawStop();

    const damage = lerp(cfg.minDamage, cfg.maxDamage, charge) * (perfect ? cfg.perfectMultiplier : 1);
    const speed = lerp(cfg.minArrowSpeed, cfg.maxArrowSpeed, charge);
    const origin = new THREE.Vector3(this.pos.x, ARROW_HEIGHT, this.pos.z).addScaledVector(this.aimDir, 0.7);
    game.fireArrow(origin, this.aimDir.clone(), speed, damage, charge, perfect);
  }

  takeDamage(amount, dir, game) {
    if (this.dead || this.iframes > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.iframes = config.player.iFrames;
    this.hurtFlash = 0.25;
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
    // Overdrawn: the bow trembles.
    const shake = phase === 'late' ? 0.025 : 0;
    this.bow.position.x = 0.05 + (Math.random() - 0.5) * shake;
    this.bow.position.y = 1.05 + (Math.random() - 0.5) * shake;
    this.bowMat.emissive.setRGB(phase === 'perfect' ? 1.2 : 0, phase === 'perfect' ? 0.8 : 0, phase === 'perfect' ? 0.2 : 0);
  }

  updateIndicators() {
    const phase = this.drawPhase;
    const c = this.charge;
    this.targetRing.position.set(this.pos.x, 0.04, this.pos.z);
    this.chargeRing.position.set(this.pos.x, 0.05, this.pos.z);
    this.aimLine.position.set(this.pos.x, 0.03, this.pos.z);
    this.aimLine.rotation.y = Math.atan2(this.aimDir.x, this.aimDir.z);

    if (phase === 'none') {
      this.targetRingMat.opacity = 0;
      this.chargeRingMat.opacity = 0;
      this.aimMat.opacity = 0.08;
      this.aimLine.scale.z = 3;
      return;
    }
    this.chargeRing.scale.setScalar(lerp(2.6, 1, c));
    this.targetRingMat.opacity = 0.35;
    this.chargeRingMat.opacity = 0.35 + 0.5 * c;
    const col = phase === 'perfect' ? RING_PERFECT : phase === 'late' ? RING_LATE : RING_IDLE;
    this.chargeRingMat.color.copy(col);
    this.targetRingMat.color.copy(col);
    this.aimMat.opacity = 0.12 + 0.3 * c;
    this.aimLine.scale.z = lerp(3, config.bow.range * 0.6, c);
    this.aimMat.color.copy(phase === 'perfect' ? RING_PERFECT : RING_IDLE);
  }

  hideIndicators() {
    this.targetRingMat.opacity = 0;
    this.chargeRingMat.opacity = 0;
    this.aimMat.opacity = 0;
  }

  updateMaterials() {
    const f = this.hurtFlash > 0 ? this.hurtFlash / 0.25 : 0;
    this.bodyMat.emissive.setRGB(f * 1.5, 0, 0);
    // Blink while invulnerable.
    this.rig.visible = this.dead || this.iframes <= 0 || Math.floor(this.iframes * 20) % 2 === 0;
  }
}
