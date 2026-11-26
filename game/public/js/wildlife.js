// Ambient wildlife: circling bird flocks and ground critters (rabbits, deer, frogs) that graze and flee from heroes.
import * as THREE from 'three';
import { G } from './state.js';
import { RNG } from '../shared/rng.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true, ...o });
function buildBird(color, s) {
  const g = new THREE.Group(), m = std(color);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 5), m); body.rotation.x = Math.PI / 2; g.add(body);
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.15, 0.9, 0, -0.05, 0, 0, -0.2]), 3)); wing.computeVertexNormals();
  const wm = std(color, { side: THREE.DoubleSide });
  const L = new THREE.Mesh(wing, wm), R = new THREE.Mesh(wing, wm); R.scale.x = -1; g.add(L, R);
  g.scale.setScalar(s); g.userData = { L, R };
  return g;
}
function buildCritter(kind) {
  const g = new THREE.Group();
  if (kind === 'deer') {
    const m = std('#8a5a34'), w = std('#e8dcc8');
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.1), m); body.position.y = 1.0; g.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), m); neck.position.set(0, 1.4, 0.5); neck.rotation.x = -0.4; g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.42), m); head.position.set(0, 1.72, 0.66); g.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.1), w); tail.position.set(0, 1.12, -0.58); g.add(tail);
    for (const [x, z] of [[-0.18, 0.4], [0.18, 0.4], [-0.18, -0.4], [0.18, -0.4]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), m); l.position.set(x, 0.4, z); g.add(l); }
    for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.4, 4), w); a.position.set(s * 0.09, 1.98, 0.6); a.rotation.z = -s * 0.4; g.add(a); }
    g.userData.head = head; g.userData.neck = neck;
  } else if (kind === 'frog') {
    const m = std('#4a7a2a');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), m); b.scale.set(1, 0.6, 1.2); b.position.y = 0.1; g.add(b);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), std('#c8e83a')); e.position.set(s * 0.07, 0.2, 0.1); g.add(e); }
  } else {
    const m = std(kind === 'hare' ? '#eef2f6' : '#9a8068'), w = std('#f0e8e0');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), m); b.scale.set(1, 0.9, 1.3); b.position.y = 0.2; g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), m); h.position.set(0, 0.36, 0.22); g.add(h);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.03), m); e.position.set(s * 0.05, 0.54, 0.2); g.add(e); }
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), w); t.position.set(0, 0.24, -0.26); g.add(t);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const SETS = {
  town: { birds: [['#f2f2f2', 0.9, 9, { x: 80, z: 62 }], ['#2a2a2a', 0.8, 7, { x: -60, z: 70 }]], critters: [['rabbit', 8], ['deer', 4]], area: (r) => { const a = r.range(0, 6.28), d = r.range(55, 110); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; } },
  marsh: { birds: [['#1a1a1a', 0.9, 10, { x: 0, z: 0 }]], critters: [['frog', 14]], area: (r) => { const a = r.range(0, 6.28), d = r.range(10, 80); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; } },
  peaks: { birds: [['#5a3a20', 1.8, 4, { x: 0, z: -20 }], ['#e8e8e8', 0.8, 6, { x: 30, z: 40 }]], critters: [['hare', 7], ['deer', 5]], area: (r) => { const a = r.range(0, 6.28), d = r.range(15, 80); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; } },
};

export class Wildlife {
  constructor(zone, key) {
    this.zone = zone; this.root = new THREE.Group(); this.birds = []; this.critters = [];
    const S = SETS[key]; if (!S) return;
    const rng = new RNG(key.length * 131 + 7);
    for (const [color, s, n, c] of S.birds) for (let i = 0; i < n; i++) {
      const m = buildBird(color, s); this.root.add(m);
      this.birds.push({ m, c, r: rng.range(10, 26), a: rng.range(0, 6.28), sp: rng.range(0.25, 0.45) * (rng.chance(0.5) ? 1 : -1), h: rng.range(16, 30), ph: rng.range(0, 6.28) });
    }
    for (const [kind, n] of S.critters) for (let i = 0; i < n; i++) {
      const p = S.area(rng), m = buildCritter(kind); this.root.add(m);
      this.critters.push({ m, kind, x: p.x, z: p.z, home: p, tx: p.x, tz: p.z, ry: rng.range(0, 6.28), wait: rng.range(0, 4), flee: 0, hop: 0, sp: kind === 'deer' ? 2 : kind === 'frog' ? 1.2 : 1.6, run: kind === 'deer' ? 9 : 6.5 });
    }
    zone.scene.add(this.root);
  }
  update(dt, t, playerPos) {
    const night = this.zone.nightF || (this.zone.type === 'town' ? G.nightF : 0);
    for (const b of this.birds) {
      b.a += (b.sp * dt * 20) / b.r;
      const x = b.c.x + Math.cos(b.a) * b.r, z = b.c.z + Math.sin(b.a) * b.r, y = this.zone.groundHeight(b.c.x, b.c.z) + b.h + Math.sin(t * 0.5 + b.ph) * 2;
      b.m.position.set(x, y, z); b.m.rotation.y = -b.a + (b.sp > 0 ? 0 : Math.PI); b.m.rotation.z = (b.sp > 0 ? -1 : 1) * 0.3;
      const f = Math.sin(t * 9 + b.ph) * (Math.sin(t * 0.7 + b.ph) > 0.3 ? 0.08 : 0.7); b.m.userData.L.rotation.z = f; b.m.userData.R.rotation.z = -f;
      b.m.visible = night < 0.7;
    }
    for (const c of this.critters) {
      const dx = c.x - playerPos.x, dz = c.z - playerPos.z, d = Math.hypot(dx, dz);
      if (d < (c.kind === 'deer' ? 11 : 7) && c.flee <= 0) { c.flee = 2.5; c.tx = c.x + (dx / (d || 1)) * 14; c.tz = c.z + (dz / (d || 1)) * 14; }
      c.flee -= dt; c.wait -= dt;
      const tx = c.tx - c.x, tz = c.tz - c.z, td = Math.hypot(tx, tz);
      let moving = false;
      if (td > 0.3 && (c.wait <= 0 || c.flee > 0)) {
        const sp = (c.flee > 0 ? c.run : c.sp) * dt;
        c.x += (tx / td) * Math.min(sp, td); c.z += (tz / td) * Math.min(sp, td); c.ry = Math.atan2(tx, tz); moving = true;
        if (this.zone.collide) { const p = { x: c.x, z: c.z }; this.zone.collide(p, 0.3); c.x = p.x; c.z = p.z; }
      } else if (c.wait <= 0) { c.wait = 2 + Math.random() * 5; c.tx = c.home.x + (Math.random() - 0.5) * 16; c.tz = c.home.z + (Math.random() - 0.5) * 16; }
      c.hop = moving ? c.hop + dt * (c.flee > 0 ? 14 : 8) : 0;
      const y = this.zone.groundHeight(c.x, c.z) + (c.kind !== 'deer' && moving ? Math.abs(Math.sin(c.hop)) * 0.25 : 0);
      c.m.position.set(c.x, y, c.z); c.m.rotation.y = c.ry;
      if (c.kind === 'deer') { c.m.rotation.x = moving ? Math.sin(c.hop) * 0.06 : 0; if (c.m.userData.neck) c.m.userData.neck.rotation.x = moving || d < 18 ? -0.4 : 0.6 + Math.sin(t * 2 + c.home.x) * 0.1; }
      c.m.visible = d < 90;
    }
  }
}
