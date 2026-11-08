import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeParts, mtx } from './util.js';

const GRID = 4;
const WALL_H = 3.2;

function plankGeo(w, h, d, horizontal, color1, color2) {
  const parts = [];
  const n = Math.max(2, Math.round((horizontal ? d : w) / 0.5));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    if (horizontal) parts.push({ geo: new THREE.BoxGeometry(w, h, d / n * 0.96), color: i % 2 ? color1 : color2, jitter: 0.1, matrix: mtx(0, 0, t * d) });
    else parts.push({ geo: new THREE.BoxGeometry(w / n * 0.96, h, d), color: i % 2 ? color1 : color2, jitter: 0.1, matrix: mtx(t * w, 0, 0) });
  }
  return parts;
}

function foundationGeo() {
  const parts = plankGeo(GRID, 0.3, GRID, true, 0x8a6a45, 0x7b5d3b).map((p) => ({ ...p, matrix: mtx(0, 0.15, 0).multiply(p.matrix) }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push({ geo: new THREE.CylinderGeometry(0.22, 0.26, 3, 7), color: 0x5e4630, matrix: mtx(x * (GRID / 2 - 0.25), -1.4, z * (GRID / 2 - 0.25)) });
  return mergeParts(parts);
}

function wallGeo(door) {
  const parts = [];
  if (!door) parts.push(...plankGeo(GRID, WALL_H, 0.25, false, 0x93714a, 0x82633f).map((p) => ({ ...p, matrix: mtx(0, WALL_H / 2, 0).multiply(p.matrix) })));
  else {
    const sw = 1.3;
    for (const sx of [-1, 1]) parts.push(...plankGeo(sw, WALL_H, 0.25, false, 0x93714a, 0x82633f).map((p) => ({ ...p, matrix: mtx(sx * (GRID / 2 - sw / 2), WALL_H / 2, 0).multiply(p.matrix) })));
    parts.push({ geo: new THREE.BoxGeometry(GRID - sw * 2, 0.7, 0.25), color: 0x82633f, matrix: mtx(0, WALL_H - 0.35, 0) });
  }
  parts.push({ geo: new THREE.BoxGeometry(GRID, 0.22, 0.35), color: 0x5e4630, matrix: mtx(0, WALL_H - 0.11, 0) });
  parts.push({ geo: new THREE.BoxGeometry(GRID, 0.22, 0.35), color: 0x5e4630, matrix: mtx(0, 0.11, 0) });
  return mergeParts(parts);
}

function campfireGeo() {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push({ geo: new THREE.DodecahedronGeometry(0.28), color: 0x77716a, jitter: 0.2, matrix: mtx(Math.cos(a) * 0.8, 0.12, Math.sin(a) * 0.8, a, a, 0) });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    parts.push({ geo: new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), color: 0x4a3420, matrix: mtx(0, 0.35, 0, Math.PI / 2 - 0.35, a, 0) });
  }
  return mergeParts(parts);
}

export class Building {
  constructor(scene, world, shared) {
    this.scene = scene;
    this.world = world;
    this.shared = shared;
    this.pieces = [];
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.geos = { foundation: foundationGeo(), wall: wallGeo(false), doorway: wallGeo(true), campfire: campfireGeo() };
    this.ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff5544, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghost = null;
    this.ghostType = null;
    this.rot = 0;
    this.fires = [];
    this.flameGeo = new THREE.ConeGeometry(0.35, 1.1, 7, 1, true);
  }

  setGhost(type) {
    if (this.ghostType === type) return;
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    this.ghostType = type;
    if (!type) return;
    this.ghost = new THREE.Mesh(this.geos[type], this.ghostMatOk);
    this.ghost.renderOrder = 5;
    this.scene.add(this.ghost);
  }

  rotate() { this.rot = (this.rot + Math.PI / 2) % (Math.PI * 2); }

  // Compute snapped placement from a look ray. Returns {pos, rot, ok}.
  solve(type, origin, dir) {
    // intersect ray with terrain by marching
    let hit = null;
    for (let t = 1; t < 14; t += 0.25) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      // floor surfaces count too
      const floorY = this.floorAt(x, z);
      const gy = Math.max(heightAt(x, z), floorY ?? -Infinity);
      if (y <= gy) { hit = new THREE.Vector3(x, gy, z); break; }
    }
    if (!hit) {
      const t = 6; hit = new THREE.Vector3(origin.x + dir.x * t, 0, origin.z + dir.z * t); hit.y = heightAt(hit.x, hit.z);
    }
    let pos = hit.clone(), rot = this.rot, ok = true;
    if (type === 'foundation') {
      // snap to neighbours if close, else free-place on grid relative to nearest foundation
      const near = this.nearest('foundation', hit, 8);
      if (near) {
        const dx = hit.x - near.pos.x, dz = hit.z - near.pos.z;
        const c = Math.cos(near.rot), s = Math.sin(near.rot);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const gx = Math.round(lx / GRID) * GRID, gz = Math.round(lz / GRID) * GRID;
        pos.set(near.pos.x + gx * c + gz * s, near.pos.y, near.pos.z - gx * s + gz * c);
        rot = near.rot;
        if (this.pieces.some((p) => p.type === 'foundation' && p.pos.distanceTo(pos) < 0.5)) ok = false;
      } else {
        pos.y = hit.y + 0.05;
      }
      const ground = heightAt(pos.x, pos.z);
      if (pos.y - ground > 2.8 || pos.y < ground - 0.6 || ground < -0.5) ok = false;
    } else if (type === 'wall' || type === 'doorway') {
      const near = this.nearest('foundation', hit, 6);
      ok = false;
      if (near) {
        const dx = hit.x - near.pos.x, dz = hit.z - near.pos.z;
        const c = Math.cos(near.rot), s = Math.sin(near.rot);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        // pick nearest edge
        let ex = 0, ez = 0, r = near.rot;
        if (Math.abs(lx) > Math.abs(lz)) { ex = Math.sign(lx) * GRID / 2; r += Math.PI / 2; } else { ez = Math.sign(lz) * GRID / 2; }
        pos.set(near.pos.x + ex * c + ez * s, near.pos.y + 0.3, near.pos.z - ex * s + ez * c);
        rot = r;
        ok = !this.pieces.some((p) => (p.type === 'wall' || p.type === 'doorway') && p.pos.distanceTo(pos) < 0.5);
      }
    } else if (type === 'campfire') {
      pos = hit; ok = hit.y > 0.3;
    }
    return { pos, rot, ok };
  }

  floorAt(x, z) {
    let best = null;
    for (const p of this.pieces) {
      if (p.type !== 'foundation') continue;
      const dx = x - p.pos.x, dz = z - p.pos.z;
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= GRID / 2 && Math.abs(lz) <= GRID / 2) best = Math.max(best ?? -Infinity, p.pos.y + 0.3);
    }
    return best;
  }

  nearest(type, pt, maxD) {
    let best = null, bd = maxD;
    for (const p of this.pieces) { if (p.type !== type) continue; const d = p.pos.distanceTo(pt); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  updateGhost(type, origin, dir) {
    this.setGhost(type);
    if (!type) return null;
    const s = this.solve(type, origin, dir);
    this.ghost.position.copy(s.pos);
    this.ghost.rotation.y = s.rot;
    this.ghost.material = s.ok ? this.ghostMatOk : this.ghostMatBad;
    return s;
  }

  place(type, pos, rot) {
    const mesh = new THREE.Mesh(this.geos[type], this.mat);
    mesh.position.copy(pos); mesh.rotation.y = rot;
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    const piece = { type, pos: pos.clone(), rot, mesh };
    if (type === 'wall' || type === 'doorway') {
      // oriented box collider; World.collide uses the inverse convention of three's rotation.y
      if (type === 'wall') {
        piece.collider = { box: true, x: pos.x, z: pos.z, rot: -rot, hw: GRID / 2, hd: 0.2, bottom: pos.y, top: pos.y + WALL_H };
        this.world.colliders.add(piece.collider);
      } else {
        piece.colliders = [-1, 1].map((sx) => {
          const off = sx * (GRID / 2 - 0.65);
          const c = { box: true, x: pos.x + Math.cos(rot) * off, z: pos.z - Math.sin(rot) * off, rot: -rot, hw: 0.65, hd: 0.2, bottom: pos.y, top: pos.y + WALL_H };
          this.world.colliders.add(c); return c;
        });
      }
    }
    if (type === 'campfire') {
      const light = new THREE.PointLight(0xff8833, 0, 22, 1.6);
      light.position.set(0, 1.0, 0);
      mesh.add(light);
      const fmat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const flames = new THREE.Group();
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(this.flameGeo, fmat); f.position.set((i - 1) * 0.15, 0.55, (i % 2) * 0.12); flames.add(f); }
      flames.visible = false;
      mesh.add(flames);
      piece.light = light; piece.flames = flames; piece.lit = false; piece.cook = 0;
      this.fires.push(piece);
    }
    this.pieces.push(piece);
    return piece;
  }

  update(dt, t) {
    for (const f of this.fires) {
      f.flames.visible = f.lit;
      f.light.intensity = f.lit ? 30 + Math.sin(t * 13) * 5 + Math.sin(t * 29) * 4 : 0;
      if (f.lit) f.flames.children.forEach((m, i) => { m.scale.set(1, 0.8 + Math.sin(t * 10 + i * 2) * 0.25, 1); m.rotation.y = t * 2 + i; });
    }
  }

  fireNear(pos, r = 4) { return this.fires.find((f) => f.pos.distanceTo(pos) < r); }
}
