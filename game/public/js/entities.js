// Client-side views of networked entities: enemies, other players, loot, projectiles, structures.
import * as THREE from 'three';
import { G, angleLerp, damp } from './state.js';
import { ENEMIES } from '../shared/enemies.js';
import { RARITIES, ARMOR } from '../shared/items.js';
import { STRUCTURES } from '../shared/world.js';
import { buildEnemy, buildHero, animateRig, flashRig, fadeRig, applyGear, buildWeapon, RARITY_TINT, RARITY_GLOW } from './models.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const entityRoot = new THREE.Group();
const labelsEl = document.getElementById('labels');
const _v = new THREE.Vector3();

export function placeLabel(el, pos, camera, maxDist = 40) {
  _v.copy(pos);
  const d = camera.position.distanceTo(pos);
  _v.project(camera);
  if (_v.z > 1 || d > maxDist || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { el.style.display = 'none'; return false; }
  el.style.display = '';
  el.style.left = (_v.x * 0.5 + 0.5) * innerWidth + 'px';
  el.style.top = (-_v.y * 0.5 + 0.5) * innerHeight + 'px';
  return true;
}

class HpBar {
  constructor(w = 1.1) {
    this.g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.06, 0.16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.7, depthWrite: false }));
    this.fillMat = new THREE.MeshBasicMaterial({ color: '#e8362a', depthWrite: false });
    const fg = new THREE.PlaneGeometry(w, 0.1); fg.translate(w / 2, 0, 0);
    this.fill = new THREE.Mesh(fg, this.fillMat); this.fill.position.set(-w / 2, 0, 0.001);
    this.g.add(bg, this.fill);
    this.g.renderOrder = 20;
  }
  set(frac, camera) {
    this.fill.scale.x = Math.max(0.001, frac);
    this.g.quaternion.copy(camera.quaternion);
  }
}

export class EnemyView {
  constructor(a) {
    const [id, type] = a;
    this.id = id; this.type = type; this.def = ENEMIES[type];
    this.rig = buildEnemy(type);
    this.root = this.rig.root;
    entityRoot.add(this.root);
    this.pos = new THREE.Vector3(a[2], 0, a[3]);
    this.target = { x: a[2], z: a[3] };
    this.ry = a[4];
    this.root.position.copy(this.pos);
    this.hp = a[5]; this.maxHp = a[6]; this.level = a[7];
    this.flash = 0; this.hurt = 0; this.atkT = -1; this.dead = false; this.deathT = 0; this.move = 0; this.slow = false;
    this.radius = this.def.radius;
    this.boss = !!this.def.boss;
    this.height = (this.boss ? 2.5 : type === 'brute' ? 1.45 : type === 'imp' ? 0.62 : 1) * 2.1;
    if (!this.boss) { this.bar = new HpBar(type === 'brute' ? 1.6 : 1.1); this.bar.g.visible = false; entityRoot.add(this.bar.g); }
    this.t = Math.random() * 10;
    this.attackDur = this.def.windup / 0.5;
    if (this.boss) G.fx.emit({ pos: this.pos.clone().setY(1), count: 60, speed: 6, color: '#ff4020', color2: '#400000', size: 0.6, life: 1.2, up: 1 });
  }
  apply(a) {
    this.target.x = a[2]; this.target.z = a[3]; this.ry = a[4];
    this.hp = a[5]; this.maxHp = a[6]; this.level = a[7];
    this.slow = !!(a[8] & 2);
  }
  attack() { this.atkT = 0; if (this.def.ranged) G.audio.bolt(); }
  hit(crit) { this.flash = 1; this.hurt = 1; }
  die() {
    if (this.dead) return;
    this.dead = true; this.deathT = 0;
    if (this.bar) this.bar.g.visible = false;
  }
  update(dt, zone, camera) {
    this.t += dt;
    if (!this.dead) {
      const px = this.pos.x, pz = this.pos.z;
      this.pos.x = damp(this.pos.x, this.target.x, 10, dt);
      this.pos.z = damp(this.pos.z, this.target.z, 10, dt);
      const sp = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-4);
      this.move = damp(this.move, Math.min(1.2, sp / (this.def.speed * 0.8)), 10, dt);
      this.root.rotation.y = angleLerp(this.root.rotation.y, this.ry, Math.min(1, dt * 12));
    }
    this.pos.y = zone.groundHeight(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    let atk = -1, cast = 0;
    if (this.atkT >= 0) {
      this.atkT += dt / this.attackDur;
      if (this.atkT >= 1) this.atkT = -1;
      else if (this.def.ranged) cast = Math.sin(this.atkT * Math.PI); else atk = this.atkT;
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    this.hurt = Math.max(0, this.hurt - dt * 5);
    animateRig(this.rig, { t: this.t, move: this.dead ? 0 : this.move, atk, combo: this.boss ? 2 : 0, slam: -1, cast, dead: this.dead ? Math.min(1, this.deathT * 1.4) : 0, hurt: this.hurt, float: this.type === 'wraith' });
    flashRig(this.rig, this.flash * 0.9 + (this.slow ? 0.15 : 0));
    if (this.dead) {
      this.deathT += dt;
      if (this.deathT > 1.1) fadeRig(this.rig, Math.max(0, 1 - (this.deathT - 1.1) / 0.6));
      if (this.deathT > 1.75) return false;
    }
    if (this.bar) {
      const show = !this.dead && this.hp < this.maxHp;
      this.bar.g.visible = show;
      if (show) { this.bar.g.position.set(this.pos.x, this.pos.y + this.height + 0.25, this.pos.z); this.bar.set(this.hp / this.maxHp, camera); }
    }
    if (this.type === 'wraith' && Math.random() < dt * 10) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 0.8), count: 1, speed: 0.5, color: '#b26bff', color2: '#200040', size: 0.35, life: 1, drag: 1, up: 0.5 });
    if (this.boss && Math.random() < dt * 25) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 1, speed: 1.2, color: '#ff5a2a', color2: '#300000', size: 0.5, life: 1.2, up: 1.5, radius: 1.5 });
    if (this.slow && Math.random() < dt * 8) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 1, speed: 0.5, color: '#bff4ff', color2: '#3ab0ff', size: 0.2, life: 0.8, radius: 0.5 });
    return true;
  }
  dispose() {
    entityRoot.remove(this.root);
    if (this.bar) entityRoot.remove(this.bar.g);
    this.rig.mats.forEach((m) => m.dispose());
  }
}

const ANIM = { idle: 0, run: 1, atk0: 2, atk1: 3, atk2: 4, slam: 5, dash: 6, dead: 7, air: 8 };
export { ANIM };

export class RemoteView {
  constructor(p) {
    this.id = p.id; this.color = p.color;
    this.rig = buildHero(p.color);
    this.root = this.rig.root;
    entityRoot.add(this.root);
    this.pos = new THREE.Vector3(p.x, p.y, p.z);
    this.target = new THREE.Vector3(p.x, p.y, p.z);
    this.ry = p.ry; this.t = 0; this.move = 0; this.lastAnim = 0; this.atkT = -1; this.combo = 0; this.slamT = -1; this.deadT = 0;
    this.tag = document.createElement('div'); this.tag.className = 'nametag';
    labelsEl.appendChild(this.tag);
    this.apply(p);
    this.pos.copy(this.target);
  }
  apply(p) {
    this.p = p;
    this.target.set(p.x, p.y, p.z); this.ry = p.ry;
    if (p.anim !== this.lastAnim) {
      if (p.anim >= 2 && p.anim <= 4) { this.atkT = 0; this.combo = p.anim - 2; }
      if (p.anim === 5) this.slamT = 0;
      this.lastAnim = p.anim;
    }
    if (p.gear) applyGear(this.rig, p.gear, p.color);
    this.tag.innerHTML = `<span style="color:${p.color}">${escapeHtml(p.name)}</span> <span style="color:#aaa;font-size:11px">Lv${p.level}</span><div class="hpm"><i style="width:${Math.max(0, (p.hp / p.maxHp) * 100)}%"></i></div>`;
  }
  update(dt, camera) {
    this.t += dt;
    const prev = this.pos.clone();
    this.pos.lerp(this.target, 1 - Math.exp(-12 * dt));
    const sp = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z) / Math.max(dt, 1e-4);
    this.move = damp(this.move, Math.min(1, sp / 6), 10, dt);
    this.root.position.copy(this.pos);
    this.root.rotation.y = angleLerp(this.root.rotation.y, this.ry, Math.min(1, dt * 15));
    let atk = -1, slam = -1;
    if (this.atkT >= 0) { this.atkT += dt / 0.45; if (this.atkT >= 1) this.atkT = -1; else atk = this.atkT; }
    if (this.slamT >= 0) { this.slamT += dt / 0.7; if (this.slamT >= 1) this.slamT = -1; else slam = this.slamT; }
    const dead = this.p.dead;
    this.deadT = dead ? Math.min(1, this.deadT + dt) : 0;
    animateRig(this.rig, { t: this.t, move: this.move, atk, combo: this.combo, slam, dash: this.p.anim === 6, air: this.p.anim === 8, dead: this.deadT });
    placeLabel(this.tag, _v.set(this.pos.x, this.pos.y + 2.5, this.pos.z), camera, 50);
  }
  dispose() { entityRoot.remove(this.root); this.tag.remove(); }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export { escapeHtml };

const beamMats = {};
function beamMat(color) {
  return beamMats[color] ||= new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 color; uniform float time; varying vec2 vUv; void main(){ float a=pow(1.-vUv.y,1.6)*(0.55+0.15*sin(time*4.+vUv.y*10.)); gl_FragColor=vec4(color*a*1.6,a); }',
  });
}

export class LootView {
  constructor(item, x, z, zone) {
    this.item = item;
    this.g = new THREE.Group();
    const y = zone.groundHeight(x, z);
    this.g.position.set(x, y, z);
    const col = RARITIES[item.rarity].color;
    let model;
    if (item.slot === 'weapon') { model = buildWeapon(item.type, item.rarity); model.scale.setScalar(0.8); model.rotation.z = 0.6; model.position.y = 0.3; }
    else {
      model = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: RARITY_TINT[item.rarity], metalness: 0.85, roughness: 0.3, emissive: col, emissiveIntensity: RARITY_GLOW[item.rarity] * 0.4 });
      if (item.slot === 'helm') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), mat); model.add(m); }
      else if (item.slot === 'chest') model.add(new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.6, 0.3, 2, 0.08), mat));
      else { for (const s of [-1, 1]) { const b = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.35, 0.3, 2, 0.05), mat); b.position.x = s * 0.13; model.add(b); } }
      model.position.y = 0.6;
    }
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.model = model; this.g.add(model);
    const h = 3 + item.rarity * 2.2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + item.rarity * 0.04, 0.3 + item.rarity * 0.06, h, 12, 1, true), beamMat(col));
    beam.position.y = h / 2; this.g.add(beam); this.beam = beam;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; this.g.add(ring); this.ring = ring;
    entityRoot.add(this.g);
    this.label = document.createElement('div'); this.label.className = 'lootlabel';
    this.label.style.color = col; this.label.textContent = item.name;
    labelsEl.appendChild(this.label);
    this.t = 0;
    G.fx.emit({ pos: this.g.position.clone().setY(y + 0.5), count: 20 + item.rarity * 15, speed: 4, color: col, color2: '#ffffff', size: 0.25, life: 0.9, up: 1.5 });
    if (item.rarity >= 3) G.fx.beam(this.g.position, col, 18, 1.4);
  }
  update(dt, camera) {
    this.t += dt;
    this.model.rotation.y += dt * 1.5;
    this.model.position.y = (this.item.slot === 'weapon' ? 0.3 : 0.6) + Math.sin(this.t * 2.5) * 0.1;
    this.beam.material.uniforms.time.value = this.t;
    this.ring.scale.setScalar(1 + Math.sin(this.t * 3) * 0.1);
    placeLabel(this.label, _v.set(this.g.position.x, this.g.position.y + 1.4, this.g.position.z), camera, 18);
  }
  dispose() { entityRoot.remove(this.g); this.label.remove(); }
}

export class ProjView {
  constructor(m, zone) {
    this.kind = m.kind; this.target = m.target;
    this.pos = new THREE.Vector3(m.x, 0, m.z);
    this.vel = new THREE.Vector3(m.vx || 0, 0, m.vz || 0);
    this.zone = zone;
    if (m.kind === 'bolt') {
      this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5cf0').multiplyScalar(3) }));
      this.h = 1.3;
    } else {
      this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe6a0').multiplyScalar(2) }));
      this.mesh.rotation.order = 'YXZ';
      this.h = 4;
      G.audio.arrow();
    }
    this.pos.y = zone.groundHeight(m.x, m.z) + this.h;
    this.mesh.position.copy(this.pos);
    entityRoot.add(this.mesh);
  }
  update(dt) {
    if (this.kind === 'arrow') {
      const e = G.enemies.get(this.target);
      if (e) {
        const to = new THREE.Vector3(e.pos.x, e.pos.y + 1, e.pos.z).sub(this.pos);
        const d = to.length();
        if (d > 0.1) { to.multiplyScalar(Math.min(d, 30 * dt) / d); this.pos.add(to); }
        this.mesh.rotation.y = Math.atan2(to.x, to.z); this.mesh.rotation.x = Math.PI / 2;
      }
    } else {
      this.pos.addScaledVector(this.vel, dt);
      this.pos.y = this.zone.groundHeight(this.pos.x, this.pos.z) + this.h;
      if (Math.random() < 0.8) G.fx.emit({ pos: this.pos, count: 1, speed: 0.3, color: '#ff8cf5', color2: '#6a00a0', size: 0.35, life: 0.4 });
    }
    this.mesh.position.copy(this.pos);
  }
  dispose() { entityRoot.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ---------- STRUCTURES ----------
const smat = {};
function sm(key, make) { return smat[key] ||= make(); }
export function buildStructure(kind, ghost = false) {
  const g = new THREE.Group();
  const wood = sm('wood', () => new THREE.MeshStandardMaterial({ color: '#7a5434', roughness: 0.9 }));
  const stone = sm('stone', () => new THREE.MeshStandardMaterial({ color: '#8f877c', roughness: 0.9 }));
  const iron = sm('iron', () => new THREE.MeshStandardMaterial({ color: '#2b2b30', metalness: 0.8, roughness: 0.4 }));
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  if (kind === 'barricade') {
    for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.18, 0.18, 3, 8), wood, 0, 0.3 + i * 0.38, 0, 0, 0, Math.PI / 2);
    for (let i = -1; i <= 1; i++) add(new THREE.ConeGeometry(0.12, 1.2, 6), wood, i * 1.1, 0.8, 0.45, 1.0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2, 1.4, 1.0), wood, s * 1.3, 0.6, 0, 0.3);
  } else if (kind === 'tower') {
    add(new THREE.CylinderGeometry(1.0, 1.3, 2.4, 10), stone, 0, 1.2, 0);
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) add(new THREE.BoxGeometry(0.14, 1.8, 0.14), wood, x, 3.2, z);
    add(new THREE.BoxGeometry(1.9, 0.2, 1.9), wood, 0, 2.5, 0);
    add(new THREE.ConeGeometry(1.5, 1.2, 4), sm('roof', () => new THREE.MeshStandardMaterial({ color: '#8b3a2a', roughness: 0.8, flatShading: true })), 0, 4.6, 0, 0, Math.PI / 4);
    const xb = new THREE.Group(); xb.position.y = 3.0; g.add(xb);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.1), wood); xb.add(b);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.08), iron); bow.position.z = 0.4; xb.add(bow);
    g.userData.turret = xb;
  } else if (kind === 'brazier') {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; add(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), iron, Math.cos(a) * 0.35, 0.6, Math.sin(a) * 0.35, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
    add(new THREE.CylinderGeometry(0.7, 0.35, 0.5, 12), iron, 0, 1.3, 0);
    add(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 12), sm('coal', () => new THREE.MeshStandardMaterial({ color: '#ff5a1a', emissive: '#ff3a00', emissiveIntensity: 2.5 })), 0, 1.5, 0);
  } else if (kind === 'frost') {
    add(new THREE.CylinderGeometry(0.4, 0.55, 2.0, 6), stone, 0, 1.0, 0);
    const c = add(new THREE.OctahedronGeometry(0.45, 0), sm('ice', () => new THREE.MeshStandardMaterial({ color: '#bff4ff', emissive: '#3ab0ff', emissiveIntensity: 2.2, roughness: 0.1, flatShading: true })), 0, 2.8, 0);
    c.scale.y = 1.6; g.userData.crystal = c;
  }
  if (ghost) g.traverse((o) => { if (o.isMesh) { o.material = sm('ghost', () => new THREE.MeshBasicMaterial({ color: '#5eea8a', transparent: true, opacity: 0.4, depthWrite: false })); o.castShadow = false; } });
  return g;
}

export class StructView {
  constructor(s, zone) {
    this.s = s; this.kind = s.kind;
    this.g = buildStructure(s.kind);
    this.g.position.set(s.x, zone.groundHeight(s.x, s.z), s.z);
    this.g.rotation.y = Math.atan2(-s.x, -s.z);
    entityRoot.add(this.g);
    this.bar = new HpBar(1.4); this.bar.g.visible = false; this.bar.fillMat.color.set('#5ab0ff');
    entityRoot.add(this.bar.g);
    this.t = Math.random() * 5;
    this.pop = 0;
  }
  update(dt, camera) {
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt * 4);
    const k = this.pop < 1 ? 1 + Math.sin(this.pop * Math.PI) * 0.25 : 1;
    this.g.scale.set(k, this.pop < 1 ? this.pop * k : 1, k);
    const p = this.g.position;
    if (this.kind === 'brazier' && Math.random() < dt * 25) G.fx.emit({ pos: new THREE.Vector3(p.x, p.y + 1.6, p.z), count: 1, speed: 1.2, color: '#ffc060', color2: '#ff1a00', size: 0.45, life: 0.8, up: 2, radius: 0.4 });
    if (this.kind === 'brazier' && G.defense.phase === 'wave' && Math.random() < dt * 6) G.fx.emit({ pos: new THREE.Vector3(p.x, p.y + 0.2, p.z), count: 1, speed: 0.2, color: '#ff6a2a', color2: '#400', size: 0.25, life: 1, radius: STRUCTURES.brazier.radius });
    if (this.kind === 'frost') {
      const c = this.g.userData.crystal; c.rotation.y = this.t; c.position.y = 2.8 + Math.sin(this.t * 2) * 0.15;
      if (Math.random() < dt * 8) G.fx.emit({ pos: new THREE.Vector3(p.x, p.y + 0.3, p.z), count: 1, speed: 0.3, color: '#dffaff', color2: '#3ab0ff', size: 0.2, life: 1.5, radius: STRUCTURES.frost.radius, up: 0.5 });
    }
    if (this.kind === 'tower') {
      let best = null, bd = STRUCTURES.tower.range;
      for (const e of G.enemies.values()) { if (e.dead) continue; const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z); if (d < bd) { bd = d; best = e; } }
      if (best) this.g.userData.turret.rotation.y = angleLerp(this.g.userData.turret.rotation.y, Math.atan2(best.pos.x - p.x, best.pos.z - p.z) - this.g.rotation.y, dt * 8);
    }
    const show = this.s.hp < this.s.maxHp;
    this.bar.g.visible = show;
    if (show) { this.bar.g.position.set(p.x, p.y + (this.kind === 'tower' ? 5.6 : 3), p.z); this.bar.set(this.s.hp / this.s.maxHp, camera); }
  }
  dispose() { entityRoot.remove(this.g); entityRoot.remove(this.bar.g); }
}

export { ARMOR };
