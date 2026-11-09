import * as THREE from 'three';
import { heightAt, setGroundProvider, setBlockProvider, VOLCANO } from './terrain.js';
import { createNoise2D, mulberry32, smoothstep, clamp } from './noise.js';
import { crystalGeo, obsidianGeo } from './world.js';
import { lavaMaterial } from './volcano.js';
import { mergeParts, mtx } from './util.js';

// Caves are enclosed spaces built far outside the island (x > 2000) and reached through
// entrance arches on the surface. Each cave is a floor + ceiling height-field pair that pinch
// together at the walls, so the shared heightAt() keeps players, creatures and building
// placement working underground. A torch light follows the player inside.
const H = 6.5;           // max ceiling gap
const WALL = 4.5;        // distance over which the gap closes at the walls
const BASE = 6;          // floor height (kept above the sea plane)
const RES = 1.25;
const noise = createNoise2D(31337);

const THEMES = {
  lava:    { name: 'Ember Depths', floor: 0x3a2a24, ceil: 0x1e1614, temp: 32, fog: 0x1a0a04, light: 0xff9a5a },
  crystal: { name: 'Glimmer Grotto', floor: 0x3a4048, ceil: 0x22262e, temp: 11, fog: 0x04080e, light: 0xbfe6ff },
  moss:    { name: 'Rootway Hollow', floor: 0x3a4430, ceil: 0x222a1c, temp: 16, fog: 0x050804, light: 0xffe0a8 },
};

const segDist = (px, pz, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
};

class Cave {
  constructor(id, theme, origin, seed, entrance) {
    this.id = id; this.theme = theme; this.t = THEMES[theme]; this.name = this.t.name;
    this.origin = origin; this.entrance = entrance;
    const rand = mulberry32(seed);
    // chain of chambers with one side branch; the last chamber holds the cache
    const ch = [{ x: 0, z: 0, r: 7 }];
    let ang = 0;
    for (let i = 0; i < 5; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const a = ang + (rand() - 0.5) * 1.6, d = 20 + rand() * 8, r = i === 4 ? 14 : 8 + rand() * 5;
        const p = ch[ch.length - 1], c = { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, r };
        if (ch.slice(0, -1).every((o) => Math.hypot(o.x - c.x, o.z - c.z) > o.r + c.r + 4)) { ch.push(c); ang = a; break; }
      }
    }
    const tunnels = ch.slice(1).map((c, i) => ({ a: ch[i], b: c, w: 3.2 }));
    const mid = ch[2], side = { x: mid.x + Math.cos(ang + 1.8) * 20, z: mid.z + Math.sin(ang + 1.8) * 20, r: 8 };
    if (ch.every((o) => Math.hypot(o.x - side.x, o.z - side.z) > o.r + side.r + 3)) { ch.push(side); tunnels.push({ a: mid, b: side, w: 3 }); }
    this.chambers = ch.map((c) => ({ ...c, x: c.x + origin.x, z: c.z + origin.z }));
    this.tunnels = tunnels.map((t) => ({ w: t.w, ax: t.a.x + origin.x, az: t.a.z + origin.z, bx: t.b.x + origin.x, bz: t.b.z + origin.z }));
    this.cacheChamber = this.chambers[Math.min(5, this.chambers.length - 1)];
    this.pools = theme === 'lava' ? this.chambers.slice(2, 5).map((c, i) => ({ x: c.x + (i - 1) * 2, z: c.z + 2, r: 3 + i * 0.6 })) : [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of this.chambers) { x0 = Math.min(x0, c.x - c.r); x1 = Math.max(x1, c.x + c.r); z0 = Math.min(z0, c.z - c.r); z1 = Math.max(z1, c.z + c.r); }
    this.box = { x0: x0 - 6, x1: x1 + 6, z0: z0 - 6, z1: z1 + 6 };
    this.lootedDay = -99;
  }

  contains(x, z) { const b = this.box; return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1; }

  sdf(x, z) {
    let d = Infinity;
    for (const c of this.chambers) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r);
    for (const t of this.tunnels) d = Math.min(d, segDist(x, z, t.ax, t.az, t.bx, t.bz) - t.w);
    return d;
  }

  gap(x, z) { return H * smoothstep(0, WALL, -this.sdf(x, z)) * (0.85 + noise(x * 0.08, z * 0.08) * 0.15); }

  floor(x, z) {
    const g = this.gap(x, z);
    let f = BASE + noise(x * 0.05, z * 0.05) * 1.0 + (H - g) * 0.5;
    for (const p of this.pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 1.5) f -= (1 - smoothstep(p.r - 1, p.r + 1.5, d)) * 1.4; }
    return f;
  }

  inLava(x, z, y) { return this.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r - 0.3) && y < BASE + 0.2; }

  build(scene, mats) {
    const b = this.box;
    const nx = Math.ceil((b.x1 - b.x0) / RES), nz = Math.ceil((b.z1 - b.z0) / RES);
    const fl = [], ce = [], cf = [], cc = [], gaps = new Float32Array((nx + 1) * (nz + 1));
    const cF = new THREE.Color(this.t.floor), cC = new THREE.Color(this.t.ceil), tmp = new THREE.Color();
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = b.x0 + i * RES, z = b.z0 + j * RES;
      const g = this.gap(x, z), f = this.floor(x, z);
      gaps[j * (nx + 1) + i] = g;
      fl.push(x, f, z); ce.push(x, f + g + noise(x * 0.2, z * 0.2) * 0.3 * Math.min(1, g), z);
      const v = 0.8 + noise(x * 0.3, z * 0.3) * 0.2;
      tmp.copy(cF).multiplyScalar(v); cf.push(tmp.r, tmp.g, tmp.b);
      tmp.copy(cC).multiplyScalar(v); cc.push(tmp.r, tmp.g, tmp.b);
    }
    const idxF = [], idxC = [];
    const at = (i, j) => j * (nx + 1) + i;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = at(i, j), b2 = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      if (Math.max(gaps[a], gaps[b2], gaps[c], gaps[d]) <= 0.001) continue;
      idxF.push(a, c, b2, b2, c, d);
      idxC.push(a, b2, c, b2, d, c);
    }
    const mk = (pos, col, idx) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mats.rock);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    this.meshes = [mk(fl, cf, idxF), mk(ce, cc, idxC)];
    for (const p of this.pools) {
      const lava = new THREE.Mesh(new THREE.CircleGeometry(p.r, 24), mats.lava);
      lava.rotation.x = -Math.PI / 2; lava.position.set(p.x, BASE - 0.3, p.z);
      scene.add(lava);
    }
    // exit arch glow at the start chamber
    const start = this.chambers[0];
    this.exitPos = new THREE.Vector3(start.x - 4, this.floor(start.x - 4, start.z), start.z);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false }));
    glow.position.copy(this.exitPos).add(new THREE.Vector3(-1, 1.7, 0)); glow.rotation.y = Math.PI / 2;
    scene.add(glow);
    this.spawnPos = new THREE.Vector3(start.x + 1, this.floor(start.x + 1, start.z) + 0.1, start.z);
  }
}

export class Caves {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.mats = {
      rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }),
      lava: lavaMaterial(game.shared),
      crystal: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x2a9ad8, emissiveIntensity: 0.9, roughness: 0.2 }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.35, flatShading: true }),
      moss: new THREE.MeshStandardMaterial({ color: 0x6ad84a, emissive: 0x3ab02a, emissiveIntensity: 0.7, roughness: 0.9 }),
    };
    this.list = [
      new Cave(0, 'lava', { x: 2300, z: 0 }, 11, this.findEntrance(VOLCANO.x - 80, VOLCANO.z + 40, 12, 45)),
      new Cave(1, 'crystal', { x: 2700, z: 0 }, 22, this.findEntrance(-150, -150, 22, 55)),
      new Cave(2, 'moss', { x: 3100, z: 0 }, 33, this.findEntrance(-250, 40, 8, 26)),
    ];
    setGroundProvider((x, z) => { for (const c of this.list) if (c.contains(x, z)) return c.floor(x, z); return undefined; });
    setBlockProvider((x, z) => { for (const c of this.list) if (c.contains(x, z)) return c.gap(x, z) < 2.3; return false; });
    for (const c of this.list) { c.build(scene, this.mats); this.buildEntrance(c); this.decorate(c); }
    this.torch = new THREE.PointLight(0xffd8a0, 0, 26, 1.4);
    scene.add(this.torch);
    this.current = null;
  }

  findEntrance(cx, cz, hMin, hMax) {
    const rand = mulberry32(Math.round(cx * 7 + cz));
    let best = null;
    for (let i = 0; i < 400; i++) {
      const x = cx + (rand() - 0.5) * 120, z = cz + (rand() - 0.5) * 120, h = heightAt(x, z);
      if (h < hMin || h > hMax) continue;
      const slope = Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)) + Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2));
      if (!best || slope > best.s) best = { x, z, h, s: slope };   // hillsides make natural cave mouths
    }
    const gx = heightAt(best.x + 2, best.z) - heightAt(best.x - 2, best.z), gz = heightAt(best.x, best.z + 2) - heightAt(best.x, best.z - 2);
    const out = new THREE.Vector3(-gx, 0, -gz).normalize(); // faces downhill
    return { pos: new THREE.Vector3(best.x, best.h, best.z), out };
  }

  buildEntrance(c) {
    const e = c.entrance, scene = this.game.scene;
    const rock = new THREE.MeshStandardMaterial({ color: c.theme === 'lava' ? 0x2a2420 : 0x5a5650, roughness: 0.95, flatShading: true });
    const g = new THREE.Group();
    const parts = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      parts.push({ geo: new THREE.DodecahedronGeometry(1.1 + (i % 3) * 0.2), color: 0xffffff, matrix: mtx(Math.cos(a) * 2.8, Math.sin(a) * 3.4, 0, i, i * 2, 0) });
    }
    const arch = new THREE.Mesh(mergeParts(parts), rock); arch.castShadow = true; g.add(arch);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    mouth.position.z = -0.4; g.add(mouth);
    const floorMouth = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.2), new THREE.MeshBasicMaterial({ color: 0x050505 })); floorMouth.position.set(0, 0.1, -0.4); g.add(floorMouth);
    const tint = { lava: 0xff6a1a, crystal: 0x5ac8ff, moss: 0x8ad86a }[c.theme];
    const sign = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 1.4 }));
    sign.position.set(0, 4.6, 0.3); g.add(sign);
    g.position.copy(e.pos).add(new THREE.Vector3(0, -0.3, 0));
    g.rotation.y = Math.atan2(e.out.x, e.out.z);
    scene.add(g);
    for (const k of [-1, 1]) this.game.world.colliders.add({ x: e.pos.x + Math.cos(g.rotation.y) * k * 2.8, z: e.pos.z - Math.sin(g.rotation.y) * k * 2.8, r: 1.1 });
    c.entranceGroup = g;
    c.outsidePos = e.pos.clone().addScaledVector(e.out, 4); c.outsidePos.y = heightAt(c.outsidePos.x, c.outsidePos.z);
  }

  decorate(c) {
    const rand = mulberry32(c.id * 999 + 7);
    const g = this.game;
    const edgeSpots = (n, minGap, maxGap) => {
      const out = [];
      for (let i = 0; i < n * 40 && out.length < n; i++) {
        const ch = c.chambers[1 + Math.floor(rand() * (c.chambers.length - 1))];
        const a = rand() * Math.PI * 2, d = rand() * ch.r;
        const x = ch.x + Math.cos(a) * d, z = ch.z + Math.sin(a) * d, gp = c.gap(x, z);
        if (gp > minGap && gp < maxGap && !c.inLava(x, z, 0)) out.push({ x, y: c.floor(x, z), z, rot: rand() * 6, scl: 0.8 + rand() * 0.5 });
      }
      return out;
    };
    if (c.theme === 'crystal') {
      g.world.addNodeSet('crystal', crystalGeo(rand), this.mats.crystal, edgeSpots(22, 2.6, 5.5));
    }
    if (c.theme === 'lava') g.world.addNodeSet('obsidian', obsidianGeo(rand), this.mats.glass, edgeSpots(18, 2.6, 5.5));
    if (c.theme === 'moss') {
      // rich metal veins and glowing moss
      const ore = g.world.nodes.find((n) => n.type === 'metal');
      if (ore) g.world.addNodeSet('metal', ore.mesh.geometry, ore.mesh.material, edgeSpots(16, 2.6, 5.5));
      const mossGeo = new THREE.SphereGeometry(0.6, 8, 5);
      for (const s of edgeSpots(40, 0.5, 3)) {
        const m = new THREE.Mesh(mossGeo, this.mats.moss); m.position.set(s.x, s.y + 0.1, s.z); m.scale.set(1.5 + rand(), 0.25, 1.5 + rand()); this.game.scene.add(m);
      }
    }
    // ceiling crystals for atmosphere in every cave
    const deco = mergeParts(edgeSpots(30, 3, 7).map((s) => ({ geo: new THREE.ConeGeometry(0.12, 0.8 + rand(), 5), color: c.theme === 'lava' ? 0xff8a3a : c.theme === 'moss' ? 0x9ae87a : 0x9ae0ff,
      matrix: mtx(s.x, s.y + c.gap(s.x, s.z) - 0.4, s.z, Math.PI, 0, 0) })));
    this.game.scene.add(new THREE.Mesh(deco, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: c.theme === 'lava' ? 0xff4a0a : c.theme === 'moss' ? 0x3aa82a : 0x2a8ad8, emissiveIntensity: 0.8 })));
    // ancient cache in the deepest chamber
    const ch = c.cacheChamber;
    c.cachePos = new THREE.Vector3(ch.x, c.floor(ch.x, ch.z), ch.z);
    const box = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a83a, emissive: 0xb8781a, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.1), wood); b1.position.y = 0.5; box.add(b1);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 10, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.y = 1; box.add(lid);
    for (const x of [-0.6, 0.6]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 1.16), gold); band.position.set(x, 0.75, 0); box.add(band); }
    box.position.copy(c.cachePos); box.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.game.scene.add(box);
    c.cacheMesh = box;
  }

  // Populate cave wildlife (called on entering so the island's population isn't affected).
  populate(c) {
    const g = this.game;
    const want = { lava: [['cinderback', 2], ['duskraptor', 3]], crystal: [['duskraptor', 6]], moss: [['dashbeak', 6], ['duskraptor', 2]] }[c.theme];
    for (const [sp, n] of want) {
      const have = g.creatures.list.filter((x) => x.cave === c && x.species === sp && x.alive && !x.tamed).length;
      for (let i = have; i < n; i++) {
        const ch = c.chambers[2 + (i % (c.chambers.length - 2))];
        const p = new THREE.Vector3(ch.x + (Math.random() - 0.5) * ch.r, 0, ch.z + (Math.random() - 0.5) * ch.r);
        p.y = c.floor(p.x, p.z);
        const cr = g.creatures.spawn(sp, p);
        cr.cave = c; cr.home = new THREE.Vector3(ch.x, p.y, ch.z); cr.homeR = Math.max(3, ch.r - 3);
        if (Math.random() < 0.12) g.creatures.makeAlpha(cr);
      }
    }
  }

  at(pos) { return this.list.find((c) => c.contains(pos.x, pos.z)) || null; }
  entranceNear(pos) { return this.list.find((c) => c.entrance.pos.distanceTo(pos) < 5); }
  exitNear(pos) { const c = this.at(pos); return c && c.exitPos.distanceTo(pos) < 4 ? c : null; }
  cacheNear(pos) { const c = this.at(pos); return c && c.cachePos.distanceTo(pos) < 3 ? c : null; }
  lavaAt(pos) { const c = this.at(pos); return !!(c && c.inLava(pos.x, pos.z, pos.y)); }

  travel(to, c) {
    const g = this.game, p = g.player;
    const fade = document.getElementById('sleep-fade');
    fade.classList.add('show');
    g.input.keys = {};
    setTimeout(() => {
      const dest = to === 'in' ? c.spawnPos.clone() : c.outsidePos.clone();
      const m = p.mount;
      if (m) { m.pos.copy(dest); m.pos.y = heightAt(dest.x, dest.z); m.flying = false; }
      else { p.pos.copy(dest); p.vel.set(0, 0, 0); }
      p.yaw = to === 'in' ? -Math.PI / 2 : Math.atan2(-c.entrance.out.x, -c.entrance.out.z) + Math.PI;
      // following tames come along
      for (const t of g.creatures.list) {
        if (!t.tamed || !t.alive || !t.follow || t.riddenBy || t.def.swimmer) continue;
        if (t.pos.distanceTo(to === 'in' ? c.outsidePos : c.spawnPos) > 60 && t.pos.distanceTo(c.entrance.pos) > 60) continue;
        t.flying = false;
        t.pos.copy(dest).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
        t.pos.y = heightAt(t.pos.x, t.pos.z);
      }
      if (to === 'in') { this.populate(c); g.ui.banner(c.name.toUpperCase(), 'An ancient cache waits in the deepest chamber'); g.stats.cavesVisited = Math.max(g.stats.cavesVisited || 0, 1); }
      else g.ui.notify('You emerge into daylight');
      g.saves.markDirty();
    }, 700);
    setTimeout(() => fade.classList.remove('show'), 1400);
  }

  openCache(c) {
    const g = this.game;
    if (g.env.day - c.lootedDay < 2) { g.ui.notify(`The cache is empty. It refills in ${2 - (g.env.day - c.lootedDay)} day(s).`, 'warn'); return; }
    c.lootedDay = g.env.day;
    const loot = {
      lava: [['obsidian', 10], ['ingot', 12], ['trophy', 1], ['cooked', 6]],
      crystal: [['crystal', 10], ['ingot', 10], ['arrow', 25], ['saddle', 1]],
      moss: [['ingot', 8], ['seed', 6], ['dozeseed', 4], ['hidearmor', 1], ['meat', 8]],
    }[c.theme];
    for (const [id, n] of loot) g.give(id, n);
    g.stats.caches = (g.stats.caches || 0) + 1;
    g.player.addXP(60, g.xpHooks);
    g.ui.banner('ANCIENT CACHE', `${c.name} gives up its treasure`);
    g.audio.tamed();
    g.saves.markDirty();
  }

  // Per-frame: darkness, torch, temperature override.
  update(dt) {
    const g = this.game, p = g.player;
    const c = this.at(p.pos);
    if (c !== this.current) { this.current = c; }
    const lantern = g.activeItem()?.id === 'lantern';
    if (c) {
      g.env.sun.intensity = 0;
      g.env.hemi.intensity = 0.05;
      g.scene.fog.color.set(c.t.fog);
      g.scene.fog.density = 0.022;
      g.weather.rain.visible = false;
      this.torch.color.set(lantern ? 0xbfeaff : c.t.light);
      this.torch.intensity = lantern ? 22 : 12;
      this.torch.distance = lantern ? 36 : 22;
    } else {
      this.torch.intensity = lantern && g.env.daylight < 0.5 ? 18 : 0;
      this.torch.color.set(0xbfeaff); this.torch.distance = 34;
    }
    this.torch.position.copy(p.pos).add(new THREE.Vector3(0, 3.2, 0));
  }

  serialize() { return this.list.map((c) => c.lootedDay); }
  load(arr) { (arr || []).forEach((d, i) => { if (this.list[i]) this.list[i].lootedDay = d; }); }
}
