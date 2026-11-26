// Emberhold: the explorable town hub + valley, and the battlefield for Defend the City at night.
import * as THREE from 'three';
import { TOWN, townHeight, townLayout, inGate } from '../../shared/world.js';
import { fbm, smoothstep } from '../../shared/rng.js';
import { G } from '../state.js';
import { TOWN_WAYPOINT, CAPTAIN, QUESTS } from '../../shared/regions.js';
import { buildHumanoid, animateRig } from '../models.js';
import { makeSky, buildPortal, textures, Batcher, mtx, makeSun, followSun, makeGrass, heightTerrain, envFromSky } from './common.js';

const C = (h) => new THREE.Color(h);
const WATER_Y = -1.7;

export class TownZone {
  constructor(renderer) {
    this.type = 'town';
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.spawn = { ...TOWN.spawn };
    this.spawnYaw = 0;
    this.bloom = { strength: 0.35, radius: 0.5, threshold: 0.82 };
    this.exposure = 1.0;
    this.layout = townLayout();
    this.night = -1;
    this.build();
  }

  groundHeight(x, z) {
    const h = townHeight(x, z);
    const L = TOWN.lake;
    if (Math.hypot(x - L.x, z - L.z) < L.r + 4) return Math.max(h, WATER_Y - 0.6);
    return h;
  }

  build() {
    const s = this.scene, L = this.layout;
    s.fog = new THREE.FogExp2('#c4d6e6', 0.0065);
    this.sky = makeSky({ top: '#3f7fd6', horizon: '#cfe3f2', bottom: '#8aa0b0', sunDir: [0.5, 0.45, -0.55], sunColor: '#fff0c8', sunSize: 0.9993 });
    s.add(this.sky);
    this.envDay = envFromSky(this.renderer, this.sky);
    s.environment = this.envDay;
    s.environmentIntensity = 0.6;

    this.hemi = new THREE.HemisphereLight('#bcd7ff', '#5a4a30', 1.0); s.add(this.hemi);
    this.sun = makeSun('#fff1d6', 3.2, 45); s.add(this.sun, this.sun.target);
    this.sunOffset = new THREE.Vector3(40, 55, -45);

    // terrain
    const lanesDirt = (x, z) => {
      let m = 0;
      for (const a of TOWN.gates) {
        const px = Math.cos(a), pz = Math.sin(a), along = x * px + z * pz, perp = Math.abs(-x * pz + z * px);
        if (along > 12) m = Math.max(m, smoothstep(4.2, 2.2, perp + (fbm(x * 0.3, z * 0.3, 2) - 0.5) * 1.5) * (along < 95 ? 1 : 0));
      }
      return m;
    };
    this.lanesDirt = lanesDirt;
    const grassA = C('#4c7a2a'), grassB = C('#86ad45'), dirt = C('#8a6a45'), stone = C('#a69d8f'), stoneD = C('#7f776b'), rock = C('#7d746a'), sand = C('#c9b58a'), snow = C('#e8eef2');
    this.terrain = heightTerrain(260, 220, (x, z) => townHeight(x, z), (x, z, y, c) => {
      const r = Math.hypot(x, z);
      const n = fbm(x * 0.08, z * 0.08, 3);
      c.copy(grassA).lerp(grassB, smoothstep(0.3, 0.75, n));
      if (r > 52) c.lerp(rock, smoothstep(6, 16, y) * 0.85);
      if (y > 22) c.lerp(snow, smoothstep(22, 28, y));
      c.lerp(dirt, lanesDirt(x, z));
      if (r < 17) {
        const ring = Math.abs(Math.sin(r * 1.2)) > 0.93 || Math.abs(r - 8.5) < 0.3;
        const tile = (Math.floor(x * 0.7) + Math.floor(z * 0.7)) % 2 === 0;
        c.copy(ring ? stoneD : stone).multiplyScalar(tile ? 1 : 0.92);
        c.lerp(grassA, smoothstep(15.5, 17, r));
      }
      if (y < WATER_Y + 0.7 && Math.hypot(x - TOWN.lake.x, z - TOWN.lake.z) < TOWN.lake.r + 7) c.lerp(sand, smoothstep(WATER_Y + 0.7, WATER_Y + 0.1, y));
    });
    s.add(this.terrain);
    // paved plaza
    const plazaTex = textures.flagstone.clone(); plazaTex.repeat.set(9, 9); plazaTex.needsUpdate = true;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(16.2, 64), new THREE.MeshStandardMaterial({ map: plazaTex, bumpMap: plazaTex, bumpScale: 2, color: '#d9cfbf', roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.09; plaza.receiveShadow = true; s.add(plaza);
    const curb = new THREE.Mesh(new THREE.RingGeometry(16.2, 16.9, 64), new THREE.MeshStandardMaterial({ color: '#6e675e', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    curb.rotation.x = -Math.PI / 2; curb.position.y = 0.1; curb.receiveShadow = true; s.add(curb);

    // water
    const water = new THREE.Mesh(new THREE.CircleGeometry(TOWN.lake.r + 9, 64), new THREE.MeshStandardMaterial({ color: '#2a6a88', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.82 }));
    water.rotation.x = -Math.PI / 2; water.position.set(TOWN.lake.x, WATER_Y, TOWN.lake.z);
    s.add(water); this.water = water;

    // materials
    const stoneMat = new THREE.MeshStandardMaterial({ map: textures.rock, color: '#b3aca2', roughness: 0.9 });
    const darkStone = new THREE.MeshStandardMaterial({ map: textures.rock, color: '#6e6760', roughness: 0.95 });
    const plaster = new THREE.MeshStandardMaterial({ map: textures.plaster, roughness: 0.95 });
    const timber = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ map: textures.wood, roughness: 0.85 });
    const roofs = ['#8b3a2a', '#3d4f6b', '#6b4a2a', '#4f6a3a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true }));
    this.windowMat = new THREE.MeshStandardMaterial({ color: '#2a1a0a', emissive: '#ffb44a', emissiveIntensity: 0.2 });
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb050', emissiveIntensity: 0.3 });
    const iron = new THREE.MeshStandardMaterial({ color: '#2b2b30', metalness: 0.8, roughness: 0.45 });
    const clothMats = ['#b23a3a', '#2f6db3', '#d8a635', '#3a8a4a', '#8a3ab2'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
    this.stoneMat = stoneMat;

    const B = new Batcher();
    // walls
    const step = 4.2 / TOWN.wallR;
    for (let a = -Math.PI; a < Math.PI; a += step) {
      const mid = a + step / 2;
      const gateD = Math.min(...TOWN.gates.map((g) => Math.abs(((mid - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI)));
      if (gateD < TOWN.gateHalf + step * 0.3) continue;
      const x = Math.cos(mid) * TOWN.wallR, z = Math.sin(mid) * TOWN.wallR;
      const y = townHeight(x, z);
      const ry = -mid - Math.PI / 2;
      B.add(new THREE.BoxGeometry(4.5, 7, 1.8), stoneMat, mtx(x, y + 2.5, z, ry));
      B.add(new THREE.BoxGeometry(4.6, 0.5, 2.2), darkStone, mtx(x, y + 6, z, ry));
      for (const o of [-1.4, 0.2, 1.8]) {
        const tx = -Math.sin(mid) * o, tz = Math.cos(mid) * o;
        B.add(new THREE.BoxGeometry(0.9, 1, 0.5), stoneMat, mtx(x + tx + Math.cos(mid) * 0.8, y + 6.7, z + tz + Math.sin(mid) * 0.8, ry));
      }
    }
    // gate towers
    const roofRed = roofs[0];
    this.banners = [];
    const bannerMat = new THREE.MeshStandardMaterial({ color: '#8c1c1c', roughness: 0.9, side: THREE.DoubleSide, emissive: '#300', emissiveIntensity: 0.2 });
    for (const g of TOWN.gates) {
      for (const sd of [-1, 1]) {
        const a = g + sd * (TOWN.gateHalf + 0.05);
        const x = Math.cos(a) * TOWN.wallR, z = Math.sin(a) * TOWN.wallR, y = townHeight(x, z);
        B.add(new THREE.CylinderGeometry(2.3, 2.6, 10, 10), stoneMat, mtx(x, y + 4, z));
        B.add(new THREE.CylinderGeometry(2.8, 2.8, 0.6, 10), darkStone, mtx(x, y + 9.2, z));
        B.add(new THREE.ConeGeometry(3.1, 4, 10), roofRed, mtx(x, y + 11.5, z));
        const bn = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.4, 1, 6), bannerMat);
        bn.position.set(x + Math.cos(a) * 2.65, y + 6, z + Math.sin(a) * 2.65);
        bn.rotation.y = -a + Math.PI / 2;
        s.add(bn); this.banners.push(bn);
      }
      // arch beam over gate
      const x = Math.cos(g) * TOWN.wallR, z = Math.sin(g) * TOWN.wallR, y = townHeight(x, z);
      B.add(new THREE.BoxGeometry(10, 1.4, 2.2), darkStone, mtx(x, y + 7.6, z, -g - Math.PI / 2));
    }
    // houses
    const prism = (w, h, d) => {
      const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.lineTo(-w / 2, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g;
    };
    for (const h of L.houses) {
      const y0 = townHeight(h.x, h.z) - 0.2;
      const M = (lx, ly, lz) => { const v = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rot); return [h.x + v.x, y0 + ly, h.z + v.z]; };
      const add = (geo, mat, lx, ly, lz, rx = 0, ry = 0) => { const [x, y, z] = M(lx, ly, lz); B.add(geo, mat, mtx(x, y, z, h.rot + ry, rx)); };
      const top = h.h + (h.two ? 2.3 : 0);
      add(new THREE.BoxGeometry(h.w + 0.3, 0.6, h.d + 0.3), darkStone, 0, 0.3, 0);
      add(new THREE.BoxGeometry(h.w, h.h, h.d), plaster, 0, h.h / 2, 0);
      if (h.two) add(new THREE.BoxGeometry(h.w + 0.5, 2.3, h.d + 0.5), plaster, 0, h.h + 1.15, 0);
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.BoxGeometry(0.24, top, 0.24), timber, cx * (h.w / 2 + (h.two ? 0.25 : 0)), top / 2, cz * (h.d / 2 + (h.two ? 0.25 : 0)));
      add(new THREE.BoxGeometry(h.w + 0.1, 0.22, h.d + 0.1), timber, 0, h.h, 0);
      add(new THREE.BoxGeometry(0.18, h.h * 0.9, 0.05), timber, h.w * 0.25, h.h * 0.47, -h.d / 2 - 0.03, 0, 0);
      const rw = h.w + 1.0, rd = h.d + 1.0;
      add(prism(rw, 2.6, rd), roofs[h.roof], 0, top, 0, 0, 0);
      if (h.chimney) add(new THREE.BoxGeometry(0.7, 2.4, 0.7), darkStone, h.w * 0.28, top + 1.4, h.d * 0.18);
      add(new THREE.BoxGeometry(1.1, 2.0, 0.12), woodMat, -h.w * 0.15, 1.2, -h.d / 2 - 0.05);
      add(new THREE.BoxGeometry(0.8, 0.8, 0.1), this.windowMat, h.w * 0.3, h.h * 0.62, -h.d / 2 - 0.05);
      add(new THREE.BoxGeometry(0.1, 0.8, 0.8), this.windowMat, h.w / 2 + 0.05, h.h * 0.6, 0);
      add(new THREE.BoxGeometry(0.1, 0.8, 0.8), this.windowMat, -h.w / 2 - 0.05, h.h * 0.6, 0);
      if (h.two) add(new THREE.BoxGeometry(0.8, 0.8, 0.1), this.windowMat, -h.w * 0.2, h.h + 1.2, -h.d / 2 - 0.3);
    }
    // stalls
    for (const st of L.stalls) {
      const y0 = townHeight(st.x, st.z);
      const rotV = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), st.rot);
      for (const [px, pz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) { const v = rotV(px, pz); B.add(new THREE.BoxGeometry(0.15, 2.6, 0.15), timber, mtx(st.x + v.x, y0 + 1.3, st.z + v.z, st.rot)); }
      B.add(new THREE.BoxGeometry(2.8, 0.9, 1.2), woodMat, mtx(st.x, y0 + 0.45, st.z, st.rot));
      B.add(new THREE.BoxGeometry(3.1, 0.08, 2.1), clothMats[st.color], mtx(st.x, y0 + 2.7, st.z, st.rot, 0.25));
      for (let k = 0; k < 3; k++) { const v = rotV(-0.8 + k * 0.8, 0); B.add(new THREE.BoxGeometry(0.5, 0.35, 0.5), clothMats[(st.color + k + 1) % 5], mtx(st.x + v.x, y0 + 1.07, st.z + v.z, st.rot + k)); }
    }
    // lamps
    this.lampLights = [];
    for (const lp of L.lamps) {
      const y0 = townHeight(lp.x, lp.z);
      B.add(new THREE.CylinderGeometry(0.08, 0.12, 3.4, 6), iron, mtx(lp.x, y0 + 1.7, lp.z));
      B.add(new THREE.BoxGeometry(0.4, 0.5, 0.4), this.lampMat, mtx(lp.x, y0 + 3.5, lp.z));
      B.add(new THREE.ConeGeometry(0.4, 0.35, 4), iron, mtx(lp.x, y0 + 3.92, lp.z, Math.PI / 4));
      if (Math.hypot(lp.x, lp.z) < 16 && this.lampLights.length < 4) {
        const l = new THREE.PointLight('#ffb35a', 0, 16, 2); l.position.set(lp.x, y0 + 3.4, lp.z); s.add(l); this.lampLights.push(l);
      }
    }
    // ruins
    for (const r of L.ruins) {
      const y0 = townHeight(r.x, r.z);
      B.add(new THREE.CylinderGeometry(0.7, 0.8, r.h, 8), stoneMat, mtx(r.x, y0 + r.h / 2 - 0.3, r.z, 0, r.broken ? 0.08 : 0, r.broken ? 0.1 : 0));
      B.add(new THREE.BoxGeometry(1.8, 0.5, 1.8), darkStone, mtx(r.x, y0, r.z));
    }
    // bell
    {
      const { x, z } = TOWN.bell, y0 = townHeight(x, z);
      for (const sd of [-1, 1]) B.add(new THREE.BoxGeometry(0.35, 4.6, 0.35), timber, mtx(x + sd * 1.2, y0 + 2.3, z));
      B.add(new THREE.BoxGeometry(3, 0.35, 0.45), timber, mtx(x, y0 + 4.5, z));
      B.add(prism(3.4, 1.0, 1.4), roofRed, mtx(x, y0 + 4.65, z, Math.PI / 2 * 0));
      B.add(new THREE.CylinderGeometry(1.4, 1.6, 0.4, 10), darkStone, mtx(x, y0 + 0.2, z));
      const pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.25 + Math.pow(t, 2.2) * 0.6 + (i === 10 ? 0.08 : 0), -t * 1.3)); }
      const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshStandardMaterial({ color: '#b5822e', metalness: 1, roughness: 0.3, side: THREE.DoubleSide }));
      bell.castShadow = true;
      this.bellPivot = new THREE.Group(); this.bellPivot.position.set(x, y0 + 4.3, z); this.bellPivot.add(bell); s.add(this.bellPivot);
      this.bellSwing = 0;
    }
    B.build(s);

    // core (Ember Heart)
    {
      const g = new THREE.Group(); g.position.set(0, townHeight(0, 0), 0);
      const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
      add(new THREE.CylinderGeometry(2.8, 3.1, 0.6, 16), darkStone, 0.3);
      add(new THREE.CylinderGeometry(2.1, 2.4, 0.8, 16), stoneMat, 1.0);
      add(new THREE.CylinderGeometry(1.2, 1.6, 1.4, 8), stoneMat, 2.0);
      this.coreRuneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a2a').multiplyScalar(3) });
      const rune = add(new THREE.TorusGeometry(2.45, 0.06, 6, 48), this.coreRuneMat, 1.42); rune.rotation.x = Math.PI / 2;
      this.coreMat = new THREE.MeshStandardMaterial({ color: '#ffb050', emissive: '#ff7a1a', emissiveIntensity: 2.6, roughness: 0.2, metalness: 0.1, flatShading: true });
      this.coreCrystal = add(new THREE.OctahedronGeometry(1.1, 0), this.coreMat, 4.4); this.coreCrystal.scale.set(1, 1.7, 1);
      this.coreShards = [];
      for (let i = 0; i < 4; i++) { const sh = add(new THREE.OctahedronGeometry(0.28, 0), this.coreMat, 4.4); this.coreShards.push(sh); }
      this.coreLight = new THREE.PointLight('#ff8a30', 40, 26, 2); this.coreLight.position.y = 4.4; g.add(this.coreLight);
      s.add(g); this.core = g;
    }
    // portals
    this.portals = [];
    const mkPortal = (p, c1, c2) => {
      const pg = buildPortal(c1, c2, stoneMat);
      pg.position.set(p.x, townHeight(p.x, p.z), p.z);
      pg.lookAt(0, pg.position.y, 0);
      s.add(pg); this.portals.push(pg);
      return pg;
    };
    mkPortal(TOWN.dungeonPortal, '#ff4a10', '#ffb347');
    mkPortal(TOWN.darkPortal, '#3a0a6a', '#c77dff');

    // trees (instanced)
    const pineGeo = (() => {
      const parts = [[1.6, 2.2, 1.9], [1.25, 2.0, 2.9], [0.85, 1.7, 3.8]].map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 8); g.translate(0, y, 0); return g.toNonIndexed(); });
      return mergeAll(parts);
    })();
    const roundGeo = new THREE.IcosahedronGeometry(1.5, 1); roundGeo.translate(0, 3, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 2, 6); trunkGeo.translate(0, 1, 0);
    const pines = L.trees.filter((t) => t.kind === 0), rounds = L.trees.filter((t) => t.kind === 1);
    const foliageMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: 1 });
    const inst = (geo, mat, list, colorFn, yOff = 0) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const c = new THREE.Color();
      list.forEach((t, i) => { im.setMatrixAt(i, mtx(t.x, townHeight(t.x, t.z) + yOff, t.z, t.rot, 0, 0, t.s, t.s, t.s)); if (colorFn) { colorFn(c, t); im.setColorAt(i, c); } });
      im.castShadow = true; im.receiveShadow = true; s.add(im); return im;
    };
    inst(trunkGeo, trunkMat, L.trees, null, -0.1);
    inst(pineGeo, foliageMat, pines, (c) => c.setHSL(0.3 + Math.random() * 0.05, 0.45, 0.22 + Math.random() * 0.08));
    inst(roundGeo, foliageMat, rounds, (c) => c.setHSL(0.2 + Math.random() * 0.1, 0.5, 0.32 + Math.random() * 0.1));
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ map: textures.rock, color: '#9a938a', roughness: 0.95, flatShading: true });
    const rim = new THREE.InstancedMesh(rockGeo, rockMat, L.rocks.length);
    L.rocks.forEach((r, i) => rim.setMatrixAt(i, mtx(r.x, townHeight(r.x, r.z) - 0.2 * r.s, r.z, r.rot, r.rot * 0.5, 0, r.s, r.s * 0.7, r.s * 1.1)));
    rim.castShadow = rim.receiveShadow = true; s.add(rim);

    // grass + flowers
    const houseNear = (x, z) => L.houses.some((h) => Math.abs(h.x - x) < 4.5 && Math.abs(h.z - z) < 4.5);
    const sampler = () => {
      const a = Math.random() * Math.PI * 2, r = 16 + Math.pow(Math.random(), 0.8) * 82;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (lanesDirt(x, z) > 0.3 || houseNear(x, z) || Math.abs(r - TOWN.wallR) < 1.5) return null;
      const y = townHeight(x, z);
      if (y < WATER_Y + 0.3 || y > 14) return null;
      return { x, y, z };
    };
    this.grass = makeGrass(14000, sampler);
    s.add(this.grass);
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.6, emissive: '#111' }), 900);
    const fc = ['#ff5a6a', '#ffd84a', '#ffffff', '#b07aff', '#ff9a3c'].map(C);
    let fi = 0;
    for (let k = 0; k < 3000 && fi < 900; k++) { const p = sampler(); if (!p) continue; fl.setMatrixAt(fi, mtx(p.x, p.y + 0.35, p.z)); fl.setColorAt(fi, fc[fi % 5]); fi++; }
    fl.count = fi; s.add(fl);

    // chests
    this.chests = [];
    for (const ch of L.chests) {
      const g = new THREE.Group();
      g.position.set(ch.x, townHeight(ch.x, ch.z), ch.z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.85), woodMat); base.position.y = 0.38; base.castShadow = true; g.add(base);
      const goldM = new THREE.MeshStandardMaterial({ color: '#e0b040', metalness: 1, roughness: 0.3, emissive: '#ff9a20', emissiveIntensity: 0.4 });
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.12, 0.89), goldM); band.position.y = 0.6; g.add(band);
      const lidP = new THREE.Group(); lidP.position.set(0, 0.75, -0.42); g.add(lidP);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 1.3, 12, 1, false, 0, Math.PI), woodMat); lid.rotation.z = Math.PI / 2; lid.position.z = 0.42; lid.castShadow = true; lidP.add(lid);
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.08), goldM); lock.position.set(0, 0.62, 0.45); g.add(lock);
      g.rotation.y = Math.random() * 6;
      s.add(g);
      this.chests.push({ ...ch, g, lidP, open: false });
    }

    // trainer NPC & shared stash
    this.trainer = buildHumanoid({ cloth: '#2a3a5a', armor: '#c9a14a', cape: '#1a2a4a', chestPlate: true, weapon: 'hammer', rarity: 3, hair: '#d8d0c0' });
    this.trainer.root.position.set(TOWN.trainer.x, townHeight(TOWN.trainer.x, TOWN.trainer.z), TOWN.trainer.z);
    this.trainer.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    s.add(this.trainer.root);
    {
      const g = new THREE.Group(); g.position.set(TOWN.stash.x, townHeight(TOWN.stash.x, TOWN.stash.z), TOWN.stash.z);
      const iron = new THREE.MeshStandardMaterial({ color: '#3a4a6a', metalness: 0.8, roughness: 0.35 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.0), woodMat); body.position.y = 0.45; body.castShadow = true; g.add(body);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 12, 1, false, 0, Math.PI), woodMat); lid.rotation.z = Math.PI / 2; lid.position.y = 0.9; lid.castShadow = true; g.add(lid);
      for (const x of [-0.6, 0, 0.6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.42, 1.04), iron); b.position.set(x, 0.7, 0); g.add(b); }
      const rune = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ab0ff').multiplyScalar(1.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      rune.rotation.x = -Math.PI / 2; rune.position.y = 0.05; g.add(rune);
      g.rotation.y = Math.atan2(-TOWN.stash.x, -TOWN.stash.z);
      s.add(g); this.stashG = g;
    }
    // blacksmith: forge, anvil and smith
    {
      const S = TOWN.smith, y0 = townHeight(S.x, S.z);
      const g = new THREE.Group(); g.position.set(S.x, y0, S.z); g.rotation.y = Math.atan2(-S.x, -S.z);
      const forge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.6), darkStone); forge.position.set(-1.2, 0.8, -0.6); forge.castShadow = true; g.add(forge);
      const coals = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: '#ff5a1a', emissive: '#ff3a00', emissiveIntensity: 2.6 })); coals.position.set(-1.2, 1.62, -0.6); g.add(coals);
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 2.6, 8), darkStone); chim.position.set(-1.6, 2.9, -1.0); chim.castShadow = true; g.add(chim);
      const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.4), iron); anvil.position.set(1.0, 0.9, 0.3); anvil.castShadow = true; g.add(anvil);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.75, 8), woodMat); base.position.set(1.0, 0.37, 0.3); g.add(base);
      this.forgeLight = new THREE.PointLight('#ff6a20', 10, 9, 2); this.forgeLight.position.set(S.x, y0 + 2.2, S.z); s.add(this.forgeLight);
      s.add(g); this.forgeCoals = new THREE.Vector3(); coals.getWorldPosition(this.forgeCoals);
      this.smith = buildHumanoid({ bulk: 1.25, cloth: '#5a3a24', leather: '#2a1a10', skin: '#c89070', weapon: 'hammer', rarity: 0, hair: '#1a1008', chestPlate: false });
      this.smith.root.position.set(S.x + 0.6, y0, S.z + 0.9); this.smith.root.rotation.y = g.rotation.y + 1.8;
      this.smith.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      s.add(this.smith.root);
    }
    // Rift Obelisk + Hall of Embers leaderboard board
    {
      const O = TOWN.obelisk, y0 = townHeight(O.x, O.z);
      const g = new THREE.Group(); g.position.set(O.x, y0, O.z);
      const obs = new THREE.MeshStandardMaterial({ color: '#16101e', roughness: 0.25, metalness: 0.6, flatShading: true });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.6, 6), darkStone); base.position.y = 0.3; base.receiveShadow = true; g.add(base);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.85, 3.0, 5), obs); pillar.position.y = 2.0; pillar.castShadow = true; g.add(pillar);
      this.riftMat = new THREE.MeshStandardMaterial({ color: '#ff7a2a', emissive: '#c43aff', emissiveIntensity: 2.4, flatShading: true });
      this.riftGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), this.riftMat); this.riftGem.position.y = 4.4; this.riftGem.scale.y = 1.5; g.add(this.riftGem);
      this.riftRings = [0, 1].map((i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(1.1 + i * 0.4, 0.04, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(i ? '#c77dff' : '#ff9a3c').multiplyScalar(2) })); r.position.y = 4.4; g.add(r); return r; });
      s.add(g); this.obelisk = g;
      const B = TOWN.board, yb = townHeight(B.x, B.z);
      const bg = new THREE.Group(); bg.position.set(B.x, yb, B.z); bg.rotation.y = Math.atan2(-B.x, -B.z);
      for (const sx of [-1.2, 1.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), timber); post.position.set(sx, 1.5, 0); post.castShadow = true; bg.add(post); }
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 0.12), woodMat); panel.position.y = 2; panel.castShadow = true; bg.add(panel);
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const cx = cv.getContext('2d');
      cx.fillStyle = '#2a1a10'; cx.fillRect(0, 0, 256, 128); cx.fillStyle = '#ffd98a'; cx.font = 'bold 26px serif'; cx.textAlign = 'center'; cx.fillText('HALL OF EMBERS', 128, 44);
      cx.fillStyle = '#e8dcc4'; cx.font = '18px serif'; cx.fillText('Rift champions of the season', 128, 80); cx.fillText('★ ★ ★', 128, 108);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 })); face.position.set(0, 2, 0.07); bg.add(face);
      s.add(bg);
    }
    // waypoint stone + Captain Bryn
    {
      const W = TOWN_WAYPOINT, wy = townHeight(W.x, W.z);
      const wp = new THREE.Group(); wp.position.set(W.x, wy, W.z);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 3, 5), stoneMat); st.position.y = 1.5; st.castShadow = true; wp.add(st);
      this.wpRune = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ab0ff').multiplyScalar(2.5) })); this.wpRune.position.y = 2.2; wp.add(this.wpRune);
      s.add(wp);
      this.captain = buildHumanoid({ cloth: '#7a1c1c', armor: '#b0b8c0', cape: '#7a1c1c', chestPlate: true, weapon: 'sword', rarity: 2, offhand: 'shield', shieldColor: '#7a1c1c', hair: '#8a5a2a' });
      this.captain.root.position.set(CAPTAIN.x, townHeight(CAPTAIN.x, CAPTAIN.z), CAPTAIN.z);
      this.captain.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      s.add(this.captain.root);
      this.questMark = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd34d').multiplyScalar(2.5) }));
      this.questMark.position.set(CAPTAIN.x, townHeight(CAPTAIN.x, CAPTAIN.z) + 2.75, CAPTAIN.z); this.questMark.scale.y = 1.8; s.add(this.questMark);
    }
    // war table (defense research)
    {
      const W = TOWN.wartable, y0 = townHeight(W.x, W.z);
      const g = new THREE.Group(); g.position.set(W.x, y0, W.z); g.rotation.y = Math.atan2(-W.x, -W.z);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.5), woodMat); top.position.y = 1.0; top.castShadow = true; g.add(top);
      for (const [x, z] of [[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.15), timber); l.position.set(x, 0.5, z); g.add(l); }
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160; const cx = cv.getContext('2d');
      cx.fillStyle = '#d8c8a0'; cx.fillRect(0, 0, 256, 160); cx.strokeStyle = '#6a4a2a'; cx.lineWidth = 3; cx.beginPath(); cx.arc(128, 80, 55, 0, 7); cx.stroke();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; cx.beginPath(); cx.moveTo(128, 80); cx.lineTo(128 + Math.cos(a) * 75, 80 + Math.sin(a) * 75); cx.stroke(); }
      cx.fillStyle = '#c23a1a'; for (let i = 0; i < 9; i++) cx.fillRect(20 + Math.random() * 216, 10 + Math.random() * 140, 6, 6);
      const map = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv) }));
      map.material.map.colorSpace = THREE.SRGBColorSpace; map.rotation.x = -Math.PI / 2; map.position.y = 1.09; g.add(map);
      s.add(g);
    }
    this.buildMinimap();
    this.setupInteractables();
  }

  setupInteractables() {
    this.interactables = [
      { x: TOWN.dungeonPortal.x, z: TOWN.dungeonPortal.z, r: 4, mark: 'DUNGEON', label: () => `Enter the Dungeon — Depth ${G.roomLevel}`, action: () => G.actions.travel('dungeon') },
      { x: TOWN.darkPortal.x, z: TOWN.darkPortal.z, r: 4, mark: 'DARK WORLD', label: () => 'Enter the Dark World', action: () => G.actions.travel('dark') },
      { x: TOWN.trainer.x, z: TOWN.trainer.z, r: 3, mark: 'TRAINER', label: () => 'Talk to the Trainer (talents)', action: () => G.actions.openTalents(true) },
      { x: TOWN.smith.x, z: TOWN.smith.z, r: 3.4, mark: 'BLACKSMITH', label: () => 'Visit the Blacksmith (salvage, reroll, upgrade)', action: () => G.actions.openSmith() },
      { x: TOWN.obelisk.x, z: TOWN.obelisk.z, r: 3.4, mark: 'EMBER RIFTS', label: () => 'Open an Ember Rift (timed endgame)', action: () => G.actions.openRift() },
      { x: TOWN.board.x, z: TOWN.board.z, r: 3, mark: 'HALL OF EMBERS', label: () => 'Read the Hall of Embers (leaderboard)', action: () => G.actions.openBoard() },
      { x: TOWN.wartable.x, z: TOWN.wartable.z, r: 3, mark: 'WAR TABLE', label: () => 'Plan defenses at the War Table (research)', action: () => G.actions.openResearch() },
      { x: TOWN_WAYPOINT.x, z: TOWN_WAYPOINT.z, r: 3, mark: 'WAYPOINT', label: () => 'Use the waypoint (travel to regions)', action: () => G.actions.openWaypoint() },
      { x: CAPTAIN.x, z: CAPTAIN.z, r: 3, mark: 'CAPTAIN BRYN', label: () => 'Talk to Captain Bryn', action: () => G.actions.talk() },
      { x: TOWN.stash.x, z: TOWN.stash.z, r: 3, mark: 'STASH', label: () => 'Open the shared stash', action: () => G.actions.openStash() },
      { x: TOWN.bell.x, z: TOWN.bell.z, r: 3.2, mark: 'NIGHT BELL', label: () => (G.defense.phase === 'day' ? 'Ring the Night Bell — Defend the City' : null), action: () => G.actions.startNight() },
      ...this.chests.map((ch) => ({ x: ch.x, z: ch.z, r: 2.6, mark: null, label: () => (ch.open ? null : 'Open Ancient Chest'), action: () => G.actions.openChest(ch) })),
    ];
  }

  ringBell() { this.bellSwing = 1; }

  openChest(ch) {
    ch.open = true;
    ch.openT = 0;
  }

  buildMinimap() {
    const N = 256, W = 260;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    const col = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N - 0.5) * W, z = (j / N - 0.5) * W;
      const y = townHeight(x, z), r = Math.hypot(x, z);
      if (y < WATER_Y && Math.hypot(x - TOWN.lake.x, z - TOWN.lake.z) < TOWN.lake.r + 8) col.set('#2a6a88');
      else if (r < 17) col.set('#9a9284');
      else if (this.lanesDirt(x, z) > 0.4) col.set('#8a6a45');
      else col.setHSL(0.27, 0.35, 0.22 + Math.min(0.25, y * 0.012));
      if (Math.abs(r - TOWN.wallR) < 1.2 && !inGate(x, z)) col.set('#c9c0b2');
      const k = (j * N + i) * 4;
      img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#d9c7a8';
    for (const h of this.layout.houses) { ctx.save(); ctx.translate((h.x / W + 0.5) * N, (h.z / W + 0.5) * N); ctx.rotate(-h.rot); ctx.fillRect(-h.w * N / W / 2, -h.d * N / W / 2, h.w * N / W, h.d * N / W); ctx.restore(); }
    ctx.fillStyle = '#2d4a22';
    for (const t of this.layout.trees) { ctx.beginPath(); ctx.arc((t.x / W + 0.5) * N, (t.z / W + 0.5) * N, 1.3 * t.s, 0, 7); ctx.fill(); }
    this.map = { canvas: c, worldSize: W, center: { x: 0, z: 0 }, view: 70 };
    this.mapIcons = [
      { x: TOWN.dungeonPortal.x, z: TOWN.dungeonPortal.z, color: '#ff8a2a', icon: 'portal' },
      { x: TOWN.darkPortal.x, z: TOWN.darkPortal.z, color: '#c77dff', icon: 'portal' },
      { x: 0, z: 0, color: '#ffcf6a', icon: 'core' },
      { x: TOWN.bell.x, z: TOWN.bell.z, color: '#e0b040', icon: 'bell' },
      { x: TOWN.trainer.x, z: TOWN.trainer.z, color: '#5ab0ff', icon: 'npc' },
      { x: TOWN.stash.x, z: TOWN.stash.z, color: '#8fd0ff', icon: 'stash' },
      { x: TOWN.smith.x, z: TOWN.smith.z, color: '#ff8a3a', icon: 'npc' },
      { x: TOWN.obelisk.x, z: TOWN.obelisk.z, color: '#c77dff', icon: 'portal' },
    ];
  }

  collide(pos, r) {
    const d = Math.hypot(pos.x, pos.z);
    if (d > TOWN.bound) { pos.x *= TOWN.bound / d; pos.z *= TOWN.bound / d; }
    const dd = Math.hypot(pos.x, pos.z);
    if (Math.abs(dd - TOWN.wallR) < 1.0 + r && !inGate(pos.x, pos.z)) {
      const target = dd < TOWN.wallR ? TOWN.wallR - 1.0 - r : TOWN.wallR + 1.0 + r;
      pos.x *= target / dd; pos.z *= target / dd;
    }
    for (const c of this.layout.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      if (Math.abs(dx) > c.r + r || Math.abs(dz) > c.r + r) continue;
      const l = Math.hypot(dx, dz), min = c.r + r;
      if (l < min && l > 1e-4) { pos.x = c.x + (dx / l) * min; pos.z = c.z + (dz / l) * min; }
    }
    return pos;
  }

  setNight(f) {
    if (Math.abs(f - this.night) < 0.002 && this._mut === G.defense.mutator) return;
    this._mut = G.defense.mutator;
    this.night = f;
    const L = (a, b) => C(a).lerp(C(b), f);
    this.sun.intensity = 3.2 + (0.5 - 3.2) * f;
    this.sun.color.copy(L('#fff1d6', '#8fa8ff'));
    this.hemi.intensity = 1.0 + (0.32 - 1.0) * f;
    this.hemi.color.copy(L('#bcd7ff', '#3a4a80'));
    this.hemi.groundColor.copy(L('#5a4a30', '#141420'));
    const mut = G.defense.mutator;
    this.scene.fog.color.copy(L('#c4d6e6', mut === 'bloodmoon' ? '#2a0606' : mut === 'fog' ? '#4a5260' : '#0c1328'));
    this.scene.fog.density = 0.0065 + (mut === 'fog' ? 0.03 : 0.006) * f;
    const u = this.sky.material.uniforms;
    u.top.value.copy(L('#3f7fd6', '#02040e'));
    u.horizon.value.copy(L('#cfe3f2', '#16224a'));
    u.bottom.value.copy(L('#8aa0b0', '#05070f'));
    u.sunColor.value.copy(L('#fff0c8', mut === 'bloodmoon' ? '#ff4030' : '#dfe8ff'));
    if (mut === 'bloodmoon') u.horizon.value.lerp(new THREE.Color('#5a0a0a'), f);
    u.stars.value = f;
    u.moon.value = f > 0.5 ? 1 : 0;
    u.sunSize.value = 0.9993 - f * 0.0008;
    this.scene.environmentIntensity = 0.6 - 0.45 * f;
    this.windowMat.emissiveIntensity = 0.2 + 2.6 * f;
    this.lampMat.emissiveIntensity = 0.3 + 3.5 * f;
    for (const l of this.lampLights) l.intensity = 30 * f;
    this.bloom.strength = 0.35 + 0.45 * f;
    this.exposure = 1.0 - 0.1 * f;
  }

  update(dt, t, playerPos) {
    this.sky.position.copy(G.camera.position);
    this.sky.material.uniforms.time.value = t;
    followSun(this.sun, playerPos, this.sunOffset);
    this.grass.userData.uniforms.time.value = t;
    for (const p of this.portals) p.userData.update(t);
    // core
    const d = G.defense;
    const frac = d.phase === 'day' ? 1 : Math.max(0, d.coreHp / d.coreMax);
    this.coreCrystal.rotation.y = t * 0.6;
    this.coreCrystal.position.y = 4.4 + Math.sin(t * 1.5) * 0.25;
    this.coreShards.forEach((s, i) => { const a = t * 1.2 + (i / 4) * Math.PI * 2; s.position.set(Math.cos(a) * 1.9, 4.4 + Math.sin(t * 2 + i) * 0.5, Math.sin(a) * 1.9); s.rotation.y = t * 2; });
    this.coreMat.emissive.setRGB(1, 0.48 * frac + 0.05, 0.1 * frac);
    this.coreLight.intensity = (35 + Math.sin(t * 3) * 6) * (0.5 + frac * 0.5);
    // bell
    if (this.bellSwing > 0) { this.bellSwing = Math.max(0, this.bellSwing - dt * 0.3); this.bellPivot.rotation.x = Math.sin(t * 6) * 0.5 * this.bellSwing; }
    for (const b of this.banners) b.rotation.x = Math.sin(t * 2 + b.position.x) * 0.08;
    animateRig(this.trainer, { t, move: 0, atk: -1, slam: -1 });
    animateRig(this.captain, { t: t + 2, move: 0, atk: -1, slam: -1 });
    this.captain.root.rotation.y = Math.atan2(playerPos.x - CAPTAIN.x, playerPos.z - CAPTAIN.z);
    this.wpRune.rotation.y = t; this.wpRune.rotation.x = Math.sin(t) * 0.3;
    const qi = G.prof?.char?.quest?.i || 0; this.questMark.visible = qi === 0 || qi >= QUESTS.length ? qi === 0 : QUESTS[qi].kind === 'talk'; this.questMark.rotation.y = t * 2; this.questMark.position.y = townHeight(CAPTAIN.x, CAPTAIN.z) + 2.75 + Math.sin(t * 3) * 0.1;
    const hm = (t * 0.9) % 1; animateRig(this.smith, { t, move: 0, atk: hm < 0.6 ? hm / 0.6 : -1, combo: 2, slam: -1 });
    if (hm > 0.32 && hm < 0.36 && Math.random() < 0.7) G.fx.emit({ pos: this.smith.root.position.clone().add(new THREE.Vector3(0, 1, 0)), count: 10, speed: 4, color: '#ffe0a0', color2: '#ff4a00', size: 0.18, life: 0.4, gravity: 10 });
    this.forgeLight.intensity = 9 + Math.sin(t * 9) * 2;
    this.riftGem.rotation.y = t * 1.2; this.riftGem.position.y = 4.4 + Math.sin(t * 1.6) * 0.2; this.riftRings[0].rotation.set(t, t * 0.7, 0); this.riftRings[1].rotation.set(-t * 0.6, 0, t * 0.9);
    if (Math.random() < dt * 10) G.fx.emit({ pos: this.riftGem.getWorldPosition(new THREE.Vector3()), count: 1, speed: 1.2, color: Math.random() < 0.5 ? '#ff9a3c' : '#c77dff', color2: '#200040', size: 0.3, life: 1.2 });
    if (Math.random() < dt * 14) G.fx.emit({ pos: this.forgeCoals, count: 1, speed: 1, color: '#ffc060', color2: '#ff2000', size: 0.3, life: 0.8, up: 2, radius: 0.5 });
    this.trainer.root.rotation.y = Math.atan2(playerPos.x - TOWN.trainer.x, playerPos.z - TOWN.trainer.z);
    for (const ch of this.chests) if (ch.open && ch.lidP.rotation.x > -1.9) ch.lidP.rotation.x -= dt * 4;
    // night blend
    const target = d.phase === 'day' || d.phase === 'dawn' ? 0 : 1;
    G.nightF += (target - G.nightF) * Math.min(1, dt * 0.6);
    this.setNight(G.nightF);
    // ambient life
    if (Math.random() < dt * (G.nightF > 0.5 ? 12 : 4)) {
      const a = Math.random() * 6.28, r = 4 + Math.random() * 18;
      const x = playerPos.x + Math.cos(a) * r, z = playerPos.z + Math.sin(a) * r;
      G.fx.emit({ pos: new THREE.Vector3(x, this.groundHeight(x, z) + 0.5 + Math.random() * 2, z), count: 1, speed: 0.4, color: G.nightF > 0.5 ? '#c8ff6a' : '#fff6c0', color2: G.nightF > 0.5 ? '#4aff8a' : '#ffd890', size: G.nightF > 0.5 ? 0.18 : 0.08, life: 3, drag: 0.2 });
    }
    if (Math.random() < dt * 6) G.fx.emit({ pos: new THREE.Vector3(0, townHeight(0, 0) + 4.4, 0), count: 1, speed: 1.2, color: '#ffcf6a', color2: '#ff5a10', size: 0.2, life: 1.6, up: 1, drag: 0.5 });
  }
}

function mergeAll(geos) {
  // tiny merge helper for non-indexed geometries with the same attributes
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(n * size); let o = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
