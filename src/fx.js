import * as THREE from 'three';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpColor = new THREE.Color();
const dummy = new THREE.Object3D();

/** Pooled cube particles drawn with a single InstancedMesh. */
export class Particles {
  constructor(scene, max = 700) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.p = Array.from({ length: max }, () => ({
      life: 0,
      max: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      size: 0.1,
      grav: 0,
      drag: 0,
      spin: 0,
    }));
    this.cursor = 0;
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, ZERO);
    scene.add(this.mesh);
  }

  spawn(pos, o = {}) {
    const { count = 10, color = 0xffffff, speed = 4, up = 2, life = 0.6, size = 0.12, gravity = 12, drag = 2, dir = null, spread = 0.6 } = o;
    if (Array.isArray(color)) tmpColor.setRGB(color[0], color[1], color[2]);
    else tmpColor.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const p = this.p[i];
      p.life = p.max = life * (0.6 + Math.random() * 0.8);
      p.pos.copy(pos);
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (dir) v.multiplyScalar(spread).add(dir).normalize();
      p.vel.copy(v).multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      p.vel.y += up * Math.random();
      p.size = size * (0.6 + Math.random() * 0.8);
      p.grav = gravity;
      p.drag = drag;
      p.spin = Math.random() * 10;
      this.mesh.setColorAt(i, tmpColor);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.03) {
        p.pos.y = 0.03;
        p.vel.y *= -0.3;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.spin * p.life, p.spin * 0.7 * p.life, 0);
      dummy.scale.setScalar(p.size * Math.min(1, (p.life / p.max) * 1.5));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.max; i++) {
      this.p[i].life = 0;
      this.mesh.setMatrixAt(i, ZERO);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Floating damage numbers / callouts as DOM elements projected from world space. */
export class DamageNumbers {
  constructor(container, camera) {
    this.container = container;
    this.camera = camera;
    this.items = [];
    this.v = new THREE.Vector3();
  }

  spawn(pos, text, kind = 'normal') {
    const el = document.createElement('div');
    el.className = `dmg ${kind}`;
    el.textContent = text;
    this.container.appendChild(el);
    const life = kind === 'perfect' || kind === 'callout' ? 1.1 : 0.8;
    this.items.push({
      el,
      pos: pos.clone(),
      vy: kind === 'callout' ? 1.2 : 2.6,
      dx: (Math.random() - 0.5) * 30,
      life,
      max: life,
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        it.el.remove();
        this.items.splice(i, 1);
        continue;
      }
      it.pos.y += it.vy * dt;
      it.vy *= Math.pow(0.1, dt);
      this.v.copy(it.pos).project(this.camera);
      const x = (this.v.x * 0.5 + 0.5) * innerWidth + it.dx;
      const y = (-this.v.y * 0.5 + 0.5) * innerHeight;
      const t = it.life / it.max;
      const pop = 1 + 0.7 * Math.max(0, (t - 0.8) / 0.2);
      it.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${pop})`;
      it.el.style.opacity = Math.min(1, t * 3);
    }
  }

  clear() {
    for (const it of this.items) it.el.remove();
    this.items.length = 0;
  }
}

/** Trauma-based screen shake. */
export class Shake {
  constructor() {
    this.trauma = 0;
    this.t = 0;
  }
  add(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.t += dt;
  }
  offset(out, strength) {
    const s = this.trauma * this.trauma * 0.9 * strength;
    const t = this.t;
    out.set(
      s * Math.sin(t * 47.3) * Math.cos(t * 13.7 + 1.1),
      s * Math.sin(t * 39.1 + 2.3) * Math.cos(t * 17.9),
      s * Math.sin(t * 43.7 + 4.1) * Math.cos(t * 11.3 + 0.7),
    );
    return out;
  }
}
