// Particles, slash trails, shockwaves, telegraphs, floating combat text, screen shake.
import * as THREE from 'three';
import { G } from './state.js';

const MAX = 6000;

class Particles {
  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float scale;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize = size*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 p=gl_PointCoord-.5; float d=length(p); if(d>.5) discard; float a=pow(1.-d*2.,1.6)*vA; gl_FragColor=vec4(vC*a,a); }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.s0 = new Float32Array(MAX);
    this.s1 = new Float32Array(MAX);
    this.c0 = new Float32Array(MAX * 3);
    this.c1 = new Float32Array(MAX * 3);
    this.head = 0;
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -9999;
  }
  emit(o) {
    const n = Math.max(1, Math.round((o.count || 10) * (G.settings?.reducedMotion ? 0.5 : 1)));
    const c0 = new THREE.Color(o.color || '#ffaa44'), c1 = new THREE.Color(o.color2 || o.color || '#ff4400');
    for (let k = 0; k < n; k++) {
      const i = this.head; this.head = (this.head + 1) % MAX;
      const sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      if (o.dir) { dx = o.dir.x + dx * (o.spread ?? 0.4); dy = o.dir.y + dy * (o.spread ?? 0.4); dz = o.dir.z + dz * (o.spread ?? 0.4); }
      if (o.up) dy = Math.abs(dy) * o.up + o.up * 0.5;
      if (o.flat) dy *= 0.15;
      const l = Math.hypot(dx, dy, dz) || 1;
      const r = o.radius || 0;
      const ra = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
      this.pos[i * 3] = o.pos.x + Math.cos(ra) * rr;
      this.pos[i * 3 + 1] = o.pos.y + (o.height ? Math.random() * o.height : 0);
      this.pos[i * 3 + 2] = o.pos.z + Math.sin(ra) * rr;
      this.vel[i * 3] = (dx / l) * sp; this.vel[i * 3 + 1] = (dy / l) * sp; this.vel[i * 3 + 2] = (dz / l) * sp;
      const life = (o.life ?? 0.7) * (0.6 + Math.random() * 0.7);
      this.life[i] = life; this.max[i] = life;
      this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 1.5;
      const s = (o.size ?? 0.25) * (0.6 + Math.random() * 0.8);
      this.s0[i] = s; this.s1[i] = s * (o.shrink ?? 0.1);
      this.c0[i * 3] = c0.r; this.c0[i * 3 + 1] = c0.g; this.c0[i * 3 + 2] = c0.b;
      this.c1[i * 3] = c1.r; this.c1[i * 3 + 1] = c1.g; this.c1[i * 3 + 2] = c1.b;
    }
  }
  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.pos[i * 3 + 1] = -9999; } continue; }
      this.life[i] -= dt;
      const k = 1 - this.life[i] / this.max[i];
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = Math.min(1, (1 - k) * 2.2) * Math.min(1, k * 12 + 0.2);
      for (let c = 0; c < 3; c++) this.col[i * 3 + c] = this.c0[i * 3 + c] + (this.c1[i * 3 + c] - this.c0[i * 3 + c]) * k;
    }
    if (this.gpuAttrs) { for (const a of this.gpuAttrs) a.needsUpdate = true; return; }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
  }
}

const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class FX {
  constructor() {
    this.root = new THREE.Group();
    this.p = new Particles();
    this.root.add(this.p.points);
    this.items = [];
    this.labels = document.getElementById('labels');
    this.texts = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.discGeo = new THREE.CircleGeometry(1, 48);
    this.v = new THREE.Vector3();
  }
  emit(o) { this.p.emit(o); }

  slash(pos, ry, color = '#ffe2a8', radius = 2.2, combo = 0, arc = 2) {
    const geo = new THREE.RingGeometry(radius * 0.45, radius, 32, 1, -arc / 2, arc);
    const m = new THREE.Mesh(geo, additive(color, 0.9));
    m.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.position.copy(pos); holder.rotation.y = ry + Math.PI / 2;
    holder.rotation.z = combo === 1 ? 0.3 : combo === 0 ? 0.6 : 0;
    if (combo === 2) { holder.rotation.z = 1.35; }
    holder.add(m);
    this.root.add(holder);
    this.items.push({ obj: holder, t: 0, dur: 0.22, update: (it, k) => { m.material.opacity = 0.9 * (1 - k); m.scale.setScalar(1 + k * 0.25); }, dispose: () => { geo.dispose(); m.material.dispose(); } });
  }

  shockwave(pos, radius = 4.5, color = '#ffb347', dur = 0.5) {
    const m = new THREE.Mesh(this.ringGeo, additive(color, 1));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.1;
    this.root.add(m);
    this.items.push({ obj: m, t: 0, dur, update: (it, k) => { m.scale.setScalar(0.2 + radius * easeOut(k)); m.material.opacity = 1 - k; }, dispose: () => m.material.dispose() });
  }

  telegraph(pos, radius, dur, color = '#ff2a1a') {
    const g = new THREE.Group(); g.position.copy(pos); g.position.y += 0.06;
    const ring = new THREE.Mesh(this.ringGeo, additive(color, 0.9)); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(radius);
    const fill = new THREE.Mesh(this.discGeo, additive(color, 0.35)); fill.rotation.x = -Math.PI / 2;
    g.add(ring, fill); this.root.add(g);
    this.items.push({ obj: g, t: 0, dur, update: (it, k) => { fill.scale.setScalar(radius * k); ring.material.opacity = 0.5 + 0.5 * Math.sin(k * 30); }, dispose: () => { ring.material.dispose(); fill.material.dispose(); } });
  }

  beam(pos, color, height = 12, dur = 1) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, height, 16, 1, true), additive(color, 0.7));
    m.position.copy(pos); m.position.y += height / 2;
    this.root.add(m);
    this.items.push({ obj: m, t: 0, dur, update: (it, k) => { m.material.opacity = 0.7 * (1 - k); m.scale.set(1 - k * 0.8, 1, 1 - k * 0.8); }, dispose: () => { m.geometry.dispose(); m.material.dispose(); } });
  }

  // floating combat text
  text(worldPos, str, cls = '', life = 1.0) {
    const el = document.createElement('div');
    el.className = 'dmg ' + cls; el.textContent = str;
    this.labels.appendChild(el);
    this.texts.push({ el, pos: worldPos.clone(), t: 0, life, dx: (Math.random() - 0.5) * 40 });
  }

  update(dt, camera) {
    this.p.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.update(it, k);
      if (k >= 1) { it.obj.parent?.remove(it.obj); it.dispose?.(); this.items.splice(i, 1); }
    }
    const w = innerWidth, h = innerHeight;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      tx.t += dt;
      const k = tx.t / tx.life;
      if (k >= 1) { tx.el.remove(); this.texts.splice(i, 1); continue; }
      this.v.copy(tx.pos); this.v.y += k * 1.2;
      this.v.project(camera);
      if (this.v.z > 1) { tx.el.style.opacity = 0; continue; }
      const x = (this.v.x * 0.5 + 0.5) * w + tx.dx * k, y = (-this.v.y * 0.5 + 0.5) * h;
      const pop = k < 0.12 ? 1 + (0.12 - k) * 5 : 1;
      tx.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${pop})`;
      tx.el.style.left = '0px'; tx.el.style.top = '0px';
      tx.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
  }

  // WebGPU: swap the point sprites for instanced node-material sprites that share the same buffers
  useGpu(gpu) { const mesh = gpu.particleMesh(this.p, this.p.pos.length / 3); this.root.remove(this.p.points); this.p.points = mesh; this.p.gpuAttrs = mesh.userData.attrs; this.root.add(mesh); }
  clear() {
    for (const it of this.items) { it.obj.parent?.remove(it.obj); it.dispose?.(); }
    this.items = [];
    for (const t of this.texts) t.el.remove();
    this.texts = [];
    for (let i = 0; i < MAX; i++) this.p.life[i] = 0;
  }

  // presets
  hitSpark(pos, crit) {
    this.emit({ pos, count: crit ? 26 : 14, speed: crit ? 9 : 6, color: crit ? '#fff2b0' : '#ffd08a', color2: '#ff5a1a', size: 0.22, life: 0.35, gravity: 9, drag: 3 });
    if (crit) this.emit({ pos, count: 1, speed: 0, color: '#ffffff', color2: '#ffaa33', size: 2.2, life: 0.15, shrink: 2 });
  }
  boneBurst(pos, color = '#e8e0cc') {
    this.emit({ pos, count: 30, speed: 6, color, color2: '#554433', size: 0.3, life: 0.9, gravity: 14, drag: 1, up: 1 });
    this.emit({ pos, count: 16, speed: 2, color: '#ff8a3a', color2: '#ff2200', size: 0.5, life: 0.8, up: 1, drag: 2 });
  }
  goldBurst(pos) { this.emit({ pos, count: 14, speed: 5, color: '#ffe066', color2: '#ffaa00', size: 0.22, life: 0.8, gravity: 12, up: 1.2 }); }
  levelUp(pos) {
    this.emit({ pos, count: 120, speed: 3, color: '#fff0b0', color2: '#ffaa22', size: 0.35, life: 1.6, up: 1.5, radius: 1.2, drag: 0.8 });
    this.shockwave(pos, 6, '#ffd36a', 0.9);
    this.beam(pos, '#c9902a', 14, 1.2);
  }
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const fx = new FX();
