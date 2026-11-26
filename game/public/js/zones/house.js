// Player homes: a timber-framed interior with a hearth, decorated with crafted furniture, boss trophies
// and a fish tank that shows every species the owner has caught. The owner decorates in build mode (B).
import * as THREE from 'three';
import { G } from '../state.js';
import { HOUSE, decorDef } from '../../shared/housing.js';
import { FISH } from '../../shared/life.js';
import { textures, mtx, Batcher } from './common.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
const M = { oak: std('#8a5a34'), dark: std('#4a3020'), cloth: std('#a83a2a'), iron: std('#5a5e64', { metalness: 0.7, roughness: 0.4 }), gold: std('#d8a84a', { metalness: 0.8, roughness: 0.3 }), green: std('#3a7a3a'), pot: std('#a0583a'), stone: std('#8a8680'), white: std('#e8e0d0'), glass: new THREE.MeshStandardMaterial({ color: '#9adfff', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 }), water: new THREE.MeshStandardMaterial({ color: '#3a8ab8', transparent: true, opacity: 0.45 }), glow: std('#ffd080', { emissive: '#ff9a3a', emissiveIntensity: 2.2 }), bone: std('#e8e0c8') };
const box = (g, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
const cyl = (g, r1, r2, h, m, x, y, z, s = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, s), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };

export function buildDecor(k, fish = {}) {
  const g = new THREE.Group(), D = decorDef(k);
  switch (k) {
    case 'rug': { const r = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), std('#8a2a2a')); r.rotation.x = -Math.PI / 2; r.position.y = 0.02; g.add(r); const b = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 24), std('#d8a84a')); b.rotation.x = -Math.PI / 2; b.position.y = 0.025; g.add(b); break; }
    case 'table': box(g, 1.8, 0.1, 1, M.oak, 0, 0.8, 0); for (const [x, z] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) box(g, 0.1, 0.8, 0.1, M.dark, x, 0.4, z); box(g, 0.2, 0.25, 0.2, M.glow, 0.4, 0.98, 0); break;
    case 'chair': box(g, 0.55, 0.08, 0.55, M.oak, 0, 0.45, 0); box(g, 0.55, 0.6, 0.08, M.oak, 0, 0.8, -0.24); for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) box(g, 0.06, 0.45, 0.06, M.dark, x, 0.22, z); break;
    case 'bed': box(g, 1.4, 0.4, 2.1, M.oak, 0, 0.2, 0); box(g, 1.3, 0.2, 1.9, M.white, 0, 0.5, 0.05); box(g, 1.32, 0.12, 1.2, M.cloth, 0, 0.62, 0.35); box(g, 1.4, 0.9, 0.12, M.dark, 0, 0.45, -1.05); box(g, 0.5, 0.15, 0.35, M.white, -0.3, 0.68, -0.75); box(g, 0.5, 0.15, 0.35, M.white, 0.3, 0.68, -0.75); break;
    case 'shelf': box(g, 1.3, 2, 0.4, M.dark, 0, 1, 0); for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) box(g, 0.12, 0.35, 0.28, [M.cloth, M.green, M.gold, std('#3a4a8a')][(i + j) % 4], -0.5 + j * 0.16, 0.3 + i * 0.47, 0.04); break;
    case 'chest': box(g, 0.9, 0.55, 0.6, M.oak, 0, 0.28, 0); box(g, 0.92, 0.12, 0.62, M.iron, 0, 0.6, 0); box(g, 0.14, 0.14, 0.04, M.gold, 0, 0.45, 0.31); break;
    case 'lantern': { cyl(g, 0.04, 0.06, 1.8, M.iron, 0, 0.9, 0, 6); box(g, 0.25, 0.3, 0.25, M.glow, 0, 1.9, 0); const l = new THREE.PointLight('#ffb060', 6, 7, 2); l.position.y = 1.9; g.add(l); g.userData.light = l; break; }
    case 'brazier': { cyl(g, 0.35, 0.2, 0.5, M.iron, 0, 0.6, 0); cyl(g, 0.06, 0.08, 0.4, M.iron, 0, 0.2, 0, 6); const f = cyl(g, 0.0, 0.28, 0.5, M.glow, 0, 1.05, 0, 8); g.userData.flame = f; const l = new THREE.PointLight('#ff8a3a', 10, 9, 2); l.position.y = 1.3; g.add(l); g.userData.light = l; break; }
    case 'banner': cyl(g, 0.04, 0.04, 2.6, M.dark, 0, 1.3, 0, 6); box(g, 0.9, 0.06, 0.06, M.gold, 0, 2.5, 0); box(g, 0.8, 1.4, 0.03, std('#c83a1a'), 0, 1.75, 0); box(g, 0.3, 0.3, 0.035, M.gold, 0, 1.9, 0); break;
    case 'plant': cyl(g, 0.22, 0.16, 0.4, M.pot, 0, 0.2, 0); for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 4), M.green); const a = (i / 7) * Math.PI * 2; l.position.set(Math.cos(a) * 0.1, 0.65, Math.sin(a) * 0.1); l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(l); } break;
    case 'armorstand': cyl(g, 0.3, 0.35, 0.1, M.dark, 0, 0.05, 0); cyl(g, 0.05, 0.05, 1.5, M.dark, 0, 0.8, 0, 6); box(g, 0.6, 0.7, 0.35, M.iron, 0, 1.25, 0); box(g, 0.9, 0.18, 0.4, M.iron, 0, 1.55, 0); cyl(g, 0.2, 0.22, 0.35, M.iron, 0, 1.85, 0); break;
    case 'fishtank': {
      box(g, 1.7, 0.5, 0.9, M.dark, 0, 0.25, 0); box(g, 1.6, 0.95, 0.8, M.glass, 0, 0.98, 0); box(g, 1.55, 0.8, 0.75, M.water, 0, 0.92, 0);
      const swim = []; Object.entries(fish).forEach(([sp, n], i) => { if (!n || !FISH[sp]) return; const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), std(FISH[sp].color, { emissive: FISH[sp].color, emissiveIntensity: 0.3 })); f.scale.set(1.6, 0.8, 0.6); g.add(f); swim.push({ f, ph: i * 1.7, y: 0.75 + (i % 3) * 0.17 }); });
      g.userData.swim = swim; break;
    }
    default:
      if (D?.trophy) { // pedestal + a token of the boss
        cyl(g, 0.45, 0.55, 0.9, M.stone, 0, 0.45, 0); box(g, 0.8, 0.06, 0.8, M.gold, 0, 0.92, 0);
        const T = D.trophy, top = new THREE.Group(); top.position.y = 1.25; g.add(top);
        if (T === 'boss') { cyl(top, 0.22, 0.2, 0.3, M.bone, 0, 0, 0); box(top, 0.24, 0.1, 0.2, M.bone, 0, -0.15, 0.04); }
        else if (T === 'drake' || T === 'ogre') { const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 8), T === 'drake' ? std('#3a6ab8') : M.bone); h.rotation.z = 0.6; top.add(h); }
        else if (T === 'matriarch') { const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 6), std('#2a1a14')); f.rotation.x = Math.PI; top.add(f); }
        else if (T === 'hollowking' || T === 'kingreborn' || T === 'herald') { cyl(top, 0.22, 0.24, 0.12, T === 'herald' ? std('#bfeaff', { emissive: '#4ab8ff', emissiveIntensity: 2 }) : M.gold, 0, 0, 0); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, s = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), M.gold); s.position.set(Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2); top.add(s); } }
        else { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), std(T === 'warden' ? '#5af0ff' : '#9aff3a', { emissive: T === 'warden' ? '#2ad0ff' : '#5aff2a', emissiveIntensity: 1.5 })); top.add(o); }
        g.userData.spin = top;
      }
  }
  return g;
}

export class HouseZone {
  constructor(renderer) {
    this.type = 'house'; this.name = 'Home'; this.renderer = renderer;
    this.scene = new THREE.Scene(); this.spawn = { x: HOUSE.door.x, z: HOUSE.door.z - 1.5 }; this.spawnYaw = Math.PI;
    this.bloom = { strength: 0.5, radius: 0.5, threshold: 0.8 }; this.exposure = 1.2;
    this.items = new Map(); this.view = null;
    this.build();
  }
  groundHeight() { return 0; }
  /** keep the camera inside the room, under the beams */
  cameraClamp(target, cam) { const hw = HOUSE.w / 2 - 0.5, hd = HOUSE.d / 2 - 0.5; cam.x = Math.max(-hw, Math.min(hw, cam.x)); cam.z = Math.max(-hd, Math.min(hd, cam.z)); cam.y = Math.min(3.7, cam.y); return cam; }
  collide(pos, r) {
    const hw = HOUSE.w / 2 - 0.4 - r, hd = HOUSE.d / 2 - 0.4 - r;
    pos.x = Math.max(-hw, Math.min(hw, pos.x)); pos.z = Math.max(-hd, Math.min(hd, pos.z));
    for (const it of this.view?.items || []) { const D = decorDef(it.k); if (!D || D.flat) continue; const dx = pos.x - it.x, dz = pos.z - it.z, l = Math.hypot(dx, dz), min = D.r + r; if (l < min && l > 1e-4) { pos.x = it.x + (dx / l) * min; pos.z = it.z + (dz / l) * min; } }
    return pos;
  }
  build() {
    const s = this.scene, W = HOUSE.w, D = HOUSE.d;
    s.background = new THREE.Color('#120c08'); s.fog = new THREE.Fog('#120c08', 18, 40);
    s.add(new THREE.HemisphereLight('#ffe8c8', '#3a2a1a', 0.55));
    const tex = textures.flagstone.clone(); tex.repeat.set(6, 5); tex.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#a07850', map: tex, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const B = new Batcher(), plaster = std('#d8ccb0'), beam = M.dark;
    for (const [w, d, x, z] of [[W, 0.3, 0, -D / 2], [0.3, D, -W / 2, 0], [0.3, D, W / 2, 0], [W / 2 - 1.2, 0.3, -W / 4 - 0.6, D / 2], [W / 2 - 1.2, 0.3, W / 4 + 0.6, D / 2]]) B.add(new THREE.BoxGeometry(w, 4.2, d), plaster, mtx(x, 2.1, z));
    for (let i = -4; i <= 4; i++) B.add(new THREE.BoxGeometry(0.25, 0.3, D), beam, mtx(i * 2, 4.1, 0));
    for (let i = -4; i <= 4; i += 2) { B.add(new THREE.BoxGeometry(0.22, 4.2, 0.22), beam, mtx(i * 2, 2.1, -D / 2 + 0.2)); }
    B.add(new THREE.BoxGeometry(2.6, 0.3, 0.4), beam, mtx(0, 3.2, D / 2)); // door lintel
    // hearth on the back wall
    B.add(new THREE.BoxGeometry(3, 2.6, 0.9), M.stone, mtx(0, 1.3, -D / 2 + 0.5)); B.add(new THREE.BoxGeometry(1.6, 1.1, 0.5), std('#1a120c'), mtx(0, 0.6, -D / 2 + 0.75));
    B.build(s);
    this.fire = new THREE.PointLight('#ff8a3a', 22, 14, 2); this.fire.position.set(0, 0.8, -D / 2 + 1.4); this.fire.castShadow = true; s.add(this.fire);
    const lamp = new THREE.PointLight('#ffd8a0', 8, 16, 2); lamp.position.set(0, 3.6, 1); s.add(lamp);
    for (const sx of [-1, 1]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ac8ff').multiplyScalar(1.2) })); win.position.set(sx * (W / 2 - 0.16), 2.3, -1); win.rotation.y = -sx * Math.PI / 2; s.add(win); }
    this.interactables = [{ x: HOUSE.door.x, z: HOUSE.door.z, r: 1.6, mark: 'DOOR', label: () => 'Leave for Emberhold', action: () => G.actions.travel('town') }];
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#120c08'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#a07850'; x.fillRect(64 - (W / 2) * 5, 64 - (D / 2) * 5, W * 5, D * 5);
    this.map = { canvas: c, worldSize: 25.6, center: { x: 0, z: 0 }, view: 26 }; this.mapIcons = [];
    // decorating ghost
    this.ghost = new THREE.Group(); this.ghost.visible = false; s.add(this.ghost);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 32), new THREE.MeshBasicMaterial({ color: '#5eea8a', transparent: true, opacity: 0.8 })); this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.ghost.add(this.ring);
  }
  setHouse(view) {
    this.view = view; this.name = view ? `${view.name}'s Home` : 'Home';
    for (const g of this.items.values()) this.scene.remove(g); this.items.clear();
    for (const it of view?.items || []) { const g = buildDecor(it.k, view.fish); g.position.set(it.x, 0, it.z); g.rotation.y = (it.r || 0) * Math.PI / 2; this.scene.add(g); this.items.set(it.id, g); }
  }
  setGhost(k) {
    if (this.ghostMesh) this.ghost.remove(this.ghostMesh);
    this.ghostKey = k; this.ghostMesh = k ? buildDecor(k, this.view?.fish) : null;
    if (this.ghostMesh) { this.ghostMesh.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } if (o.isLight) o.intensity = 0; }); this.ghost.add(this.ghostMesh); }
    const r = (k && decorDef(k)?.r) || 0.4; this.ring.geometry.dispose(); this.ring.geometry = new THREE.RingGeometry(r, r + 0.1, 32);
  }
  update(dt, t) {
    this.fire.intensity = 20 + Math.sin(t * 11) * 3 + Math.sin(t * 6.3) * 3;
    if (Math.random() < dt * 25) G.fx.emit({ pos: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.4, -HOUSE.d / 2 + 0.85), count: 1, speed: 1.2, color: '#ffd080', color2: '#ff3000', size: 0.35, life: 0.6, up: 1.3 });
    for (const g of this.items.values()) {
      const U = g.userData;
      if (U.swim) for (const s of U.swim) { s.f.position.set(Math.sin(t * 0.8 + s.ph) * 0.6, s.y + Math.sin(t * 2 + s.ph) * 0.04, Math.cos(t * 1.1 + s.ph) * 0.25); s.f.rotation.y = -Math.atan2(Math.cos(t * 0.8 + s.ph) * 0.48, -Math.sin(t * 1.1 + s.ph) * 0.27); }
      if (U.spin) U.spin.rotation.y = t * 0.6;
      if (U.light) U.light.intensity = (U.flame ? 9 : 5.5) + Math.sin(t * 9 + g.position.x) * 0.8;
    }
  }
  dispose() {}
}
