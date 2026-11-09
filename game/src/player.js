import * as THREE from 'three';
import { heightAt, WATER_LEVEL } from './terrain.js';
import { mergeParts, mtx } from './util.js';
import { clamp, lerp } from './noise.js';

const EYE = 1.68;

function toolGeo(id) {
  const P = [];
  const handle = (len = 0.7, col = 0x6b4a2b) => P.push({ geo: new THREE.CylinderGeometry(0.025, 0.03, len, 6), color: col, matrix: mtx(0, len / 2 - 0.1, 0) });
  switch (id) {
    case 'hatchet': handle(); P.push({ geo: new THREE.DodecahedronGeometry(0.09), color: 0x888078, matrix: mtx(0.06, 0.52, 0, 0, 0, 0, 1.4, 0.9, 0.5) }); P.push({ geo: new THREE.TorusGeometry(0.035, 0.012, 4, 8), color: 0xc8b48a, matrix: mtx(0, 0.5, 0, Math.PI / 2, 0, 0) }); break;
    case 'pick': handle(); P.push({ geo: new THREE.ConeGeometry(0.04, 0.32, 5), color: 0x8a8278, matrix: mtx(0.15, 0.55, 0, 0, 0, -Math.PI / 2) }); P.push({ geo: new THREE.ConeGeometry(0.04, 0.22, 5), color: 0x8a8278, matrix: mtx(-0.1, 0.55, 0, 0, 0, Math.PI / 2) }); break;
    case 'metalpick': handle(); P.push({ geo: new THREE.ConeGeometry(0.04, 0.36, 5), color: 0xb8bcc4, matrix: mtx(0.16, 0.56, 0, 0, 0, -Math.PI / 2) }); P.push({ geo: new THREE.ConeGeometry(0.04, 0.26, 5), color: 0xb8bcc4, matrix: mtx(-0.12, 0.56, 0, 0, 0, Math.PI / 2) }); break;
    case 'metalhatchet': handle(); P.push({ geo: new THREE.BoxGeometry(0.2, 0.14, 0.03), color: 0xc0c4cc, matrix: mtx(0.08, 0.52, 0) }); break;
    case 'sword': P.push({ geo: new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), color: 0x4a3420, matrix: mtx(0, 0, 0) }); P.push({ geo: new THREE.BoxGeometry(0.2, 0.03, 0.04), color: 0x8a7a50, matrix: mtx(0, 0.11, 0) }); P.push({ geo: new THREE.BoxGeometry(0.05, 0.75, 0.012), color: 0xd0d4dc, matrix: mtx(0, 0.5, 0) }); break;
    case 'primalblade': P.push({ geo: new THREE.CylinderGeometry(0.028, 0.028, 0.22, 6), color: 0x2a1a14, matrix: mtx(0, 0, 0) }); P.push({ geo: new THREE.BoxGeometry(0.24, 0.04, 0.05), color: 0xc8a040, matrix: mtx(0, 0.12, 0) }); P.push({ geo: new THREE.ConeGeometry(0.05, 0.95, 4), color: 0xf0e6d0, matrix: mtx(0, 0.62, 0) }); P.push({ geo: new THREE.BoxGeometry(0.02, 0.7, 0.02), color: 0xff5a2a, matrix: mtx(0, 0.5, 0.03) }); break;
    case 'lantern': P.push({ geo: new THREE.CylinderGeometry(0.015, 0.015, 0.25, 5), color: 0x3a3a3c, matrix: mtx(0, 0.1, 0) }); P.push({ geo: new THREE.CylinderGeometry(0.05, 0.06, 0.03, 8), color: 0x2a2a2c, matrix: mtx(0, 0.24, 0) }); P.push({ geo: new THREE.CylinderGeometry(0.05, 0.06, 0.03, 8), color: 0x2a2a2c, matrix: mtx(0, 0.4, 0) }); P.push({ geo: new THREE.OctahedronGeometry(0.06), color: 0xbff0ff, matrix: mtx(0, 0.32, 0, 0, 0, 0, 1, 1.4, 1) }); break;
    case 'obsidianspear': handle(1.6); P.push({ geo: new THREE.OctahedronGeometry(0.07), color: 0x1a1620, matrix: mtx(0, 1.62, 0, 0, 0, 0, 1, 3, 1) }); break;
    case 'club': P.push({ geo: new THREE.CylinderGeometry(0.06, 0.03, 0.75, 7), color: 0x5a3e24, matrix: mtx(0, 0.28, 0) }); break;
    case 'spear': handle(1.5); P.push({ geo: new THREE.ConeGeometry(0.04, 0.25, 4), color: 0xe9e2cf, matrix: mtx(0, 1.5, 0) }); break;
    case 'trident': handle(1.5, 0x3a4a5a); for (const x of [-0.07, 0, 0.07]) P.push({ geo: new THREE.ConeGeometry(0.02, x ? 0.22 : 0.3, 4), color: 0x9ae0ff, matrix: mtx(x, x ? 1.56 : 1.6, 0) }); P.push({ geo: new THREE.BoxGeometry(0.18, 0.03, 0.03), color: 0x9ae0ff, matrix: mtx(0, 1.45, 0) }); break;
    case 'huntressbow': {
      const curve = new THREE.TorusGeometry(0.47, 0.022, 5, 16, Math.PI * 0.9);
      P.push({ geo: curve, color: 0x2a2038, matrix: mtx(0, 0.3, 0, 0, 0, Math.PI * 0.55) });
      P.push({ geo: new THREE.OctahedronGeometry(0.04), color: 0xb08aff, matrix: mtx(0.33, 0.3, 0) });
      P.push({ geo: new THREE.CylinderGeometry(0.004, 0.004, 0.9, 3), color: 0xd8c8ff, matrix: mtx(-0.09, 0.3, 0) });
      break;
    }
    case 'bow': {
      const curve = new THREE.TorusGeometry(0.45, 0.018, 5, 16, Math.PI * 0.9);
      P.push({ geo: curve, color: 0x7a5530, matrix: mtx(0, 0.3, 0, 0, 0, Math.PI * 0.55) });
      P.push({ geo: new THREE.CylinderGeometry(0.004, 0.004, 0.88, 3), color: 0xeeeeee, matrix: mtx(-0.09, 0.3, 0) });
      break;
    }
    default: return null;
  }
  return mergeParts(P);
}

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.crouch = false;
    this.swimming = false;
    this.underwater = false;
    this.alive = true;
    this.mount = null;
    this.level = 1; this.xp = 0;
    this.maxHp = 100; this.hp = 100;
    this.maxStam = 100; this.stam = 100;
    this.food = 85; this.water = 85;
    this.stepT = 0;
    this.swing = 0; this.swingDir = 1;
    this.bob = 0;
    this.hurtT = 0;
    this.camDist = 9;

    // Viewmodel
    this.vm = new THREE.Group();
    camera.add(this.vm);
    scene.add(camera);
    const vmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    this.vmMat = vmMat;
    const skin = 0xc68e64, wrap = 0x6b5236;
    const arm = mergeParts([
      { geo: new THREE.CylinderGeometry(0.038, 0.05, 0.5, 10), color: skin, matrix: mtx(0, -0.25, 0) },
      { geo: new THREE.CylinderGeometry(0.052, 0.054, 0.14, 10), color: wrap, matrix: mtx(0, -0.06, 0) }, // leather wrist wrap
      { geo: new THREE.BoxGeometry(0.085, 0.09, 0.1), color: skin, matrix: mtx(0, 0.04, 0.005) },        // fist
      { geo: new THREE.BoxGeometry(0.09, 0.03, 0.035), color: 0xb87e56, matrix: mtx(0, 0.088, 0.03) },  // knuckles
      { geo: new THREE.BoxGeometry(0.03, 0.05, 0.03), color: skin, matrix: mtx(0.05, 0.03, 0.035, 0, 0, -0.4) }, // thumb
    ]);
    this.hand = new THREE.Group();
    this.hand.add(new THREE.Mesh(arm, vmMat));
    this.toolHolder = new THREE.Group();
    this.toolHolder.position.set(0, 0.05, 0);
    this.toolHolder.rotation.x = Math.PI / 2 - 0.3;
    this.hand.add(this.toolHolder);
    this.hand.rotation.set(-1.2, 0, 0.15);
    this.vm.add(this.hand);
    this.vm.position.set(0.32, -0.32, -0.55);
    this.vm.traverse((o) => { o.renderOrder = 10; });
    this.toolMeshes = {};
    this.equipped = null;
  }

  equip(id) {
    if (this.equipped === id) return;
    this.equipped = id;
    this.toolHolder.clear();
    const def = id && toolGeo(id);
    if (def) {
      if (!this.toolMeshes[id]) this.toolMeshes[id] = new THREE.Mesh(def, this.vmMat);
      this.toolHolder.add(this.toolMeshes[id]);
    }
    this.equipT = 0.3;
  }

  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + (this.crouch ? EYE - 0.55 : EYE), this.pos.z); }

  lookDir(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  addXP(n, hooks) {
    this.xp += n;
    const need = () => 40 + this.level * 30;
    while (this.xp >= need()) {
      this.xp -= need();
      this.level++;
      this.maxHp += 8; this.maxStam += 6; this.hp = this.maxHp; this.stam = this.maxStam;
      hooks?.levelUp?.(this.level);
    }
  }

  xpNeed() { return 40 + this.level * 30; }

  damage(n) {
    if (!this.alive) return;
    this.hp -= n;
    this.hurtT = 0.4;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }

  update(dt, input, world, building) {
    if (!this.alive) return;
    // look
    this.yaw -= input.mx * 0.0022 * input.sens;
    this.pitch = clamp(this.pitch - input.my * 0.0022 * input.sens * (input.invert ? -1 : 1), -1.5, 1.5);

    if (this.mount) return; // movement handled by mount

    const k = input.keys;
    const joy = input.joy || { x: 0, y: 0 };
    const fwd = clamp((k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) + joy.y, -1, 1);
    const str = clamp((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + joy.x, -1, 1);
    const mag = Math.min(1, Math.hypot(fwd, str));
    this.crouch = !!k.KeyC || !!k.ControlLeft;
    const groundH = Math.max(heightAt(this.pos.x, this.pos.z), building.floorAt(this.pos.x, this.pos.z) ?? -Infinity);
    this.swimming = this.pos.y < WATER_LEVEL - 1.1 && groundH < WATER_LEVEL - 1.1;
    const wantsSprint = (k.ShiftLeft || k.ShiftRight) && fwd > 0.3 && !this.crouch && this.stam > 1;
    let speed = this.swimming ? 3.2 : this.crouch ? 2.2 : wantsSprint ? 9.5 : 5.2;
    if (this.food <= 0 || this.water <= 0) speed *= 0.8;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const dx = -sinY * fwd + cosY * str, dz = -cosY * fwd - sinY * str;
    const len = Math.hypot(dx, dz) || 1;
    const tx = (dx / len) * speed * mag, tz = (dz / len) * speed * mag;
    const accel = this.onGround || this.swimming ? 12 : 3;
    this.vel.x = lerp(this.vel.x, tx, Math.min(1, dt * accel));
    this.vel.z = lerp(this.vel.z, tz, Math.min(1, dt * accel));

    const moving = mag > 0.05;
    if (wantsSprint && moving) this.stam = Math.max(0, this.stam - dt * 14);
    else if (this.swimming && moving) this.stam = Math.max(0, this.stam - dt * 4);
    else this.stam = Math.min(this.maxStam, this.stam + dt * (this.food > 0 && this.water > 0 ? 16 : 4));

    if (this.swimming) {
      const up = (k.Space ? 1 : 0) - (this.crouch ? 1 : 0);
      const targetY = up !== 0 ? up * 3 : (WATER_LEVEL - 1.25 - this.pos.y) * 2;
      this.vel.y = lerp(this.vel.y, targetY, Math.min(1, dt * 4));
      if (this.stam <= 0 && this.pos.y < WATER_LEVEL - 1.5) this.hp -= dt * 4;
    } else {
      this.vel.y -= 24 * dt;
      if (k.Space && this.onGround && this.stam > 8) { this.vel.y = 8; this.stam -= 8; this.onGround = false; }
    }

    this.pos.addScaledVector(this.vel, dt);
    world.collide(this.pos, 0.4);

    const g = Math.max(heightAt(this.pos.x, this.pos.z), (() => { const f = building.floorAt(this.pos.x, this.pos.z); return f !== null && f <= this.pos.y + 0.6 ? f : -Infinity; })());
    if (this.pos.y <= g) {
      if (this.vel.y < -16) this.damage((-this.vel.y - 16) * 4);
      this.pos.y = g; this.vel.y = Math.max(0, this.vel.y);
      this.onGround = true;
    } else this.onGround = this.pos.y - g < 0.05;
    this.underwater = this.eye.y < WATER_LEVEL - 0.1;

    // footstep timing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if ((this.onGround || this.swimming) && hs > 0.5) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) { this.stepT = 2.2; input.onStep?.(this.swimming || g < WATER_LEVEL + 0.1); }
    }
    this.bob += dt * hs * 1.6;
    this.hs = hs;
  }

  // survival stats tick
  survival(dt, hooks) {
    if (!this.alive) return;
    this.food = Math.max(0, this.food - dt * 0.11 * (this.hs > 6 ? 1.6 : 1));
    this.water = Math.max(0, this.water - dt * 0.16 * (this.hs > 6 ? 1.6 : 1));
    if (this.food <= 0 || this.water <= 0) this.hp -= dt * 1.2;
    else if (this.food > 30 && this.water > 30 && !(this.cold > 4)) this.hp = Math.min(this.maxHp, this.hp + dt * 0.6);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hp <= 0 && this.alive) { this.hp = 0; this.alive = false; }
  }

  updateCamera(dt, camera) {
    if (this.mount) {
      const m = this.mount;
      const h = (m.model.hipH + 1.6) * m.scale;
      const pivot = new THREE.Vector3(m.pos.x, m.pos.y + h, m.pos.z);
      const back = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch) + 0.25, Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
      const dist = this.camDist * Math.max(1, m.scale * (m.radius > 2 ? 1.4 : 0.8));
      const cp = pivot.clone().addScaledVector(back, dist);
      const gh = heightAt(cp.x, cp.z) + 0.5;
      if (cp.y < gh) cp.y = gh;
      camera.position.lerp(cp, Math.min(1, dt * 10));
      camera.lookAt(pivot);
      this.vm.visible = false;
      return;
    }
    this.vm.visible = true;
    const e = this.eye;
    camera.position.copy(e);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // view bob + swing
    const bob = this.onGround ? Math.sin(this.bob) * 0.012 * Math.min(1, this.hs / 5) : 0;
    camera.position.y += bob;
    this.swing = Math.max(0, this.swing - dt * 3.2);
    const s = Math.sin(Math.min(1, this.swing) * Math.PI);
    const sw = this.swing > 0 ? 1 - this.swing : 0;
    this.equipT = Math.max(0, (this.equipT || 0) - dt);
    this.vm.position.set(0.32 + Math.cos(this.bob * 0.5) * 0.01, -0.32 + Math.abs(Math.sin(this.bob * 0.5)) * 0.012 - this.equipT * 0.8, -0.55);
    if (this.equipped === 'bow' || this.equipped === 'huntressbow') {
      this.hand.rotation.set(-1.45 + s * 0.15, 0.25, 0.35 - (this.draw || 0) * 0.15);
      this.vm.position.x = 0.15;
    } else if (this.equipped === 'spear') {
      this.hand.rotation.set(-1.6 + s * 0.2, 0, 0.1);
      this.vm.position.z = -0.55 - s * 0.45;
    } else {
      this.hand.rotation.set(-1.2 - s * 1.3 + sw * 0.0, -s * 0.5, 0.15 + s * 0.4);
    }
  }
}
