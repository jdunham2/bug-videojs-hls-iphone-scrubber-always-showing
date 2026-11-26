// Procedurally generated dungeon: torch-lit halls, fog of war, boss arena.
import * as THREE from 'three';
import { generateDungeon, dungeonCollide, isFloor, TILE, BIOME_INFO, SHRINES, LEVER_NAMES } from '../../shared/dungeon.js';
import { G } from '../state.js';
import { buildPortal, textures, mtx, makeSun, followSun } from './common.js';

const WH = 5.2;
const BIOME = {
  crypt: { floor: '#c4b8a8', wall: '#b3a594', fog: '#07050a', fogD: 0.032, hemi: '#6a78b0', ground: '#2a1810', torch: '#ff9a40', flame: '#ffaa44', moon: '#8aa0ff', bg: '#040306', hue: 0.07 },
  forge: { floor: '#9a7a6a', wall: '#8a6a5a', fog: '#1c0a05', fogD: 0.03, hemi: '#c06040', ground: '#3a1008', torch: '#ff6a20', flame: '#ff7a2a', moon: '#ff8a5a', bg: '#0c0402', hue: 0.03 },
  frozen: { floor: '#c8dcea', wall: '#9ab4c8', fog: '#0a1624', fogD: 0.03, hemi: '#7aa0d8', ground: '#1a2a40', torch: '#6ac8ff', flame: '#8ad8ff', moon: '#bfe0ff', bg: '#02060c', hue: 0.58 },
};

export class DungeonZone {
  constructor(renderer, seed, level, cleared, rift) {
    this.type = 'dungeon';
    this.rift = rift || null;
    this.d = generateDungeon(seed, level);
    if (rift) { this.d.gateOpen = true; this.d.levers = []; this.d.leverOrder = []; }
    this.level = level;
    this.scene = new THREE.Scene();
    this.spawn = { x: this.d.start.x, z: this.d.start.z };
    this.spawnYaw = 0;
    this.biome = this.d.biome; this.B = BIOME[this.biome];
    this.name = this.rift ? `Ember Rift · Level ${this.rift.k}` : BIOME_INFO[this.biome].name;
    this.bloom = { strength: 0.7, radius: 0.5, threshold: 0.65 };
    this.exposure = 1.25;
    this.build();
    if (cleared) this.setCleared();
  }

  groundHeight() { return 0; }
  collide(pos, r) { return dungeonCollide(this.d, pos, r); }

  cameraClamp(target, cam) {
    // if a wall blocks the view, lift the camera over the wall tops instead of zooming into the hero
    const steps = 24, full = target.distanceTo(cam);
    let free = full;
    for (let i = 1; i <= steps; i++) {
      const p = target.clone().lerp(cam, i / steps);
      if (!isFloor(this.d, p.x, p.z) && p.y < WH + 0.6) { free = full * (i - 1) / steps; break; }
    }
    if (free >= full) return cam;
    if (free >= 3.5) return target.clone().lerp(cam, (free * 0.92) / full);
    // too tight: look straight down from above the hero
    const back = cam.clone().sub(target).setY(0).normalize().multiplyScalar(1.2);
    return target.clone().add(back).setY(target.y + 7);
  }

  build() {
    const s = this.scene, d = this.d;
    const B = this.B;
    s.background = new THREE.Color(B.bg);
    const dark = this.rift?.mods.includes('darkness');
    s.fog = new THREE.FogExp2(dark ? '#000000' : B.fog, B.fogD * (dark ? 2.1 : 1));
    if (this.rift) s.background = new THREE.Color(dark ? '#000000' : '#0a0410');
    s.add(new THREE.HemisphereLight(B.hemi, B.ground, 0.6));
    this.moon = makeSun(B.moon, 0.6, 30); s.add(this.moon, this.moon.target);
    this.playerLight = new THREE.PointLight('#ffcf9a', 14, 22, 1.4); s.add(this.playerLight);

    const floorTiles = [], wallTiles = [];
    const fl = (x, y) => x >= 0 && y >= 0 && x < d.w && y < d.h && d.grid[y * d.w + x] !== 0;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const v = d.grid[y * d.w + x];
      if (v === 1 || v === 2) floorTiles.push([x, y]);
      else if (v === 3 || v === 4) continue;
      else {
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (fl(x + dx, y + dy)) { near = true; break; }
        if (near) wallTiles.push([x, y]);
      }
    }
    const floorMat = new THREE.MeshStandardMaterial({ map: textures.flagstone, bumpMap: textures.flagstone, bumpScale: 3, roughness: this.biome === 'frozen' ? 0.55 : 0.85, color: B.floor });
    const wallMat = new THREE.MeshStandardMaterial({ map: textures.brick, bumpMap: textures.brick, bumpScale: 4, roughness: 0.9, color: B.wall });
    const floorIM = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.5, TILE), floorMat, floorTiles.length);
    const c = new THREE.Color();
    floorTiles.forEach(([x, y], i) => { floorIM.setMatrixAt(i, mtx((x + 0.5) * TILE, -0.25 + Math.random() * 0.03, (y + 0.5) * TILE, Math.floor(Math.random() * 4) * Math.PI / 2)); c.setHSL(B.hue, 0.12, 0.42 + Math.random() * 0.14); floorIM.setColorAt(i, c); });
    floorIM.receiveShadow = true; s.add(floorIM);
    const wallIM = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WH, TILE), wallMat, wallTiles.length);
    wallTiles.forEach(([x, y], i) => { wallIM.setMatrixAt(i, mtx((x + 0.5) * TILE, WH / 2, (y + 0.5) * TILE, 0, 0, 0, 1, 1 + Math.random() * 0.12, 1)); c.setHSL(B.hue, 0.1, 0.4 + Math.random() * 0.15); wallIM.setColorAt(i, c); });
    wallIM.castShadow = true; wallIM.receiveShadow = true; s.add(wallIM);
    // wall caps
    const capIM = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE + 0.2, 0.35, TILE + 0.2), new THREE.MeshStandardMaterial({ color: '#2a2422', roughness: 1 }), wallTiles.length);
    wallTiles.forEach(([x, y], i) => capIM.setMatrixAt(i, mtx((x + 0.5) * TILE, WH + 0.2, (y + 0.5) * TILE)));
    s.add(capIM);

    // torches
    const iron = new THREE.MeshStandardMaterial({ color: '#2a2a2e', metalness: 0.8, roughness: 0.5 });
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(B.flame).multiplyScalar(3) });
    this.torches = d.torches.map((t) => ({ x: (t.x + 0.5) * TILE + t.dx * (TILE / 2 + 0.2), z: (t.y + 0.5) * TILE + t.dy * (TILE / 2 + 0.2), y: 2.9 }));
    const brIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), iron, this.torches.length);
    const flIM = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.5, 6), flameMat, this.torches.length);
    this.torches.forEach((t, i) => { brIM.setMatrixAt(i, mtx(t.x, t.y - 0.3, t.z)); flIM.setMatrixAt(i, mtx(t.x, t.y + 0.25, t.z)); });
    s.add(brIM, flIM);
    this.lightPool = [];
    for (let i = 0; i < 5; i++) { const l = new THREE.PointLight(B.torch, 0, 14, 1.8); s.add(l); this.lightPool.push(l); }
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
      const l = this.braziers.length % 2 === 0 ? new THREE.PointLight('#ff4a20', 16, 14, 2) : { intensity: 0, position: new THREE.Vector3() }; l.position.set(x, 2, z); if (l.isLight) s.add(l);
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
    this.buildEvents(stone, iron);
    this.buildMinimap();
  }

  buildEvents(stone, iron) {
    const s = this.scene, d = this.d;
    this.pulled = []; this.shrinesUsed = [];
    // --- hazard tiles ---
    if (d.lava.length) {
      this.lavaMat = new THREE.MeshStandardMaterial({ color: '#ff5a10', emissive: '#ff3a00', emissiveIntensity: 2.2, roughness: 0.5 });
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.3, TILE), this.lavaMat, d.lava.length);
      d.lava.forEach((t, i) => im.setMatrixAt(i, mtx((t.x + 0.5) * TILE, -0.32, (t.y + 0.5) * TILE)));
      s.add(im);
      const crust = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.4, 0), new THREE.MeshStandardMaterial({ color: '#1a0e0a', roughness: 1, flatShading: true }), d.lava.length);
      d.lava.forEach((t, i) => crust.setMatrixAt(i, mtx((t.x + 0.2 + Math.random() * 0.6) * TILE, -0.15, (t.y + 0.2 + Math.random() * 0.6) * TILE, Math.random() * 6, 0, 0, 1 + Math.random(), 0.3, 1 + Math.random())));
      s.add(crust);
      this.lavaLights = [];
      for (let i = 0; i < Math.min(3, d.lava.length); i++) { const t = d.lava[Math.floor((i / 3) * d.lava.length)]; const l = new THREE.PointLight('#ff4a10', 10, 9, 2); l.position.set((t.x + 0.5) * TILE, 1.2, (t.y + 0.5) * TILE); s.add(l); this.lavaLights.push(l); }
    }
    if (d.ice.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.52, TILE), new THREE.MeshStandardMaterial({ color: '#9cc8e4', roughness: 0.12, metalness: 0.35, emissive: '#0e3048', emissiveIntensity: 0.5 }), d.ice.length);
      d.ice.forEach((t, i) => im.setMatrixAt(i, mtx((t.x + 0.5) * TILE, -0.25, (t.y + 0.5) * TILE)));
      im.receiveShadow = true; s.add(im);
      const shards = new THREE.InstancedMesh(new THREE.ConeGeometry(0.25, 1.4, 5), new THREE.MeshStandardMaterial({ color: '#bfe8ff', emissive: '#3a8acc', emissiveIntensity: 0.8, roughness: 0.1, flatShading: true }), Math.min(60, d.ice.length));
      for (let i = 0; i < shards.count; i++) { const t = d.ice[Math.floor(Math.random() * d.ice.length)]; shards.setMatrixAt(i, mtx((t.x + Math.random()) * TILE, 0.4, (t.y + Math.random()) * TILE, Math.random() * 6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 1, 0.5 + Math.random(), 1)); }
      s.add(shards);
    }
    // --- spike traps ---
    this.traps = d.traps.map((t) => {
      const g = new THREE.Group(); g.position.set((t.x + 0.5) * TILE, 0.01, (t.y + 0.5) * TILE);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.9, 0.06, TILE * 0.9), new THREE.MeshStandardMaterial({ color: '#3a3430', metalness: 0.6, roughness: 0.5 }));
      plate.receiveShadow = true; g.add(plate);
      const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.8, 5), iron, 16);
      for (let i = 0; i < 16; i++) spikes.setMatrixAt(i, mtx(((i % 4) - 1.5) * 0.62, 0.4, (Math.floor(i / 4) - 1.5) * 0.62));
      g.add(spikes);
      s.add(g);
      return { ...t, wx: (t.x + 0.5) * TILE, wz: (t.y + 0.5) * TILE, spikes };
    });
    // --- gate (portcullis) + rune order display ---
    this.gates = [];
    const gateMat = new THREE.MeshStandardMaterial({ color: '#2a2a30', metalness: 0.9, roughness: 0.35 });
    for (const t of d.gateTiles) {
      const g = new THREE.Group(); g.position.set((t.x + 0.5) * TILE, 0, (t.y + 0.5) * TILE);
      for (let i = 0; i < 5; i++) for (const rot of [0, Math.PI / 2]) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, WH, 6), gateMat); const o = (i - 2) * 0.6; bar.position.set(rot ? 0 : o, WH / 2, rot ? o : 0); bar.castShadow = true; g.add(bar); }
      for (const y of [1, 2.6, 4.2]) { const h = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.12, TILE), gateMat); h.position.y = y; g.add(h); }
      s.add(g); this.gates.push(g);
    }
    this.gateOpen = d.gateOpen;
    if (this.rift) this.gates.forEach((g) => (g.visible = false));
    if (this.gateOpen) this.gates.forEach((g) => (g.position.y = WH));
    if (d.gateTiles.length && d.levers.length) {
      const t = d.gateTiles[Math.floor(d.gateTiles.length / 2)];
      this.runes = d.leverOrder.map((li, k) => {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(d.levers[li].color).multiplyScalar(2) }));
        m.position.set((t.x + 0.5) * TILE + (k - 1) * 0.9, WH + 0.9, (t.y + 0.5) * TILE);
        s.add(m); return m;
      });
      const plaque = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 0.2), stone); plaque.position.set((t.x + 0.5) * TILE, WH + 0.9, (t.y + 0.5) * TILE); s.add(plaque);
      this.runePos = plaque.position;
    }
    // --- levers ---
    this.levers = d.levers.map((L) => {
      const g = new THREE.Group(); g.position.set(L.x, 0, L.z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.6), stone); base.position.y = 0.5; base.castShadow = true; g.add(base);
      const handle = new THREE.Group(); handle.position.y = 1.0; g.add(handle);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), iron); stick.position.y = 0.5; handle.add(stick);
      const gemMat = new THREE.MeshStandardMaterial({ color: L.color, emissive: L.color, emissiveIntensity: 2.2 });
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), gemMat); gem.position.y = 1.02; handle.add(gem);
      handle.rotation.x = -0.6;
      const light = { intensity: 0 };
      s.add(g);
      return { ...L, g, handle, gemMat, light };
    });
    // --- shrines ---
    this.shrines = d.shrines.map((S0) => {
      const S = SHRINES[S0.kind];
      const g = new THREE.Group(); g.position.set(S0.x, 0, S0.z);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 1.2, 8), stone); ped.position.y = 0.6; ped.castShadow = true; g.add(ped);
      const mat = new THREE.MeshStandardMaterial({ color: S.color, emissive: S.color, emissiveIntensity: 2.4, flatShading: true });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat); crystal.position.y = 2.3; crystal.scale.y = 1.5; g.add(crystal);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(S.color).multiplyScalar(2) })); ring.position.y = 2.3; ring.rotation.x = Math.PI / 2; g.add(ring);
      const light = { intensity: 0 };
      s.add(g);
      return { ...S0, g, crystal, ring, mat, light, S };
    });
    this.levers.forEach((L) => this.interactables.push({ x: L.x, z: L.z, r: 2.6, mark: null, label: () => (this.gateOpen || this.pulled.includes(L.i) ? null : `Pull the ${LEVER_NAMES[L.i]} lever`), action: () => G.net.send({ t: 'lever', i: L.i }) }));
    this.shrines.forEach((S) => this.interactables.push({ x: S.x, z: S.z, r: 2.8, mark: null, label: () => (this.shrinesUsed.includes(S.i) ? null : `Activate ${S.S.name} (${S.S.desc})`), action: () => G.net.send({ t: 'shrine', i: S.i }) }));
  }

  trapActive(t) { return ((Date.now() / 1000 + t.phase) % 3) < 0.8; }
  trapAt(x, z) {
    for (const t of this.traps) if (Math.abs(t.wx - x) < TILE / 2 && Math.abs(t.wz - z) < TILE / 2) return this.trapActive(t);
    return false;
  }

  setDState(m) {
    const was = this.gateOpen;
    this.pulled = m.pulled; this.shrinesUsed = m.shrinesUsed;
    this.d.gateOpen = m.gateOpen; this.gateOpen = m.gateOpen;
    if (m.gateOpen && !was) this.gateAnim = 0;
    for (const L of this.levers) { const on = this.gateOpen || this.pulled.includes(L.i); L.on = on; }
    for (const S of this.shrines) { const used = this.shrinesUsed.includes(S.i); S.mat.emissiveIntensity = used ? 0.2 : 2.4;  }
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
    this.mapIcons = [{ x: this.findPortalSpot(d.rooms[0]).x, z: this.findPortalSpot(d.rooms[0]).z, color: '#ff8a2a', icon: 'portal' }, ...d.levers.map((L) => ({ x: L.x, z: L.z, color: L.color, icon: 'lever' })), ...d.shrines.map((S) => ({ x: S.x, z: S.z, color: SHRINES[S.kind].color, icon: 'shrine' }))];
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
      const v = d.grid[k];
      this.mapCtx.fillStyle = v === 2 ? '#8a8a9a' : v === 3 ? '#c2401a' : v === 4 ? '#8ac8e8' : v ? (inBoss ? '#6a2a22' : '#5a5248') : '#1b1816';
      this.mapCtx.fillRect(i * px, j * px, px, px);
    }
  }

  update(dt, t, playerPos) {
    for (const L of this.levers) { L.handle.rotation.x += ((L.on ? 0.7 : -0.6) - L.handle.rotation.x) * Math.min(1, dt * 8); L.gemMat.emissiveIntensity = L.on ? 4 : 1.6 + Math.sin(t * 4 + L.i) * 0.6; }
    for (const S of this.shrines) { S.crystal.rotation.y = t; S.crystal.position.y = 2.3 + Math.sin(t * 2 + S.i) * 0.15; S.ring.rotation.z = t * 0.8; if (!this.shrinesUsed.includes(S.i) && Math.random() < dt * 8) G.fx.emit({ pos: S.g.position.clone().setY(1.4), count: 1, speed: 1, color: S.S.color, color2: '#ffffff', size: 0.25, life: 1.2, up: 1.5, radius: 0.8 }); }
    if (this.runes) this.runes.forEach((r, i) => { r.rotation.y = t * 1.5 + i; r.visible = !this.gateOpen; r.scale.setScalar(this.pulled.length > i ? 1.4 : 1); });
    if (this.gateAnim !== undefined && this.gateAnim < 1) { this.gateAnim = Math.min(1, this.gateAnim + dt * 0.4); this.gates.forEach((g) => (g.position.y = this.gateAnim * WH)); if (Math.random() < dt * 20) for (const g of this.gates) G.fx.emit({ pos: g.position.clone().setY(0.3), count: 1, speed: 1, color: '#9a8a7a', color2: '#3a3028', size: 0.5, life: 1 }); }
    for (const tr of this.traps) {
      if (Math.abs(tr.wx - playerPos.x) > 30 || Math.abs(tr.wz - playerPos.z) > 30) continue;
      const on = this.trapActive(tr);
      tr.spikes.position.y += ((on ? 0 : -0.75) - tr.spikes.position.y) * Math.min(1, dt * (on ? 30 : 6));
    }
    if (this.lavaMat) { this.lavaMat.emissiveIntensity = 2 + Math.sin(t * 2) * 0.4; for (const l of this.lavaLights) l.intensity = 9 + Math.sin(t * 5 + l.position.x) * 2; if (Math.random() < dt * 25) { const tt = this.d.lava[Math.floor(Math.random() * this.d.lava.length)]; if (Math.abs(tt.x * TILE - playerPos.x) < 30) G.fx.emit({ pos: new THREE.Vector3((tt.x + Math.random()) * TILE, 0, (tt.y + Math.random()) * TILE), count: 1, speed: 1.5, color: '#ffd080', color2: '#ff2000', size: 0.4, life: 1, up: 2 }); } }
    if (this.biome === 'frozen' && Math.random() < dt * 25) { const a = Math.random() * 6.28, r = Math.random() * 14; G.fx.emit({ pos: new THREE.Vector3(playerPos.x + Math.cos(a) * r, 5, playerPos.z + Math.sin(a) * r), count: 1, speed: 0.4, color: '#ffffff', color2: '#bfe0ff', size: 0.12, life: 4, gravity: 0.6, drag: 0.5 }); }
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
    for (const b of this.braziers) if (b.l.isLight) b.l.intensity = 14 + Math.sin(t * 11 + b.x) * 3;
    for (const tc of this.torches) {
      if (Math.abs(tc.x - playerPos.x) > 22 || Math.abs(tc.z - playerPos.z) > 22) continue;
      if (Math.random() < dt * 14) G.fx.emit({ pos: new THREE.Vector3(tc.x, tc.y + 0.35, tc.z), count: 1, speed: 0.6, color: this.biome === 'frozen' ? '#dff4ff' : '#ffd080', color2: this.biome === 'frozen' ? '#2a8aff' : '#ff3a00', size: 0.32, life: 0.55, up: 1.6, drag: 1 });
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
