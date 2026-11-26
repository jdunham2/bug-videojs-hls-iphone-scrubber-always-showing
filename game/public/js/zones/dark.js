// The Dark World: a blood-moon mirror realm with wraiths and the Hollow Merchant.
import * as THREE from 'three';
import { DARK, darkHeight } from '../../shared/world.js';
import { RNG, fbm, smoothstep } from '../../shared/rng.js';
import { G } from '../state.js';
import { buildEnemy, animateRig } from '../models.js';
import { makeSky, buildPortal, textures, mtx, makeSun, followSun, heightTerrain, envFromSky, Batcher } from './common.js';

export class DarkZone {
  constructor(renderer) {
    this.type = 'dark';
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.spawn = { ...DARK.spawn };
    this.spawnYaw = 0;
    this.bloom = { strength: 0.6, radius: 0.55, threshold: 0.78 };
    this.exposure = 1.35;
    this.build();
  }

  groundHeight(x, z) { return darkHeight(x, z); }

  collide(pos, r) {
    const d = Math.hypot(pos.x, pos.z), max = DARK.bound - 4;
    if (d > max) { pos.x *= max / d; pos.z *= max / d; }
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z, l = Math.hypot(dx, dz), min = c.r + r;
      if (l < min && l > 1e-4) { pos.x = c.x + (dx / l) * min; pos.z = c.z + (dz / l) * min; }
    }
    return pos;
  }

  build() {
    const s = this.scene;
    const rng = new RNG(666);
    s.fog = new THREE.FogExp2('#2a0a22', 0.017);
    this.sky = makeSky({ top: '#12020e', horizon: '#6a1230', bottom: '#1a0410', sunDir: [-0.3, 0.32, -0.9], sunColor: '#a8321e', sunSize: 0.9965, stars: 0.6, moon: 1 });
    s.add(this.sky);
    s.environment = envFromSky(this.renderer, this.sky);
    s.environmentIntensity = 0.5;
    s.add(new THREE.HemisphereLight('#a03060', '#1a0818', 0.9));
    this.sun = makeSun('#ff6a50', 1.6, 40); s.add(this.sun, this.sun.target);
    this.colliders = [];

    const base = new THREE.Color('#2a1630'), crack = new THREE.Color('#5a1a3a'), ash = new THREE.Color('#4a3a4a');
    s.add(heightTerrain(180, 160, darkHeight, (x, z, y, c) => {
      const n = fbm(x * 0.1, z * 0.1, 3);
      c.copy(base).lerp(ash, smoothstep(0.4, 0.8, n));
      const v = Math.abs(fbm(x * 0.05 + 3, z * 0.05, 3) - 0.5);
      c.lerp(crack, smoothstep(0.03, 0.0, v) * 0.9);
    }));
    // lava cracks glow (thin emissive ribbons as flat planes following noise iso-lines would be costly; use glowing pools)
    const lavaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3a1a').multiplyScalar(2) });
    this.pools = [];
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, 6.28), r = rng.range(22, 60);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const m = new THREE.Mesh(new THREE.CircleGeometry(rng.range(1.5, 3.5), 24), lavaMat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, darkHeight(x, z) + 0.08, z); s.add(m);
      this.pools.push(m.position);
    }

    // obsidian spires & crystals
    const obs = new THREE.MeshStandardMaterial({ color: '#140c18', roughness: 0.2, metalness: 0.6, flatShading: true });
    const crystalMat = new THREE.MeshStandardMaterial({ color: '#ff5cf0', emissive: '#d02ad8', emissiveIntensity: 2.2, roughness: 0.2, flatShading: true });
    const spireN = 60;
    const spires = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), obs, spireN);
    const cryst = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.6, 0), crystalMat, 90);
    let ci = 0, si = 0;
    for (let i = 0; i < spireN; i++) {
      const a = rng.range(0, 6.28), r = rng.range(18, 72);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 6 && z > 10) continue;
      const h = rng.range(3, 12), w = rng.range(0.8, 2.2);
      spires.setMatrixAt(si++, mtx(x, darkHeight(x, z) + h / 2 - 0.5, z, rng.range(0, 6), rng.range(-0.15, 0.15), rng.range(-0.15, 0.15), w, h, w));
      this.colliders.push({ x, z, r: w * 0.9 });
      for (let k = 0; k < 2 && ci < 90; k++) {
        const cx = x + rng.range(-2.5, 2.5), cz = z + rng.range(-2.5, 2.5);
        cryst.setMatrixAt(ci++, mtx(cx, darkHeight(cx, cz) + 0.3, cz, rng.range(0, 6), rng.range(-0.4, 0.4), 0, 1, rng.range(1.2, 2.6), 1));
      }
    }
    cryst.count = ci; spires.count = si;
    spires.castShadow = spires.receiveShadow = true; s.add(spires, cryst);

    // floating rocks
    this.floaters = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ map: textures.rock, color: '#4a3550', roughness: 0.9, flatShading: true }), 40);
    this.floatData = [];
    for (let i = 0; i < 40; i++) {
      const a = rng.range(0, 6.28), r = rng.range(15, 70);
      this.floatData.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: rng.range(8, 26), s: rng.range(0.6, 3.2), ph: rng.range(0, 6), rs: rng.range(-0.3, 0.3) });
    }
    this.floaters.castShadow = true; s.add(this.floaters);

    // dead trees
    const B = new Batcher();
    const bark = new THREE.MeshStandardMaterial({ color: '#0e080e', roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const a = rng.range(0, 6.28), r = rng.range(16, 65);
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = darkHeight(x, z);
      const h = rng.range(3, 6);
      B.add(new THREE.CylinderGeometry(0.1, 0.3, h, 5), bark, mtx(x, y + h / 2, z, 0, rng.range(-0.2, 0.2), rng.range(-0.2, 0.2)));
      for (let k = 0; k < 3; k++) B.add(new THREE.CylinderGeometry(0.03, 0.1, h * 0.5, 4), bark, mtx(x + rng.range(-0.4, 0.4), y + h * rng.range(0.55, 0.9), z + rng.range(-0.4, 0.4), rng.range(0, 6), rng.range(0.6, 1.1), 0));
      this.colliders.push({ x, z, r: 0.4 });
    }
    // ruined arches near merchant
    const ruin = new THREE.MeshStandardMaterial({ map: textures.rock, color: '#5a4a5e', roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, r = 12;
      const x = DARK.merchant.x + Math.cos(a) * r, z = DARK.merchant.z + Math.sin(a) * r, y = darkHeight(x, z);
      const h = i % 2 ? 5 : 2.5;
      B.add(new THREE.BoxGeometry(1.2, h, 1.2), ruin, mtx(x, y + h / 2 - 0.2, z, a, 0, i % 3 ? 0.05 : -0.08));
      this.colliders.push({ x, z, r: 0.9 });
    }
    // merchant stall
    const m = DARK.merchant, my = darkHeight(m.x, m.z);
    const wood = new THREE.MeshStandardMaterial({ map: textures.wood, color: '#5a4060', roughness: 0.9 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#3a1050', roughness: 0.9, side: THREE.DoubleSide });
    for (const [px, pz] of [[-2, -1.2], [2, -1.2], [-2, 1.2], [2, 1.2]]) B.add(new THREE.BoxGeometry(0.2, 3.2, 0.2), wood, mtx(m.x + px, my + 1.6, m.z - 1.5 + pz));
    B.add(new THREE.BoxGeometry(4.4, 0.1, 3), cloth, mtx(m.x, my + 3.25, m.z - 1.5, 0, 0.18));
    B.add(new THREE.BoxGeometry(3.6, 1, 1), wood, mtx(m.x, my + 0.5, m.z + 0.2));
    B.build(s);
    this.colliders.push({ x: m.x, z: m.z - 0.5, r: 2.3 });
    const goodsMat = ['#ff9a3c', '#5ab0ff', '#c77dff', '#5eea8a'].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2 }));
    this.goods = [];
    for (let i = 0; i < 4; i++) { const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), goodsMat[i]); g.position.set(m.x - 1.2 + i * 0.8, my + 1.25, m.z + 0.2); s.add(g); this.goods.push(g); }
    const lantern = new THREE.PointLight('#c77dff', 30, 16, 1.8); lantern.position.set(m.x, my + 2.6, m.z); s.add(lantern);
    this.lantern = lantern;
    this.merchant = buildEnemy('merchant');
    this.merchant.root.position.set(m.x, my, m.z - 1.4);
    s.add(this.merchant.root);

    // portal home
    this.portal = buildPortal('#ff4a10', '#ffb347', ruin);
    this.portal.position.set(DARK.portal.x, darkHeight(DARK.portal.x, DARK.portal.z), DARK.portal.z);
    this.portal.lookAt(0, this.portal.position.y, 0);
    s.add(this.portal);
    this.colliders.push({ x: DARK.portal.x - 2.8, z: DARK.portal.z, r: 0.9 }, { x: DARK.portal.x + 2.8, z: DARK.portal.z, r: 0.9 });

    // the Hollow King's throne
    {
      const T = DARK.throne, ty = darkHeight(T.x, T.z);
      const g = new THREE.Group(); g.position.set(T.x, ty, T.z);
      const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
      add(new THREE.CylinderGeometry(4, 4.6, 0.8, 8), ruin, 0, 0.4, 0);
      add(new THREE.BoxGeometry(2.4, 1.0, 1.6), obs, 0, 1.3, 0);
      add(new THREE.BoxGeometry(2.4, 4.2, 0.5), obs, 0, 3.2, -0.6);
      for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.4, 1.6, 1.6), obs, 1.2 * s, 1.9, 0); add(new THREE.ConeGeometry(0.25, 1.4, 4), crystalMat, 1.1 * s, 5.8, -0.6); }
      add(new THREE.OctahedronGeometry(0.5, 0), crystalMat, 0, 5.8, -0.6);
      const l = new THREE.PointLight('#c86bff', 18, 14, 2); l.position.set(0, 4, 2); g.add(l);
      s.add(g);
      this.colliders.push({ x: T.x, z: T.z, r: 2.4 });
    }
    this.interactables = [
      { x: DARK.throne.x, z: DARK.throne.z + 3.5, r: 4, mark: 'HOLLOW THRONE', label: () => ([...G.enemies.values()].some((e) => e.type === 'hollowking' && !e.dead) ? null : 'Challenge the Hollow King (boss)'), action: () => G.actions.challengeKing() },
      { x: m.x, z: m.z + 1.2, r: 3.6, mark: 'MERCHANT', label: () => 'Trade with the Hollow Merchant', action: () => G.actions.openShop() },
      { x: DARK.portal.x, z: DARK.portal.z, r: 3.5, mark: 'EMBERHOLD', label: () => 'Return to Emberhold', action: () => G.actions.travel('town') },
    ];
    this.buildMinimap();
  }

  buildMinimap() {
    const N = 192, W = 160;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N - 0.5) * W, z = (j / N - 0.5) * W, y = darkHeight(x, z);
      const v = Math.min(1, 0.15 + y * 0.03);
      const k = (j * N + i) * 4;
      img.data[k] = 60 * v + 30; img.data[k + 1] = 20 * v + 8; img.data[k + 2] = 60 * v + 30; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.map = { canvas: c, worldSize: W, center: { x: 0, z: 0 }, view: 60 };
    this.mapIcons = [{ x: DARK.throne.x, z: DARK.throne.z, color: '#c86bff', icon: 'portal' }, { x: DARK.merchant.x, z: DARK.merchant.z, color: '#c77dff', icon: 'shop' }, { x: DARK.portal.x, z: DARK.portal.z, color: '#ff8a2a', icon: 'portal' }];
  }

  update(dt, t, playerPos) {
    this.sky.position.copy(G.camera.position);
    this.sky.material.uniforms.time.value = t;
    followSun(this.sun, playerPos, { x: -20, y: 30, z: -50 });
    this.portal.userData.update(t);
    const tmp = new THREE.Matrix4();
    this.floatData.forEach((f, i) => { tmp.copy(mtx(f.x, darkHeight(f.x, f.z) + f.y + Math.sin(t * 0.6 + f.ph) * 1.2, f.z, t * f.rs + f.ph, f.ph, 0, f.s, f.s * 0.8, f.s)); this.floaters.setMatrixAt(i, tmp); });
    this.floaters.instanceMatrix.needsUpdate = true;
    this.goods.forEach((g, i) => { g.rotation.y = t * 2 + i; g.position.y = darkHeight(0, 0) + 1.3 + Math.sin(t * 2 + i) * 0.08; });
    this.lantern.intensity = 26 + Math.sin(t * 4) * 5;
    animateRig(this.merchant, { t, move: 0, atk: -1, slam: -1, cast: 0.3 + Math.sin(t) * 0.1 });
    const dx = playerPos.x - this.merchant.root.position.x, dz = playerPos.z - this.merchant.root.position.z;
    this.merchant.root.rotation.y = Math.atan2(dx, dz);
    if (Math.random() < dt * 30) {
      const a = Math.random() * 6.28, r = Math.random() * 30;
      const x = playerPos.x + Math.cos(a) * r, z = playerPos.z + Math.sin(a) * r;
      G.fx.emit({ pos: new THREE.Vector3(x, darkHeight(x, z) + 0.2, z), count: 1, speed: 0.8, color: '#ff7a3a', color2: '#ff0040', size: 0.14, life: 3.5, up: 1, drag: 0.3 });
    }
    for (const p of this.pools) if (Math.random() < dt * 3) G.fx.emit({ pos: p, count: 1, speed: 1, color: '#ffb060', color2: '#ff1a00', size: 0.4, life: 1.2, up: 1.5, radius: 1.5 });
  }
}
