// Open-world regions: Ashen Marsh and Stormspire Peaks (shared RegionZone driven by a style table).
import * as THREE from 'three';
import { REGIONS } from '../../shared/regions.js';
import { RNG, fbm, smoothstep } from '../../shared/rng.js';
import { G } from '../state.js';
import { makeSky, textures, mtx, makeSun, followSun, heightTerrain, envFromSky, Batcher } from './common.js';

const STYLE = {
  marsh: {
    sky: { top: '#182620', horizon: '#6a7a58', bottom: '#2a3424', sunDir: [0.2, 0.25, -0.9], sunColor: '#d8e4a0', sunSize: 0.9988 },
    fog: ['#3e4c3a', 0.02], hemi: ['#a0b890', '#1a2010', 0.9], sun: ['#e0e8b0', 1.6], exposure: 1.15, bloom: { strength: 0.55, radius: 0.6, threshold: 0.7 },
    ground: (x, z, y, c) => { const n = fbm(x * 0.09, z * 0.09, 3); c.set('#3a3424').lerp(new THREE.Color('#4e5e2c'), smoothstep(0.35, 0.7, n)); if (y < -0.4) c.lerp(new THREE.Color('#2a2a1a'), 0.6); },
  },
  peaks: {
    sky: { top: '#2e62a8', horizon: '#d0dcea', bottom: '#8aa0b8', sunDir: [0.5, 0.6, -0.4], sunColor: '#fff6e0', sunSize: 0.9993 },
    fog: ['#b8c8d8', 0.009], hemi: ['#d0e0ff', '#3a4250', 1.1], sun: ['#fff4e0', 3], exposure: 1.0, bloom: { strength: 0.35, radius: 0.5, threshold: 0.85 },
    ground: (x, z, y, c) => { const n = fbm(x * 0.07, z * 0.07, 3); c.set('#5a6a3c').lerp(new THREE.Color('#6e6e74'), smoothstep(6, 12, y) * 0.9 + n * 0.2); c.lerp(new THREE.Color('#eef2f8'), smoothstep(13, 20, y + n * 4)); },
  },
};

export class RegionZone {
  constructor(renderer, key) {
    this.type = 'region'; this.key = key; this.renderer = renderer;
    this.R = REGIONS[key]; this.S = STYLE[key];
    this.name = this.R.name;
    this.scene = new THREE.Scene();
    this.spawn = { ...this.R.spawn }; this.spawnYaw = 0;
    this.bloom = this.S.bloom; this.exposure = this.S.exposure;
    this.colliders = [];
    this.build();
  }
  groundHeight(x, z) { const h = this.R.height(x, z); return this.R.water > -50 ? Math.max(h, this.R.water - 0.5) : h; }
  collide(pos, r) {
    const B = this.R.bound - 4, d = Math.hypot(pos.x, pos.z);
    if (d > B) { pos.x *= B / d; pos.z *= B / d; }
    for (const c of this.colliders) { const dx = pos.x - c.x, dz = pos.z - c.z, l = Math.hypot(dx, dz), min = c.r + r; if (l < min && l > 1e-4) { pos.x = c.x + (dx / l) * min; pos.z = c.z + (dz / l) * min; } }
    return pos;
  }
  build() {
    const s = this.scene, S = this.S, R = this.R, H = (x, z) => R.height(x, z), rng = new RNG(this.key === 'marsh' ? 501 : 777);
    s.fog = new THREE.FogExp2(S.fog[0], S.fog[1]);
    this.sky = makeSky(S.sky); s.add(this.sky);
    s.environment = envFromSky(this.renderer, this.sky); s.environmentIntensity = 0.55;
    this.hemi = new THREE.HemisphereLight(S.hemi[0], S.hemi[1], S.hemi[2]); s.add(this.hemi);
    this.sun = makeSun(S.sun[0], S.sun[1], 42); s.add(this.sun, this.sun.target);
    s.add(heightTerrain(190, 170, H, S.ground));
    const rock = new THREE.MeshStandardMaterial({ map: textures.rock, color: this.key === 'marsh' ? '#5a5a48' : '#8a8a92', roughness: 0.95, flatShading: true });
    const B = new Batcher();
    const spot = (minR, maxR) => { const a = rng.range(0, 6.28), r = rng.range(minR, maxR); const x = Math.cos(a) * r, z = Math.sin(a) * r; return Math.hypot(x - R.spawn.x, z - R.spawn.z) < 10 || Math.hypot(x - R.altar.x, z - R.altar.z) < 12 ? null : { x, z }; };
    if (this.key === 'marsh') {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), new THREE.MeshStandardMaterial({ color: '#2c3a28', roughness: 0.15, metalness: 0.25, transparent: true, opacity: 0.85 }));
      water.rotation.x = -Math.PI / 2; water.position.y = R.water; s.add(water);
      const bark = new THREE.MeshStandardMaterial({ color: '#1e1a14', roughness: 1 });
      for (let i = 0; i < 70; i++) { const p = spot(12, 80); if (!p) continue; const y = H(p.x, p.z), h = rng.range(3, 7); B.add(new THREE.CylinderGeometry(0.12, 0.35, h, 5), bark, mtx(p.x, y + h / 2, p.z, 0, rng.range(-0.25, 0.25), rng.range(-0.25, 0.25))); for (let k = 0; k < 3; k++) B.add(new THREE.CylinderGeometry(0.03, 0.1, h * 0.45, 4), bark, mtx(p.x + rng.range(-0.3, 0.3), y + h * rng.range(0.5, 0.9), p.z + rng.range(-0.3, 0.3), rng.range(0, 6), rng.range(0.7, 1.2))); this.colliders.push({ x: p.x, z: p.z, r: 0.45 }); }
      const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 1.4, 3), new THREE.MeshStandardMaterial({ color: '#6a7a3a', roughness: 1 }), 1600);
      let n = 0; for (let i = 0; i < 4000 && n < 1600; i++) { const p = spot(6, 84); if (!p) continue; const y = H(p.x, p.z); if (y > 0.4) continue; reeds.setMatrixAt(n++, mtx(p.x, Math.max(y, R.water) + 0.5, p.z, rng.range(0, 6), rng.range(-0.2, 0.2), rng.range(-0.2, 0.2), 1, rng.range(0.6, 1.4), 1)); }
      reeds.count = n; s.add(reeds);
      const shrooms = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6, 0, 6.3, 0, 1.6), new THREE.MeshStandardMaterial({ color: '#5aff8a', emissive: '#2aff6a', emissiveIntensity: 1.6 }), 220);
      n = 0; for (let i = 0; i < 800 && n < 220; i++) { const p = spot(8, 80); if (!p) continue; const y = H(p.x, p.z); if (y < R.water) continue; shrooms.setMatrixAt(n++, mtx(p.x, y + 0.08, p.z, 0, 0, 0, rng.range(0.6, 1.6), rng.range(0.5, 1.2), rng.range(0.6, 1.6))); }
      shrooms.count = n; s.add(shrooms);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28, x = R.altar.x + Math.cos(a) * 9, z = R.altar.z + Math.sin(a) * 9, h = rng.range(2, 5); B.add(new THREE.BoxGeometry(1.2, h, 1.2), rock, mtx(x, H(x, z) + h / 2 - 0.3, z, a, 0, rng.range(-0.1, 0.1))); this.colliders.push({ x, z, r: 0.9 }); }
    } else {
      const pine = new THREE.InstancedMesh((() => { const g = new THREE.ConeGeometry(1.3, 3.6, 7); g.translate(0, 3.2, 0); return g; })(), new THREE.MeshStandardMaterial({ color: '#2a4a32', roughness: 0.9, flatShading: true }), 260);
      const snowcap = new THREE.InstancedMesh((() => { const g = new THREE.ConeGeometry(0.75, 1.4, 7); g.translate(0, 4.6, 0); return g; })(), new THREE.MeshStandardMaterial({ color: '#f2f6fa', roughness: 0.8, flatShading: true }), 260);
      const trunk = new THREE.InstancedMesh((() => { const g = new THREE.CylinderGeometry(0.15, 0.25, 1.6, 5); g.translate(0, 0.8, 0); return g; })(), new THREE.MeshStandardMaterial({ color: '#4a3424' }), 260);
      let n = 0; for (let i = 0; i < 900 && n < 260; i++) { const p = spot(10, 80); if (!p) continue; const y = H(p.x, p.z); if (y > 22) continue; const sc = rng.range(0.7, 1.5), m = mtx(p.x, y - 0.1, p.z, rng.range(0, 6), 0, 0, sc, sc, sc); pine.setMatrixAt(n, m); snowcap.setMatrixAt(n, m); trunk.setMatrixAt(n, m); n++; this.colliders.push({ x: p.x, z: p.z, r: 0.5 * sc }); }
      pine.count = snowcap.count = trunk.count = n; pine.castShadow = snowcap.castShadow = true; s.add(pine, snowcap, trunk);
      const cry = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({ color: '#8ad8ff', emissive: '#3a9aff', emissiveIntensity: 2, flatShading: true }), 60);
      n = 0; for (let i = 0; i < 200 && n < 60; i++) { const p = spot(15, 80); if (!p) continue; cry.setMatrixAt(n++, mtx(p.x, H(p.x, p.z) + 0.4, p.z, rng.range(0, 6), rng.range(-0.4, 0.4), 0, 1, rng.range(1.2, 3), 1)); }
      cry.count = n; s.add(cry);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28, x = R.altar.x + Math.cos(a) * 9, z = R.altar.z + Math.sin(a) * 9; B.add(new THREE.CylinderGeometry(0.6, 0.9, 6, 6), rock, mtx(x, H(x, z) + 2.6, z)); this.colliders.push({ x, z, r: 0.9 }); }
    }
    for (let i = 0; i < 50; i++) { const p = spot(15, 82); if (!p) continue; const sc = rng.range(0.8, 2.6); B.add(new THREE.DodecahedronGeometry(1, 0), rock, mtx(p.x, H(p.x, p.z) - 0.2 * sc, p.z, rng.range(0, 6), rng.range(0, 1), 0, sc, sc * 0.7, sc * 1.1)); if (sc > 1.1) this.colliders.push({ x: p.x, z: p.z, r: sc * 0.8 }); }
    B.build(s);
    // waypoint stone
    const W = R.waypoint, wy = H(W.x, W.z);
    const wp = new THREE.Group(); wp.position.set(W.x, wy, W.z);
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 3, 5), rock); stone.position.y = 1.5; stone.castShadow = true; wp.add(stone);
    this.wpRune = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ab0ff').multiplyScalar(2.5) })); this.wpRune.position.y = 2.2; wp.add(this.wpRune);
    s.add(wp); this.colliders.push({ x: W.x, z: W.z, r: 0.8 });
    // altar
    const A = R.altar, ay = H(A.x, A.z);
    const al = new THREE.Group(); al.position.set(A.x, ay, A.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.6, 10), rock); base.position.y = 0.3; base.receiveShadow = true; al.add(base);
    const col = this.key === 'marsh' ? '#9aff3a' : '#6ad0ff';
    this.altarRune = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.7, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2), side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); this.altarRune.rotation.x = -Math.PI / 2; this.altarRune.position.y = 0.62; al.add(this.altarRune);
    const l = new THREE.PointLight(col, 18, 16, 2); l.position.y = 3; al.add(l);
    s.add(al);
    const bossName = this.key === 'marsh' ? 'Bog Colossus' : 'Storm Drake';
    this.interactables = [
      { x: W.x, z: W.z, r: 3.2, mark: 'WAYPOINT', label: () => 'Use the waypoint', action: () => G.actions.openWaypoint() },
      { x: A.x, z: A.z, r: 5, mark: this.key === 'marsh' ? 'DROWNED ALTAR' : 'STORM ALTAR', label: () => ([...G.enemies.values()].some((e) => e.boss && !e.dead) ? null : `Summon the ${bossName} (boss)`), action: () => G.actions.challengeKing() },
    ];
    this.buildMinimap();
  }
  buildMinimap() {
    const N = 192, W = 190, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), col = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N - 0.5) * W, z = (j / N - 0.5) * W, y = this.R.height(x, z);
      this.S.ground(x, z, y, col);
      if (this.R.water > -50 && y < this.R.water) col.set('#24301f');
      const k = (j * N + i) * 4; img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.map = { canvas: c, worldSize: W, center: { x: 0, z: 0 }, view: 60 };
    this.mapIcons = [{ x: this.R.waypoint.x, z: this.R.waypoint.z, color: '#5ab0ff', icon: 'portal' }, { x: this.R.altar.x, z: this.R.altar.z, color: this.key === 'marsh' ? '#9aff3a' : '#6ad0ff', icon: 'portal' }];
  }
  update(dt, t, playerPos) {
    this.sky.position.copy(G.camera.position);
    this.sky.material.uniforms.time.value = t;
    followSun(this.sun, playerPos, { x: 30, y: 50, z: -30 });
    this.wpRune.rotation.y = t; this.wpRune.rotation.x = Math.sin(t) * 0.3;
    this.altarRune.rotation.z = t * 0.4;
    if (this.key === 'marsh') {
      if (Math.random() < dt * 20) { const a = Math.random() * 6.28, r = Math.random() * 22; const x = playerPos.x + Math.cos(a) * r, z = playerPos.z + Math.sin(a) * r; G.fx.emit({ pos: new THREE.Vector3(x, this.groundHeight(x, z) + 0.6 + Math.random() * 2, z), count: 1, speed: 0.3, color: '#c8ff6a', color2: '#2aff6a', size: 0.16, life: 3, drag: 0.2 }); }
    } else {
      if (Math.random() < dt * 40) { const a = Math.random() * 6.28, r = Math.random() * 20; G.fx.emit({ pos: new THREE.Vector3(playerPos.x + Math.cos(a) * r, playerPos.y + 8, playerPos.z + Math.sin(a) * r), count: 1, speed: 0.5, color: '#ffffff', color2: '#d8e8ff', size: 0.14, life: 5, gravity: 0.8, drag: 0.6 }); }
      this.flash = Math.max(0, (this.flash || 0) - dt * 3);
      if (Math.random() < dt * 0.06) { this.flash = 1; setTimeout(() => G.audio.slam(), 400 + Math.random() * 800); }
      this.hemi.intensity = this.S.hemi[2] + this.flash * 2.5;
    }
  }
}
