// Procedurally generated dungeon: torch-lit halls, fog of war, boss arena.
import * as THREE from 'three';
import { generateDungeon, dungeonCollide, isFloor, TILE } from '../../shared/dungeon.js';
import { G } from '../state.js';
import { buildPortal, textures, mtx, makeSun, followSun } from './common.js';

const WH = 5.2;

export class DungeonZone {
  constructor(renderer, seed, level, cleared) {
    this.type = 'dungeon';
    this.d = generateDungeon(seed, level);
    this.level = level;
    this.scene = new THREE.Scene();
    this.spawn = { x: this.d.start.x, z: this.d.start.z };
    this.spawnYaw = 0;
    this.bloom = { strength: 0.7, radius: 0.5, threshold: 0.65 };
    this.exposure = 1.25;
    this.build();
    if (cleared) this.setCleared();
  }

  groundHeight() { return 0; }
  collide(pos, r) { return dungeonCollide(this.d, pos, r); }

  cameraClamp(target, cam) {
    const steps = 24;
    let last = target.clone();
    for (let i = 1; i <= steps; i++) {
      const p = target.clone().lerp(cam, i / steps);
      if (!isFloor(this.d, p.x, p.z) && p.y < WH + 0.6) return last;
      last = p;
    }
    return cam;
  }

  build() {
    const s = this.scene, d = this.d;
    s.background = new THREE.Color('#040306');
    s.fog = new THREE.FogExp2('#07050a', 0.032);
    s.add(new THREE.HemisphereLight('#6a78b0', '#2a1810', 0.55));
    this.moon = makeSun('#8aa0ff', 0.6, 30); s.add(this.moon, this.moon.target);
    this.playerLight = new THREE.PointLight('#ffcf9a', 14, 22, 1.4); s.add(this.playerLight);

    const floorTiles = [], wallTiles = [];
    const fl = (x, y) => x >= 0 && y >= 0 && x < d.w && y < d.h && d.grid[y * d.w + x] === 1;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      if (fl(x, y)) floorTiles.push([x, y]);
      else {
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (fl(x + dx, y + dy)) { near = true; break; }
        if (near) wallTiles.push([x, y]);
      }
    }
    const floorMat = new THREE.MeshStandardMaterial({ map: textures.flagstone, bumpMap: textures.flagstone, bumpScale: 3, roughness: 0.85, color: '#c4b8a8' });
    const wallMat = new THREE.MeshStandardMaterial({ map: textures.brick, bumpMap: textures.brick, bumpScale: 4, roughness: 0.9, color: '#b3a594' });
    const floorIM = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.5, TILE), floorMat, floorTiles.length);
    const c = new THREE.Color();
    floorTiles.forEach(([x, y], i) => { floorIM.setMatrixAt(i, mtx((x + 0.5) * TILE, -0.25 + Math.random() * 0.03, (y + 0.5) * TILE, Math.floor(Math.random() * 4) * Math.PI / 2)); c.setHSL(0.07, 0.12, 0.42 + Math.random() * 0.14); floorIM.setColorAt(i, c); });
    floorIM.receiveShadow = true; s.add(floorIM);
    const wallIM = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WH, TILE), wallMat, wallTiles.length);
    wallTiles.forEach(([x, y], i) => { wallIM.setMatrixAt(i, mtx((x + 0.5) * TILE, WH / 2, (y + 0.5) * TILE, 0, 0, 0, 1, 1 + Math.random() * 0.12, 1)); c.setHSL(0.06, 0.1, 0.4 + Math.random() * 0.15); wallIM.setColorAt(i, c); });
    wallIM.castShadow = true; wallIM.receiveShadow = true; s.add(wallIM);
    // wall caps
    const capIM = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE + 0.2, 0.35, TILE + 0.2), new THREE.MeshStandardMaterial({ color: '#2a2422', roughness: 1 }), wallTiles.length);
    wallTiles.forEach(([x, y], i) => capIM.setMatrixAt(i, mtx((x + 0.5) * TILE, WH + 0.2, (y + 0.5) * TILE)));
    s.add(capIM);

    // torches
    const iron = new THREE.MeshStandardMaterial({ color: '#2a2a2e', metalness: 0.8, roughness: 0.5 });
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffaa44').multiplyScalar(3) });
    this.torches = d.torches.map((t) => ({ x: (t.x + 0.5) * TILE + t.dx * (TILE / 2 + 0.2), z: (t.y + 0.5) * TILE + t.dy * (TILE / 2 + 0.2), y: 2.9 }));
    const brIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), iron, this.torches.length);
    const flIM = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.5, 6), flameMat, this.torches.length);
    this.torches.forEach((t, i) => { brIM.setMatrixAt(i, mtx(t.x, t.y - 0.3, t.z)); flIM.setMatrixAt(i, mtx(t.x, t.y + 0.25, t.z)); });
    s.add(brIM, flIM);
    this.lightPool = [];
    for (let i = 0; i < 7; i++) { const l = new THREE.PointLight('#ff9a40', 0, 14, 1.8); s.add(l); this.lightPool.push(l); }
    this.poolT = 0;

    // pillars & props
    const stone = new THREE.MeshStandardMaterial({ map: textures.rock, color: '#8a8078', roughness: 0.9 });
    const pIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.75, WH, 10), stone, d.pillars.length * 2);
    d.pillars.forEach((p, i) => { pIM.setMatrixAt(i, mtx((p.x + 0.5) * TILE, WH / 2, (p.y + 0.5) * TILE)); });
    pIM.count = d.pillars.length; pIM.castShadow = pIM.receiveShadow = true; s.add(pIM);
    this.pillarColliders = d.pillars.map((p) => ({ x: (p.x + 0.5) * TILE, z: (p.y + 0.5) * TILE, r: 0.8 }));
    const wood = new THREE.MeshStandardMaterial({ map: textures.wood, roughness: 0.85 });
    const bone = new THREE.MeshStandardMaterial({ color: '#d8d0bc', roughness: 0.8 });
    const clay = new THREE.MeshStandardMaterial({ color: '#8a4a2a', roughness: 0.8 });
    const propGeo = { barrel: new THREE.CylinderGeometry(0.45, 0.4, 1.1, 10), crate: new THREE.BoxGeometry(0.9, 0.9, 0.9), urn: new THREE.SphereGeometry(0.4, 10, 8), bones: new THREE.CapsuleGeometry(0.06, 0.5, 2, 6) };
    const propMat = { barrel: wood, crate: wood, urn: clay, bones: bone };
    for (const pr of d.props) {
      const m = new THREE.Mesh(propGeo[pr.kind], propMat[pr.kind]);
      const y = pr.kind === 'barrel' ? 0.55 : pr.kind === 'crate' ? 0.45 : pr.kind === 'urn' ? 0.35 : 0.08;
      m.position.set(pr.x * TILE, y, pr.y * TILE); m.rotation.y = pr.rot;
      if (pr.kind === 'bones') m.rotation.z = Math.PI / 2;
      m.castShadow = m.receiveShadow = true; s.add(m);
    }

    // boss arena
    const br = d.bossRoom;
    this.bossCenter = new THREE.Vector3(d.boss.x, 0.03, d.boss.z);
    const runeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3018').multiplyScalar(2.2), transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    for (const [r0, r1] of [[4.6, 4.9], [6.2, 6.4]]) { const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 64), runeMat); ring.rotation.x = -Math.PI / 2; ring.position.copy(this.bossCenter); s.add(ring); }
    const star = new THREE.Mesh(new THREE.RingGeometry(0.2, 4.6, 5, 1), new THREE.MeshBasicMaterial({ color: '#ff3018', wireframe: true, transparent: true, opacity: 0.6 }));
    star.rotation.x = -Math.PI / 2; star.position.copy(this.bossCenter); s.add(star); this.star = star;
    this.braziers = [];
    for (const [px, py] of [[br.x + 1, br.y + 1], [br.x + br.w - 2, br.y + 1], [br.x + 1, br.y + br.h - 2], [br.x + br.w - 2, br.y + br.h - 2]]) {
      const x = (px + 0.5) * TILE, z = (py + 0.5) * TILE;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 1.2, 8), iron); b.position.set(x, 0.6, z); b.castShadow = true; s.add(b);
      const l = new THREE.PointLight('#ff4a20', 14, 12, 2); l.position.set(x, 2, z); s.add(l);
      this.braziers.push({ x, z, l });
    }
    this.bossLight = new THREE.PointLight('#ff2a10', 12, 24, 2); this.bossLight.position.set(d.boss.x, 4, d.boss.z); s.add(this.bossLight);

    // portals
    const back = buildPortal('#ff4a10', '#ffb347', stone);
    back.scale.setScalar(0.7);
    const bp = this.findPortalSpot(d.rooms[0]);
    back.position.set(bp.x, 0, bp.z); back.lookAt(d.start.x, 0, d.start.z);
    s.add(back); this.backPortal = back;
    this.exitPortal = buildPortal('#ff8a1a', '#ffd36a', stone);
    this.exitPortal.scale.setScalar(0.8);
    this.exitPortal.position.set(d.boss.x, 0, d.boss.z);
    this.exitPortal.visible = false;
    s.add(this.exitPortal);
    this.interactables = [
      { x: bp.x, z: bp.z, r: 3, mark: 'EXIT', label: () => 'Return to Emberhold', action: () => G.actions.travel('town') },
      { x: d.boss.x, z: d.boss.z, r: 3.5, mark: null, label: () => (this.cleared ? 'Return victorious to Emberhold' : null), action: () => G.actions.travel('town') },
    ];
    this.buildMinimap();
  }

  findPortalSpot(room) {
    const cx = (room.cx + 0.5) * TILE, cz = (room.cy + 0.5) * TILE;
    const z = (room.y + 1) * TILE;
    return { x: cx, z: Math.min(cz - 4, z + 1) };
  }

  setCleared() {
    this.cleared = true;
    this.exitPortal.visible = true;
    this.bossLight.color.set('#ffd36a');
  }

  buildMinimap() {
    const d = this.d, px = 4;
    const c = document.createElement('canvas'); c.width = d.w * px; c.height = d.h * px;
    this.mapCtx = c.getContext('2d');
    this.mapCtx.fillStyle = '#000'; this.mapCtx.fillRect(0, 0, c.width, c.height);
    this.revealed = new Uint8Array(d.w * d.h);
    this.map = { canvas: c, worldSize: d.w * TILE, center: { x: (d.w * TILE) / 2, z: (d.h * TILE) / 2 }, view: 60 };
    this.mapIcons = [{ x: this.findPortalSpot(d.rooms[0]).x, z: this.findPortalSpot(d.rooms[0]).z, color: '#ff8a2a', icon: 'portal' }];
  }

  reveal(x, z) {
    const d = this.d, px = 4, R = 5;
    const ci = Math.floor(x / TILE), cj = Math.floor(z / TILE);
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 0 || j < 0 || i >= d.w || j >= d.h) continue;
      const k = j * d.w + i;
      if (this.revealed[k] || (i - ci) ** 2 + (j - cj) ** 2 > R * R) continue;
      this.revealed[k] = 1;
      const br = d.bossRoom;
      const inBoss = i >= br.x && i < br.x + br.w && j >= br.y && j < br.y + br.h;
      this.mapCtx.fillStyle = d.grid[k] ? (inBoss ? '#6a2a22' : '#5a5248') : '#1b1816';
      this.mapCtx.fillRect(i * px, j * px, px, px);
    }
  }

  update(dt, t, playerPos) {
    this.playerLight.position.set(playerPos.x - Math.sin(G.camYaw || 0) * -2, playerPos.y + 5.5, playerPos.z - Math.cos(G.camYaw || 0) * -2);
    followSun(this.moon, playerPos, { x: 12, y: 30, z: 8 });
    this.reveal(playerPos.x, playerPos.z);
    this.backPortal.userData.update(t);
    if (this.exitPortal.visible) this.exitPortal.userData.update(t);
    this.star.rotation.z = t * 0.2;
    this.poolT -= dt;
    if (this.poolT <= 0) {
      this.poolT = 0.3;
      const sorted = this.torches.map((tc) => ({ tc, d: (tc.x - playerPos.x) ** 2 + (tc.z - playerPos.z) ** 2 })).sort((a, b) => a.d - b.d);
      this.lightPool.forEach((l, i) => { const e = sorted[i]; if (e) { l.position.set(e.tc.x, e.tc.y + 0.4, e.tc.z); l.userData.on = true; } else l.userData.on = false; });
    }
    this.lightPool.forEach((l, i) => { l.intensity = l.userData.on ? 16 + Math.sin(t * 13 + i * 3) * 3 + Math.sin(t * 7.3 + i) * 2 : 0; });
    for (const b of this.braziers) b.l.intensity = 12 + Math.sin(t * 11 + b.x) * 3;
    for (const tc of this.torches) {
      if (Math.abs(tc.x - playerPos.x) > 22 || Math.abs(tc.z - playerPos.z) > 22) continue;
      if (Math.random() < dt * 14) G.fx.emit({ pos: new THREE.Vector3(tc.x, tc.y + 0.35, tc.z), count: 1, speed: 0.6, color: '#ffd080', color2: '#ff3a00', size: 0.32, life: 0.55, up: 1.6, drag: 1 });
    }
    for (const b of this.braziers) if (Math.random() < dt * 30) G.fx.emit({ pos: new THREE.Vector3(b.x, 1.25, b.z), count: 1, speed: 1, color: '#ffb060', color2: '#ff2000', size: 0.5, life: 0.7, up: 2, radius: 0.3, drag: 1 });
    if (Math.random() < dt * 5) {
      const a = Math.random() * 6.28, r = Math.random() * 10;
      G.fx.emit({ pos: new THREE.Vector3(playerPos.x + Math.cos(a) * r, 0.5 + Math.random() * 3, playerPos.z + Math.sin(a) * r), count: 1, speed: 0.2, color: '#8a7a6a', color2: '#3a3028', size: 0.07, life: 4, drag: 0.1 });
    }
    if (this.cleared && Math.random() < dt * 20) G.fx.emit({ pos: this.bossCenter, count: 1, speed: 1.5, color: '#fff2b0', color2: '#ffaa22', size: 0.25, life: 1.5, up: 2, radius: 2 });
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => m.dispose()); }
    });
  }
}
