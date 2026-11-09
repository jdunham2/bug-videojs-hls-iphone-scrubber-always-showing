import * as THREE from 'three';
import { heightAt, slopeAt, HALF } from './terrain.js';
import { mergeParts, mtx, lumpify, addWind } from './util.js';
import { createNoise2D, mulberry32 } from './noise.js';

const CELL = 16;

// Spatial hash grid for resource nodes and colliders.
class Grid {
  constructor() { this.map = new Map(); }
  key(x, z) { return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; }
  add(o) { const k = this.key(o.x, o.z); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(o); }
  remove(o) { const a = this.map.get(this.key(o.x, o.z)); if (a) { const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); } }
  query(x, z, r, out = []) {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.map.get(`${i},${j}`); if (a) for (const o of a) out.push(o);
    }
    return out;
  }
}

function palmGeo(rand) {
  const parts = [];
  const segs = 7, h = 7 + rand() * 3, lean = 0.12 + rand() * 0.12;
  let x = 0, y = 0;
  for (let i = 0; i < segs; i++) {
    const sh = h / segs;
    parts.push({ geo: new THREE.CylinderGeometry(0.22 - i * 0.015, 0.28 - i * 0.015, sh * 1.05, 7), color: i % 2 ? 0x8a6a45 : 0x7a5b3a, matrix: mtx(x, y + sh / 2, 0, 0, 0, -lean) });
    x += Math.sin(lean) * sh; y += Math.cos(lean) * sh;
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rand() * 0.3;
    const leaf = new THREE.PlaneGeometry(0.9, 4.2, 1, 4);
    const p = leaf.attributes.position;
    for (let i = 0; i < p.count; i++) { const ly = p.getY(i) + 2.1; p.setZ(i, -ly * ly * 0.09); p.setX(i, p.getX(i) * (1 - ly / 4.6)); }
    leaf.translate(0, 2.1, 0);
    leaf.computeVertexNormals();
    parts.push({ geo: leaf, color: k % 2 ? 0x4f8a2c : 0x3f7a24, matrix: mtx(x, y, 0, 0, a, 0).multiply(mtx(0, 0, 0, -1.1, 0, 0)) });
  }
  parts.push({ geo: new THREE.SphereGeometry(0.35, 6, 5), color: 0x5a3f22, matrix: mtx(x + 0.2, y - 0.3, 0.1) });
  parts.push({ geo: new THREE.SphereGeometry(0.33, 6, 5), color: 0x5a3f22, matrix: mtx(x - 0.15, y - 0.35, -0.2) });
  return mergeParts(parts);
}

function broadleafGeo(rand) {
  const parts = [];
  const h = 5 + rand() * 2.5;
  parts.push({ geo: new THREE.CylinderGeometry(0.35, 0.6, h, 8), color: 0x5b4330, matrix: mtx(0, h / 2, 0) });
  parts.push({ geo: new THREE.CylinderGeometry(0.12, 0.2, 3, 5), color: 0x5b4330, matrix: mtx(0.9, h * 0.75, 0, 0, 0, -0.8) });
  const greens = [0x3d6e26, 0x4a7d2c, 0x335f20, 0x568a33];
  for (let k = 0; k < 7; k++) {
    const r = 1.8 + rand() * 1.4;
    const a = rand() * Math.PI * 2, d = k === 0 ? 0 : 1.2 + rand() * 1.4;
    parts.push({ geo: lumpify(new THREE.IcosahedronGeometry(r, 1), 0.35, rand), color: greens[k % 4], jitter: 0.12,
      matrix: mtx(Math.cos(a) * d, h + rand() * 2.2 - 0.3, Math.sin(a) * d) });
  }
  return mergeParts(parts);
}

function pineGeo(rand) {
  const parts = [];
  const h = 9 + rand() * 4;
  parts.push({ geo: new THREE.CylinderGeometry(0.22, 0.45, h, 7), color: 0x4a3626, matrix: mtx(0, h / 2, 0) });
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = 3.2 * (1 - t * 0.8), ch = 3.4 - t;
    const cone = lumpify(new THREE.ConeGeometry(r, ch, 9, 1), 0.18, rand);
    parts.push({ geo: cone, color: i % 2 ? 0x24502e : 0x2d5c35, jitter: 0.1, matrix: mtx(0, 2.6 + t * (h - 2.4), 0, 0, rand() * 3, 0) });
  }
  return mergeParts(parts);
}

function rockGeo(rand, big) {
  const parts = [];
  const n = big ? 3 : 1;
  for (let k = 0; k < n; k++) {
    const r = big ? 1.4 + rand() * 1.6 : 0.8 + rand() * 0.7;
    const g = lumpify(new THREE.IcosahedronGeometry(r, 1), 0.45, rand);
    parts.push({ geo: g, color: k % 2 ? 0x7d776f : 0x8e877d, jitter: 0.15,
      matrix: mtx((k - 1) * r * 0.9, r * 0.35, rand() * 0.8, rand(), rand(), rand(), 1, 0.7, 1) });
  }
  return mergeParts(parts);
}

function oreGeo(rand) {
  const parts = [];
  const r = 1.0 + rand() * 0.6;
  parts.push({ geo: lumpify(new THREE.IcosahedronGeometry(r, 1), 0.45, rand), color: 0x5e5852, jitter: 0.15, matrix: mtx(0, r * 0.35, 0, rand(), rand(), rand(), 1, 0.75, 1) });
  for (let k = 0; k < 9; k++) {
    const a = rand() * Math.PI * 2, e = rand() * 1.1;
    parts.push({ geo: new THREE.OctahedronGeometry(0.16 + rand() * 0.14), color: k % 3 ? 0xc0773a : 0xe0c88a,
      matrix: mtx(Math.cos(a) * Math.cos(e) * r * 0.9, r * 0.35 + Math.sin(e) * r * 0.65, Math.sin(a) * Math.cos(e) * r * 0.9, rand(), rand(), 0) });
  }
  return mergeParts(parts);
}

function bushGeo(rand, berryColor) {
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, d = k ? 0.55 : 0;
    parts.push({ geo: lumpify(new THREE.IcosahedronGeometry(0.75 + rand() * 0.3, 1), 0.3, rand), color: k % 2 ? 0x3e6d2a : 0x4c7e30, jitter: 0.15,
      matrix: mtx(Math.cos(a) * d, 0.6 + rand() * 0.3, Math.sin(a) * d) });
  }
  if (berryColor) {
    for (let k = 0; k < 16; k++) {
      const a = rand() * Math.PI * 2, e = rand() * 1.2;
      parts.push({ geo: new THREE.SphereGeometry(0.11, 5, 4), color: berryColor,
        matrix: mtx(Math.cos(a) * Math.cos(e) * 1.05, 0.75 + Math.sin(e) * 0.8, Math.sin(a) * Math.cos(e) * 1.05) });
    }
  }
  return mergeParts(parts);
}

function grassBladeGeo() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.BufferGeometry();
    const w = 0.12, h = 0.9;
    const v = new Float32Array([-w, 0, 0, w, 0, 0, w * 0.4, h * 0.6, 0, -w * 0.4, h * 0.6, 0, 0, h, 0]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    // both windings so we can render FrontSide with upward normals on each face (no dark backfaces)
    g.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4, 2, 1, 0, 3, 2, 0, 4, 2, 3]);
    g.computeVertexNormals();
    // Point normals up for soft, uniform lighting
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    parts.push({ geo: g, color: 0xffffff, matrix: mtx((k - 1) * 0.15, 0, (k % 2) * 0.1, 0, (k / 3) * Math.PI, 0) });
  }
  const geo = mergeParts(parts);
  // vertical gradient: dark at root, light at tip
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 0.9; c.setXYZ(i, 0.22 + t * 0.5, 0.42 + t * 0.45, 0.12 + t * 0.15); }
  return geo;
}

const KINDS = {
  palm:      { kind: 'tree', hp: 60, yields: [['wood', 3], ['fiber', 1]], radius: 0.5 },
  broadleaf: { kind: 'tree', hp: 80, yields: [['wood', 4]], radius: 0.7 },
  pine:      { kind: 'tree', hp: 80, yields: [['wood', 4]], radius: 0.6 },
  rock:      { kind: 'rock', hp: 70, yields: [['stone', 3], ['flint', 1]], radius: 1.4 },
  metal:     { kind: 'rock', hp: 130, yields: [['stone', 2], ['ore', 3]], radius: 1.5 },
  boulder:   { kind: 'rock', hp: 160, yields: [['stone', 4], ['flint', 2]], radius: 3.2 },
  bush:      { kind: 'bush', hp: 12, yields: [['fiber', 3], ['berries', 2]], radius: 0 },
  dozebush:  { kind: 'bush', hp: 12, yields: [['fiber', 2], ['sleepberry', 3]], radius: 0 },
};

export class World {
  constructor(scene, quality, shared, spawn) {
    this.scene = scene;
    this.shared = shared;
    this.grid = new Grid();
    this.nodes = [];
    this.colliders = new Grid();  // {x,z,r}
    this.tmp = [];
    const rand = mulberry32(777);
    const noise = createNoise2D(55);
    const high = quality === 'high';

    const variants = (fn, n) => Array.from({ length: n }, () => fn());
    const foliageMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), shared, { strength: 0.0035, freq: 1.1 });
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    const bushMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), shared, { strength: 0.03, freq: 1.8 });

    const defs = [
      { type: 'palm',      geos: variants(() => palmGeo(rand), 3),      mat: foliageMat, count: high ? 420 : 300, test: (x, z, h, s) => h > 1.4 && h < 6 && s < 0.2 },
      { type: 'broadleaf', geos: variants(() => broadleafGeo(rand), 3), mat: foliageMat, count: high ? 1300 : 800, test: (x, z, h, s) => h > 5 && h < 30 && s < 0.25 && noise(x * 0.008, z * 0.008) > -0.15 },
      { type: 'pine',      geos: variants(() => pineGeo(rand), 3),      mat: foliageMat, count: high ? 900 : 600, test: (x, z, h, s) => h > 22 && h < 70 && s < 0.35 },
      { type: 'rock',      geos: variants(() => rockGeo(rand, false), 4), mat: rockMat, count: 700, test: (x, z, h, s) => h > 1 && h < 80 },
      { type: 'boulder',   geos: variants(() => rockGeo(rand, true), 3),  mat: rockMat, count: 220, test: (x, z, h, s) => h > 3 && s > 0.05 },
      { type: 'metal',     geos: variants(() => oreGeo(rand), 3),      mat: rockMat, count: 260, test: (x, z, h, s) => h > 26 && h < 90 },
      { type: 'bush',      geos: variants(() => bushGeo(rand, 0x7a1f3d), 2), mat: bushMat, count: 700, test: (x, z, h, s) => h > 2.5 && h < 35 && s < 0.25 },
      { type: 'dozebush',  geos: variants(() => bushGeo(rand, 0x6a3aa8), 2), mat: bushMat, count: 260, test: (x, z, h, s) => h > 4 && h < 40 && s < 0.25 && noise(x * 0.02 + 9, z * 0.02) > 0.1 },
    ];

    this.meshes = [];
    for (const d of defs) {
      const placements = d.geos.map(() => []);
      let tries = 0;
      while (placements.reduce((n, p) => n + p.length, 0) < d.count && tries < d.count * 40) {
        tries++;
        const x = (rand() - 0.5) * HALF * 1.9, z = (rand() - 0.5) * HALF * 1.9;
        const h = heightAt(x, z), s = slopeAt(x, z);
        if (!d.test(x, z, h, s)) continue;
        // clear area around spawn beach a bit
        if (spawn && Math.hypot(x - spawn.x, z - spawn.z) < 10) continue;
        placements[Math.floor(rand() * d.geos.length)].push({ x, z, h, rot: rand() * Math.PI * 2, scl: 0.8 + rand() * 0.5 });
      }
      d.geos.forEach((geo, vi) => {
        const list = placements[vi];
        if (!list.length) return;
        const im = new THREE.InstancedMesh(geo, d.mat, list.length);
        im.castShadow = true; im.receiveShadow = true;
        list.forEach((p, i) => {
          const m = mtx(p.x, p.h - 0.15, p.z, 0, p.rot, 0, p.scl);
          im.setMatrixAt(i, m);
          const k = KINDS[d.type];
          const node = { type: d.type, kind: k.kind, x: p.x, z: p.z, y: p.h, hp: k.hp * p.scl, maxHp: k.hp * p.scl, mesh: im, index: i, matrix: m, alive: true, respawn: 0, scl: p.scl, r: k.radius * p.scl };
          this.nodes.push(node); this.grid.add(node);
          if (k.radius > 0) { node.collider = { x: p.x, z: p.z, r: k.radius * p.scl }; this.colliders.add(node.collider); }
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        this.scene.add(im);
        this.meshes.push(im);
      });
    }

    // ---------- Grass ----------
    const gcount = high ? 90000 : 40000;
    const grassMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), shared, { strength: 0.25, freq: 2.2, heightScale: 1 });
    const grass = new THREE.InstancedMesh(grassBladeGeo(), grassMat, gcount);
    grass.receiveShadow = true;
    const gc = new THREE.Color();
    let gi = 0, gt = 0;
    while (gi < gcount && gt < gcount * 6) {
      gt++;
      const x = (rand() - 0.5) * HALF * 1.8, z = (rand() - 0.5) * HALF * 1.8;
      const h = heightAt(x, z);
      if (h < 2.8 || h > 32 || slopeAt(x, z) > 0.2) continue;
      const dens = noise(x * 0.03, z * 0.03);
      if (dens < -0.2) continue;
      grass.setMatrixAt(gi, mtx(x, h - 0.05, z, 0, rand() * 6.28, 0, 0.8 + rand() * 0.8, 0.45 + rand() * 0.55 + Math.max(0, dens) * 0.6, 0.8 + rand() * 0.8));
      gc.setHSL(0.24 + rand() * 0.06, 0.45 + rand() * 0.2, 0.55 + rand() * 0.25);
      grass.setColorAt(gi, gc);
      gi++;
    }
    grass.count = gi;
    grass.instanceMatrix.needsUpdate = true;
    grass.computeBoundingSphere();
    scene.add(grass);
    this.grass = grass;

    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  nodesNear(x, z, r) { return this.grid.query(x, z, r, this.tmp); }

  // Find the resource node closest to a ray (for harvesting).
  pickNode(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    const cand = this.grid.query(origin.x, origin.z, maxDist + 4, []);
    const tmp = new THREE.Vector3();
    for (const n of cand) {
      if (!n.alive) continue;
      const r = n.kind === 'tree' ? 1.2 * n.scl : n.kind === 'bush' ? 1.3 : (n.type === 'boulder' ? 3.3 : 1.6) * n.scl;
      // test against a vertical capsule: closest approach in XZ, then height check
      const cy = n.kind === 'tree' ? n.y + 2 : n.y + 0.7;
      tmp.set(n.x - origin.x, cy - origin.y, n.z - origin.z);
      const t = tmp.dot(dir);
      if (t < 0 || t > bestT + r) continue;
      const px = origin.x + dir.x * t - n.x, pz = origin.z + dir.z * t - n.z;
      const py = origin.y + dir.y * t;
      const dxz = Math.hypot(px, pz);
      const yOk = n.kind === 'tree' ? py > n.y - 1 && py < n.y + 9 : py > n.y - 1 && py < n.y + r * 1.8;
      if (dxz < r && yOk && t < bestT) { best = n; bestT = t; }
    }
    return best ? { node: best, dist: bestT } : null;
  }

  harvest(node, power) {
    node.hp -= power;
    // little shake
    node.shake = 0.25;
    if (node.hp <= 0) {
      node.alive = false;
      node.respawn = node.kind === 'bush' ? 90 : 240;
      node.mesh.setMatrixAt(node.index, this.zero);
      node.mesh.instanceMatrix.needsUpdate = true;
      if (node.collider) this.colliders.remove(node.collider);
      return true;
    }
    return false;
  }

  update(dt) {
    for (const n of this.nodes) {
      if (n.shake > 0) {
        n.shake -= dt;
        const s = Math.max(n.shake, 0) * 0.25;
        const m = n.matrix.clone().premultiply(new THREE.Matrix4().makeTranslation(Math.sin(n.shake * 60) * s, 0, Math.cos(n.shake * 50) * s));
        if (n.alive) { n.mesh.setMatrixAt(n.index, n.shake > 0 ? m : n.matrix); n.mesh.instanceMatrix.needsUpdate = true; }
      }
      if (!n.alive) {
        n.respawn -= dt;
        if (n.respawn <= 0) {
          n.alive = true; n.hp = n.maxHp;
          n.mesh.setMatrixAt(n.index, n.matrix); n.mesh.instanceMatrix.needsUpdate = true;
          if (n.collider) this.colliders.add(n.collider);
        }
      }
    }
  }

  static yieldsFor(type) { return KINDS[type].yields; }

  // Push a circle (x,z,r) out of static colliders. Returns adjusted position.
  collide(pos, r) {
    const list = this.colliders.query(pos.x, pos.z, r + 4, this.tmp);
    for (const c of list) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      if (c.box) {
        // oriented box collider (walls)
        const cs = Math.cos(-c.rot), sn = Math.sin(-c.rot);
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (pos.y > c.top || pos.y + 1.8 < c.bottom) continue;
        const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ox = lx - qx, oz = lz - qz;
        const d = Math.hypot(ox, oz);
        if (d < r) {
          if (d < 1e-4) { // inside: push along shortest axis
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { ox = Math.sign(lx) || 1; oz = 0; } else { oz = Math.sign(lz) || 1; ox = 0; }
          } else { ox /= d; oz /= d; }
          const push = r - d;
          const wx = ox * Math.cos(c.rot) - oz * Math.sin(c.rot);
          const wz = ox * Math.sin(c.rot) + oz * Math.cos(c.rot);
          pos.x += wx * push; pos.z += wz * push;
        }
        continue;
      }
      const d = Math.hypot(dx, dz), m = r + c.r;
      if (d < m && d > 1e-4) { pos.x += (dx / d) * (m - d); pos.z += (dz / d) * (m - d); }
    }
    return pos;
  }
}
