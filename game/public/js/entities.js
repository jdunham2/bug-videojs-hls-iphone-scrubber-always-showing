// Client-side views of networked entities: enemies, other players, loot, projectiles, structures, hazards.
import * as THREE from 'three';
import { G, angleLerp, damp } from './state.js';
import { ENEMIES, AFFIXES, AFFIX_KEYS } from '../shared/enemies.js';
import { RARITIES } from '../shared/items.js';
import { STRUCTURES } from '../shared/world.js';
import { buildEnemy, buildHero, animateRig, animateSpider, flashRig, fadeRig, applyGear, buildWeapon, RARITY_TINT, RARITY_GLOW } from './models.js';
import { buildSpiritMesh } from './skills.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const entityRoot = new THREE.Group();
const labelsEl = document.getElementById('labels');
const _v = new THREE.Vector3();
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

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
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

class HpBar {
  constructor(w = 1.1) {
    this.g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.06, 0.16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.7, depthWrite: false }));
    this.fillMat = new THREE.MeshBasicMaterial({ color: '#e8362a', depthWrite: false });
    const fg = new THREE.PlaneGeometry(w, 0.1); fg.translate(w / 2, 0, 0);
    this.fill = new THREE.Mesh(fg, this.fillMat); this.fill.position.set(-w / 2, 0, 0.001);
    this.g.add(bg, this.fill);
  }
  set(frac, camera) { this.fill.scale.x = Math.max(0.001, frac); this.g.quaternion.copy(camera.quaternion); }
}

const HEIGHT = { boss: 5.2, brute: 3, imp: 1.3, ogre: 4.8, matriarch: 3.6, spiderling: 1, goblin: 1.5 };

export class EnemyView {
  constructor(a) {
    const [id, type] = a;
    this.id = id; this.type = type; this.def = ENEMIES[type];
    this.rig = buildEnemy(type);
    this.spider = this.rig.kind === 'spider';
    this.root = this.rig.root;
    entityRoot.add(this.root);
    this.pos = new THREE.Vector3(a[2], 0, a[3]);
    this.target = { x: a[2], z: a[3] };
    this.ry = a[4];
    this.root.position.copy(this.pos);
    this.hp = a[5]; this.maxHp = a[6]; this.level = a[7]; this.flags = a[8];
    this.affix = a[9] >= 0 ? AFFIX_KEYS[a[9]] : null;
    this.flash = 0; this.hurt = 0; this.atkT = -1; this.dead = false; this.deathT = 0; this.move = 0;
    this.boss = !!this.def.boss;
    this.radius = this.def.radius * (this.affix ? 1.15 : 1);
    this.height = (HEIGHT[type] || 2.1) * (this.affix ? 1.15 : 1);
    if (this.affix) this.setupElite();
    if (!this.boss) { this.bar = new HpBar(type === 'brute' ? 1.6 : 1.1); this.bar.g.visible = false; entityRoot.add(this.bar.g); if (this.affix) this.bar.fillMat.color.set(AFFIXES[this.affix].color); }
    this.t = Math.random() * 10;
    this.attackDur = Math.max(0.3, this.def.windup / 0.5);
    this.leap = null;
    if (this.boss) G.fx.emit({ pos: this.pos.clone().setY(1), count: 60, speed: 6, color: '#ff4020', color2: '#400000', size: 0.6, life: 1.2, up: 1 });
  }
  setupElite() {
    const col = AFFIXES[this.affix].color;
    this.rig.body.scale.multiplyScalar(1.15);
    this.aura = new THREE.Mesh(new THREE.RingGeometry(this.radius * 1.1, this.radius * 1.6, 32), additive(new THREE.Color(col).multiplyScalar(1.6), 0.8));
    this.aura.rotation.x = -Math.PI / 2;
    entityRoot.add(this.aura);
    this.tag = document.createElement('div'); this.tag.className = 'elitetag'; this.tag.style.color = col;
    this.tag.textContent = `${AFFIXES[this.affix].name} ${this.def.name}`;
    labelsEl.appendChild(this.tag);
    if (this.affix === 'shielded') {
      this.bubble = new THREE.Mesh(new THREE.SphereGeometry(this.height * 0.55, 18, 14), additive('#4a6aff', 0.25));
      entityRoot.add(this.bubble);
    }
    for (const m of this.rig.mats) { m.emissive.lerp(new THREE.Color(col), 0.1); }
    this.rig.baseEmissive = this.rig.mats.map((m) => m.emissive.clone());
  }
  apply(a) {
    if (!this.leap) { this.target.x = a[2]; this.target.z = a[3]; }
    this.ry = a[4]; this.hp = a[5]; this.maxHp = a[6]; this.level = a[7]; this.flags = a[8];
  }
  get stunned() { return !!(this.flags & 8); }
  attack() { this.atkT = 0; if (this.def.ranged) G.audio.bolt(); }
  hit(crit, stun) { this.flash = 1; this.hurt = 1; if (stun) this.stunFx = 1; }
  startLeap(x, z, delay) { this.leap = { from: this.pos.clone(), to: new THREE.Vector3(x, 0, z), t: 0, dur: delay }; }
  die() { if (this.dead) return; this.dead = true; this.deathT = 0; if (this.bar) this.bar.g.visible = false; }
  update(dt, zone, camera) {
    this.t += dt;
    if (!this.dead) {
      if (this.leap) {
        const L = this.leap; L.t += dt;
        const k = Math.min(1, L.t / L.dur);
        this.pos.x = L.from.x + (L.to.x - L.from.x) * k; this.pos.z = L.from.z + (L.to.z - L.from.z) * k;
        this.target.x = this.pos.x; this.target.z = this.pos.z;
        if (k >= 1) { this.leap = null; G.fx.shockwave(this.pos.clone().setY(zone.groundHeight(this.pos.x, this.pos.z)), 4, '#ff6a2a', 0.4); G.shake = Math.max(G.shake, 0.6); G.audio.slam(); }
      } else {
        const px = this.pos.x, pz = this.pos.z;
        this.pos.x = damp(this.pos.x, this.target.x, 10, dt); this.pos.z = damp(this.pos.z, this.target.z, 10, dt);
        const sp = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-4);
        this.move = damp(this.move, Math.min(1.2, sp / (this.def.speed * 0.8)), 10, dt);
      }
      this.root.rotation.y = angleLerp(this.root.rotation.y, this.ry, Math.min(1, dt * 12));
    }
    this.pos.y = zone.groundHeight(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    if (this.leap) this.root.position.y += Math.sin(Math.min(1, this.leap.t / this.leap.dur) * Math.PI) * 5;
    let atk = -1, cast = 0;
    if (this.atkT >= 0) {
      this.atkT += dt / this.attackDur;
      if (this.atkT >= 1) this.atkT = -1;
      else if (this.def.ranged) cast = Math.sin(this.atkT * Math.PI); else atk = this.atkT;
    }
    this.flash = Math.max(0, this.flash - dt * 9);
    this.hurt = Math.max(0, this.hurt - dt * 5);
    const stun = this.stunned && !this.dead;
    const st = { t: this.t, move: this.dead || stun ? 0 : this.move, atk, combo: this.boss || this.type === 'ogre' ? 2 : 0, slam: -1, cast, dead: this.dead ? Math.min(1, this.deathT * 1.4) : 0, hurt: Math.max(this.hurt, stun ? 0.5 + Math.sin(this.t * 14) * 0.3 : 0), float: this.type === 'wraith', air: !!this.leap };
    if (this.spider) animateSpider(this.rig, st); else animateRig(this.rig, st);
    if (this.flags & 32 && !this.dead) { // boss intro roar pose
      if (!this.spider) { this.rig.P.armL.rotation.x = this.rig.P.armR.rotation.x = -2.6; this.rig.P.spine.rotation.x = -0.3; this.rig.P.head.rotation.x = -0.5; }
    }
    flashRig(this.rig, this.flash * 0.5 + (this.flags & 2 ? 0.15 : 0) + (this.flags & 16 ? 0.25 + Math.sin(this.t * 8) * 0.1 : 0));
    if (this.dead) {
      this.deathT += dt;
      if (this.deathT > 1.1) fadeRig(this.rig, Math.max(0, 1 - (this.deathT - 1.1) / 0.6));
      if (this.deathT > 1.75) return false;
    }
    if (this.bar) {
      const show = !this.dead && (this.hp < this.maxHp || this.affix);
      this.bar.g.visible = show;
      if (show) { this.bar.g.position.set(this.pos.x, this.pos.y + this.height + 0.25, this.pos.z); this.bar.set(this.hp / this.maxHp, camera); }
    }
    if (this.aura) {
      this.aura.visible = !this.dead;
      this.aura.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
      this.aura.rotation.z += dt * 1.5; this.aura.scale.setScalar(1 + Math.sin(this.t * 4) * 0.08);
      if (!this.dead && Math.random() < dt * 14) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 0.3), count: 1, speed: 1, color: AFFIXES[this.affix].color, color2: '#000000', size: 0.4, life: 0.9, up: 1.5, radius: this.radius });
      if (this.tag) placeLabel(this.tag, _v.set(this.pos.x, this.pos.y + this.height + 0.75, this.pos.z), camera, this.dead ? 0 : 22);
    }
    if (this.bubble) { this.bubble.visible = !this.dead && !!(this.flags & 4); this.bubble.position.set(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z); this.bubble.material.opacity = 0.2 + Math.sin(this.t * 6) * 0.06; }
    if (stun && Math.random() < dt * 10) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + this.height + 0.2), count: 1, speed: 0.6, color: '#fff7a0', color2: '#ffd34d', size: 0.25, life: 0.6, flat: true });
    if (this.type === 'wraith' && Math.random() < dt * 10) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 0.8), count: 1, speed: 0.5, color: '#b26bff', color2: '#200040', size: 0.35, life: 1, drag: 1, up: 0.5 });
    if (this.boss && Math.random() < dt * (this.flags & 16 ? 50 : 25)) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 1, speed: 1.2, color: this.flags & 16 ? '#ff2a10' : '#ff5a2a', color2: '#300000', size: 0.5, life: 1.2, up: 1.5, radius: 1.5 });
    if (this.type === 'goblin' && Math.random() < dt * 8) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 0.8), count: 1, speed: 1, color: '#ffe066', color2: '#ffaa00', size: 0.2, life: 0.7, gravity: 4, up: 1 });
    if (this.flags & 2 && Math.random() < dt * 8) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), count: 1, speed: 0.5, color: '#bff4ff', color2: '#3ab0ff', size: 0.2, life: 0.8, radius: 0.5 });
    return true;
  }
  dispose() {
    entityRoot.remove(this.root);
    if (this.bar) entityRoot.remove(this.bar.g);
    if (this.aura) { entityRoot.remove(this.aura); this.aura.geometry.dispose(); this.aura.material.dispose(); }
    if (this.bubble) { entityRoot.remove(this.bubble); this.bubble.geometry.dispose(); this.bubble.material.dispose(); }
    this.tag?.remove();
    this.rig.mats.forEach((m) => m.dispose());
  }
}

export const EMOTES = { wave: '👋', cheer: '🙌', dance: '💃', bow: '🙇', laugh: '😂', point: '👉', taunt: '😤', gg: '🏆' };

export class RemoteView {
  constructor(p) {
    this.id = p.id; this.color = p.color; this.cls = p.cls;
    this.rig = buildHero(p.color, p.cls);
    this.root = this.rig.root;
    entityRoot.add(this.root);
    this.pos = new THREE.Vector3(p.x, p.y, p.z);
    this.target = new THREE.Vector3(p.x, p.y, p.z);
    this.ry = p.ry; this.t = 0; this.move = 0; this.lastAnim = 0; this.atkT = -1; this.combo = 0; this.slamT = -1; this.rollT = -1; this.deadT = 0;
    this.emote = null; this.emoteT = 0;
    this.tag = document.createElement('div'); this.tag.className = 'nametag';
    labelsEl.appendChild(this.tag);
    this.bubble = document.createElement('div'); this.bubble.className = 'emotebubble'; labelsEl.appendChild(this.bubble); this.bubble.style.display = 'none';
    this.spirits = [];
    this.apply(p);
    this.pos.copy(this.target);
  }
  apply(p) {
    this.p = p;
    this.target.set(p.x, p.y, p.z); this.ry = p.ry;
    if (p.anim !== this.lastAnim) {
      if (p.anim >= 2 && p.anim <= 4) { this.atkT = 0; this.combo = p.anim - 2; }
      if (p.anim === 5) this.slamT = 0;
      if (p.anim === 6) this.rollT = 0;
      this.lastAnim = p.anim;
    }
    if (p.gear) applyGear(this.rig, p.gear, p.color);
    const want = p.spirit || 0;
    while (this.spirits.length < want) { const m = buildSpiritMesh(); entityRoot.add(m); this.spirits.push(m); }
    while (this.spirits.length > want) entityRoot.remove(this.spirits.pop());
    this.tag.innerHTML = `<span style="color:${p.color}">${escapeHtml(p.name)}</span> <span style="color:#aaa;font-size:11px">Lv${p.level}</span><div class="hpm"><i style="width:${Math.max(0, (p.hp / p.maxHp) * 100)}%"></i></div>`;
  }
  showEmote(kind) { this.emote = kind; this.emoteT = 0; this.bubble.textContent = EMOTES[kind] || '❗'; this.bubble.style.display = ''; }
  update(dt, camera) {
    this.t += dt;
    const prev = this.pos.clone();
    this.pos.lerp(this.target, 1 - Math.exp(-12 * dt));
    const sp = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z) / Math.max(dt, 1e-4);
    this.move = damp(this.move, Math.min(1, sp / 6), 10, dt);
    this.root.position.copy(this.pos);
    const a = this.p.anim;
    this.root.rotation.y = angleLerp(this.root.rotation.y, this.ry, Math.min(1, dt * 15)) + (a === 9 ? (this.t * 22) % (Math.PI * 2) : 0);
    let atk = -1, slam = -1, roll = 0;
    if (this.atkT >= 0) { this.atkT += dt / 0.45; if (this.atkT >= 1) this.atkT = -1; else atk = this.atkT; }
    if (this.slamT >= 0) { this.slamT += dt / 0.7; if (this.slamT >= 1) this.slamT = -1; else slam = this.slamT; }
    if (this.rollT >= 0) { this.rollT += dt / 0.5; if (this.rollT >= 1) this.rollT = -1; else roll = Math.max(0.0001, this.rollT); }
    this.deadT = this.p.dead ? Math.min(1, this.deadT + dt) : 0;
    if (this.emote) { this.emoteT += dt; if (this.emoteT > 3 || this.move > 0.3) { this.emote = null; this.bubble.style.display = 'none'; } }
    animateRig(this.rig, { t: this.t, move: this.move, atk, combo: this.combo, slam, roll, dash: a === 12, air: a === 8, dead: this.deadT, block: a === 11, channel: a === 9, cast: a === 10 ? 0.8 : 0, emote: this.emote, emoteT: this.emoteT });
    if (a === 9 && Math.random() < dt * 30) G.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 0.9), count: 1, speed: 6, color: '#ffd080', color2: '#ff2a00', size: 0.4, life: 0.4, flat: true });
    this.spirits.forEach((m, i) => { const ang = this.t * 1.6 + i * Math.PI; m.position.set(this.pos.x + Math.cos(ang) * 1.4, this.pos.y + 2.3 + Math.sin(this.t * 3) * 0.2, this.pos.z + Math.sin(ang) * 1.4); });
    placeLabel(this.tag, _v.set(this.pos.x, this.pos.y + 2.5, this.pos.z), camera, 50);
    if (this.emote) placeLabel(this.bubble, _v.set(this.pos.x, this.pos.y + 3.3, this.pos.z), camera, 50);
  }
  dispose() { entityRoot.remove(this.root); this.tag.remove(); this.bubble.remove(); for (const m of this.spirits) entityRoot.remove(m); }
}

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
    if (item.slot === 'weapon') { model = buildWeapon(item.type, item.rarity); model.scale.setScalar(item.type === 'staff' ? 0.6 : 0.8); model.rotation.z = 0.6; model.position.y = 0.3; }
    else {
      model = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: RARITY_TINT[item.rarity], metalness: 0.85, roughness: 0.3, emissive: col, emissiveIntensity: RARITY_GLOW[item.rarity] * 0.4 });
      if (item.slot === 'helm') model.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), mat));
      else if (item.slot === 'chest') model.add(new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.6, 0.3, 2, 0.08), mat));
      else for (const s of [-1, 1]) { const b = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.35, 0.3, 2, 0.05), mat); b.position.x = s * 0.13; model.add(b); }
      model.position.y = 0.6;
    }
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.model = model; this.g.add(model);
    const h = 3 + item.rarity * 2.2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + item.rarity * 0.04, 0.3 + item.rarity * 0.06, h, 12, 1, true), beamMat(col));
    beam.position.y = h / 2; this.g.add(beam); this.beam = beam;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32), additive(new THREE.Color(col).multiplyScalar(2), 0.7));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; this.g.add(ring); this.ring = ring;
    entityRoot.add(this.g);
    this.label = document.createElement('div'); this.label.className = 'lootlabel';
    this.label.style.color = col; this.label.textContent = item.name;
    labelsEl.appendChild(this.label);
    this.t = 0; this.pending = false;
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
    if (m.kind === 'bolt' || m.kind === 'venom') {
      const col = m.kind === 'venom' ? '#7dff4a' : '#ff5cf0';
      this.color = col;
      this.mesh = new THREE.Mesh(new THREE.SphereGeometry(m.kind === 'venom' ? 0.3 : 0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.5) }));
      this.h = 1.3;
    } else {
      this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(m.tier >= 3 ? '#9fe0ff' : '#ffe6a0').multiplyScalar(2) }));
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
      if (Math.random() < 0.8) G.fx.emit({ pos: this.pos, count: 1, speed: 0.3, color: this.color, color2: this.kind === 'venom' ? '#0a4000' : '#6a00a0', size: 0.35, life: 0.4 });
    }
    this.mesh.position.copy(this.pos);
  }
  dispose() { entityRoot.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

export class HazardView {
  constructor(h, zone) {
    this.h = h; this.delay = h.delay; this.t = 0;
    const y = zone.groundHeight(h.x, h.z) + 0.07;
    this.g = new THREE.Group(); this.g.position.set(h.x, y, h.z);
    if (h.kind === 'web') {
      const mat = new THREE.LineBasicMaterial({ color: '#e8e4f0', transparent: true, opacity: 0.85 });
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * h.r, 0, Math.sin(a) * h.r)); }
      for (let r = 0.5; r <= h.r; r += 0.55) for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, b = ((i + 1) / 10) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Vector3(Math.cos(b) * r, 0, Math.sin(b) * r)); }
      this.mesh = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
      this.g.add(this.mesh); this.mesh.visible = false;
      G.audio.web();
    } else {
      this.mesh = new THREE.Mesh(new THREE.CircleGeometry(h.r, 32), additive('#ff4a10', 0.55));
      this.mesh.rotation.x = -Math.PI / 2; this.g.add(this.mesh);
      this.mesh.visible = this.delay <= 0;
    }
    if (this.delay > 0) G.fx.telegraph(this.g.position, h.r, this.delay, h.kind === 'web' ? '#d8d0ff' : '#ff3a10');
    entityRoot.add(this.g);
  }
  update(dt) {
    this.t += dt;
    if (this.delay > 0) {
      this.delay -= dt; this.h.delay = this.delay;
      if (this.delay <= 0) {
        this.mesh.visible = true;
        if (this.h.kind === 'geyser') { G.fx.emit({ pos: this.g.position.clone().setY(this.g.position.y + 0.5), count: 80, speed: 9, color: '#ffd080', color2: '#ff1000', size: 0.55, life: 0.9, up: 3, radius: this.h.r * 0.6 }); G.audio.fire(); G.shake = Math.max(G.shake, 0.2); }
      }
      return;
    }
    if (this.h.kind !== 'web') {
      this.mesh.material.opacity = 0.4 + Math.sin(this.t * 9) * 0.12;
      if (Math.random() < dt * 30) G.fx.emit({ pos: this.g.position, count: 1, speed: 1.2, color: '#ffc060', color2: '#ff1a00', size: 0.45, life: 0.7, up: 2, radius: this.h.r });
    }
  }
  dispose() { entityRoot.remove(this.g); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ---------- STRUCTURES ----------
const smat = {};
function sm(key, make) { return smat[key] ||= make(); }
export function buildStructure(kind, ghost = false, tier = 1) {
  const g = new THREE.Group();
  const wood = sm('wood', () => new THREE.MeshStandardMaterial({ color: '#7a5434', roughness: 0.9 }));
  const stone = sm('stone', () => new THREE.MeshStandardMaterial({ color: '#8f877c', roughness: 0.9 }));
  const dark = sm('dstone', () => new THREE.MeshStandardMaterial({ color: '#5e5850', roughness: 0.95 }));
  const iron = sm('iron', () => new THREE.MeshStandardMaterial({ color: '#2b2b30', metalness: 0.8, roughness: 0.4 }));
  const gold = sm('gold', () => new THREE.MeshStandardMaterial({ color: '#d7a443', metalness: 1, roughness: 0.3 }));
  const rune = sm('rune', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ab0ff').multiplyScalar(2.5) }));
  const banner = sm('banner', () => new THREE.MeshStandardMaterial({ color: '#8c1c1c', roughness: 0.9, side: THREE.DoubleSide }));
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  if (kind === 'barricade') {
    const mat = tier >= 3 ? stone : wood;
    for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.18, 0.18, 3, 8), mat, 0, 0.3 + i * 0.38, 0, 0, 0, Math.PI / 2);
    for (let i = -1; i <= 1; i++) add(new THREE.ConeGeometry(0.12, 1.2, 6), tier >= 2 ? iron : wood, i * 1.1, 0.8, 0.45, 1.0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2, 1.4, 1.0), mat, s * 1.3, 0.6, 0, 0.3);
    if (tier >= 2) for (const x of [-0.8, 0.8]) add(new THREE.BoxGeometry(0.1, 1.3, 0.42), iron, x, 0.65, 0);
    if (tier >= 3) add(new THREE.BoxGeometry(3.1, 0.3, 0.5), dark, 0, 1.45, 0);
  } else if (kind === 'wall') {
    const mat = tier >= 2 ? stone : wood;
    add(tier >= 2 ? new THREE.BoxGeometry(0.9, 2.2, 0.9) : new THREE.CylinderGeometry(0.35, 0.4, 2.2, 8), mat, 0, 1.1, 0);
    add(new THREE.BoxGeometry(1.0, 0.25, 1.0), tier >= 2 ? dark : iron, 0, 2.3, 0);
    if (tier >= 3) { add(new THREE.ConeGeometry(0.2, 0.5, 4), gold, 0, 2.7, 0); add(new THREE.BoxGeometry(0.95, 0.08, 0.95), rune, 0, 1.6, 0); }
    g.userData.linkMat = mat;
  } else if (kind === 'tower') {
    const h = 2.4 + (tier - 1) * 0.8;
    add(new THREE.CylinderGeometry(1.0, 1.3, h, 10), stone, 0, h / 2, 0);
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) add(new THREE.BoxGeometry(0.14, 1.8, 0.14), wood, x, h + 0.8, z);
    add(new THREE.BoxGeometry(1.9, 0.2, 1.9), tier >= 2 ? dark : wood, 0, h + 0.1, 0);
    add(new THREE.ConeGeometry(1.5, 1.2, 4), sm('roof', () => new THREE.MeshStandardMaterial({ color: '#8b3a2a', roughness: 0.8, flatShading: true })), 0, h + 2.2, 0, 0, Math.PI / 4);
    const xb = new THREE.Group(); xb.position.y = h + 0.6; g.add(xb);
    xb.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.1 + tier * 0.2), wood));
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.0 + tier * 0.3, 0.08, 0.08), tier >= 3 ? gold : iron); bow.position.z = 0.4; xb.add(bow);
    g.userData.turret = xb; g.userData.top = h + 3;
    if (tier >= 2) { const b = add(new THREE.PlaneGeometry(0.6, 1.4), banner, 0, h - 0.5, 1.02); b.castShadow = false; }
    if (tier >= 3) { const r = add(new THREE.TorusGeometry(1.15, 0.06, 6, 24), rune, 0, h * 0.5, 0, Math.PI / 2); r.castShadow = false; }
  } else if (kind === 'brazier') {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; add(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), iron, Math.cos(a) * 0.35, 0.6, Math.sin(a) * 0.35, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
    add(new THREE.CylinderGeometry(0.7 + (tier - 1) * 0.15, 0.35, 0.5, 12), tier >= 3 ? gold : iron, 0, 1.3, 0);
    add(new THREE.CylinderGeometry(0.6 + (tier - 1) * 0.15, 0.6, 0.1, 12), sm('coal', () => new THREE.MeshStandardMaterial({ color: '#ff5a1a', emissive: '#ff3a00', emissiveIntensity: 2.5 })), 0, 1.5, 0);
    if (tier >= 2) add(new THREE.CylinderGeometry(0.9, 1.0, 0.25, 12), dark, 0, 0.12, 0);
  } else if (kind === 'frost') {
    add(new THREE.CylinderGeometry(0.4, 0.55, 2.0 + (tier - 1) * 0.5, 6), stone, 0, 1.0, 0);
    const c = add(new THREE.OctahedronGeometry(0.45 + (tier - 1) * 0.1, 0), sm('ice', () => new THREE.MeshStandardMaterial({ color: '#bff4ff', emissive: '#3ab0ff', emissiveIntensity: 2.2, roughness: 0.1, flatShading: true })), 0, 2.8 + (tier - 1) * 0.5, 0);
    c.scale.y = 1.6; g.userData.crystal = c; g.userData.cy = 2.8 + (tier - 1) * 0.5;
    if (tier >= 3) for (let i = 0; i < 3; i++) { const s = add(new THREE.OctahedronGeometry(0.18, 0), c.material, 0, 0, 0); g.userData['s' + i] = s; }
  }
  if (ghost) g.traverse((o) => { if (o.isMesh) { o.material = sm('ghost', () => new THREE.MeshBasicMaterial({ color: '#5eea8a', transparent: true, opacity: 0.4, depthWrite: false })); o.castShadow = false; } });
  return g;
}

export class StructView {
  constructor(s, zone) {
    this.s = s; this.kind = s.kind; this.zone = zone; this.tier = s.tier || 1;
    this.build();
    this.bar = new HpBar(1.4); this.bar.g.visible = false; this.bar.fillMat.color.set('#5ab0ff');
    entityRoot.add(this.bar.g);
    this.t = Math.random() * 5; this.pop = 0;
  }
  build() {
    if (this.g) entityRoot.remove(this.g);
    const s = this.s;
    this.g = buildStructure(s.kind, false, this.tier);
    this.g.position.set(s.x, this.zone.groundHeight(s.x, s.z), s.z);
    if (s.kind !== 'wall') this.g.rotation.y = Math.atan2(-s.x, -s.z);
    entityRoot.add(this.g);
    this.links = null;
  }
  setData(s) {
    const up = (s.tier || 1) !== this.tier;
    this.s = s;
    if (up) { this.tier = s.tier; this.build(); this.pop = 0; G.fx.emit({ pos: this.g.position.clone().setY(this.g.position.y + 1.5), count: 60, speed: 4, color: '#bfe0ff', color2: '#5ab0ff', size: 0.35, life: 1, up: 1 }); G.audio.levelUp(); }
  }
  // stone walls draw connecting segments to neighbours (computed when the wall set changes)
  relink(all) {
    if (this.kind !== 'wall') return;
    if (this.links) { this.g.remove(this.links); this.links.traverse((o) => o.geometry?.dispose()); }
    this.links = new THREE.Group();
    for (const o of all) {
      if (o === this || o.kind !== 'wall') continue;
      const dx = o.s.x - this.s.x, dz = o.s.z - this.s.z, d = Math.hypot(dx, dz);
      if (d > 2.9 || d < 0.5 || o.s.id < this.s.id) continue;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.55, this.tier >= 2 ? 1.8 : 1.4, d), this.g.userData.linkMat);
      seg.position.set(dx / 2, this.tier >= 2 ? 0.9 : 0.8, dz / 2); seg.rotation.y = Math.atan2(dx, dz);
      seg.castShadow = seg.receiveShadow = true;
      this.links.add(seg);
    }
    this.g.add(this.links);
  }
  update(dt, camera) {
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt * 4);
    const k = this.pop < 1 ? 1 + Math.sin(this.pop * Math.PI) * 0.25 : 1;
    this.g.scale.set(k, this.pop < 1 ? this.pop * k : 1, k);
    const p = this.g.position;
    if (this.kind === 'brazier' && Math.random() < dt * (20 + this.tier * 10)) G.fx.emit({ pos: new THREE.Vector3(p.x, p.y + 1.6, p.z), count: 1, speed: 1.2, color: this.tier >= 3 ? '#fff0a0' : '#ffc060', color2: '#ff1a00', size: 0.45 + this.tier * 0.08, life: 0.8, up: 2, radius: 0.4 });
    if (this.kind === 'brazier' && G.defense.phase === 'wave' && Math.random() < dt * 6) G.fx.emit({ pos: new THREE.Vector3(p.x, p.y + 0.2, p.z), count: 1, speed: 0.2, color: '#ff6a2a', color2: '#400', size: 0.25, life: 1, radius: STRUCTURES.brazier.radius + (this.tier - 1) * 0.6 });
    if (this.kind === 'frost') {
      const c = this.g.userData.crystal; c.rotation.y = this.t; c.position.y = this.g.userData.cy + Math.sin(this.t * 2) * 0.15;
      for (let i = 0; i < 3; i++) { const s = this.g.userData['s' + i]; if (s) { const a = this.t * 2 + i * 2.1; s.position.set(Math.cos(a) * 0.8, c.position.y, Math.sin(a) * 0.8); } }
      if (Math.random() < dt * 8) G.fx.emit({ pos: new THREE.Vector3(p.x, p.y + 0.3, p.z), count: 1, speed: 0.3, color: '#dffaff', color2: '#3ab0ff', size: 0.2, life: 1.5, radius: STRUCTURES.frost.radius + this.tier - 1, up: 0.5 });
    }
    if (this.kind === 'tower') {
      let best = null, bd = STRUCTURES.tower.range + (this.tier - 1) * 2;
      for (const e of G.enemies.values()) { if (e.dead) continue; const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z); if (d < bd) { bd = d; best = e; } }
      if (best) this.g.userData.turret.rotation.y = angleLerp(this.g.userData.turret.rotation.y, Math.atan2(best.pos.x - p.x, best.pos.z - p.z) - this.g.rotation.y, dt * 8);
    }
    const show = this.s.hp < this.s.maxHp || this.highlight;
    this.bar.g.visible = show;
    if (show) { this.bar.g.position.set(p.x, p.y + (this.g.userData.top || 3), p.z); this.bar.set(this.s.hp / this.s.maxHp, camera); }
  }
  dispose() { entityRoot.remove(this.g); entityRoot.remove(this.bar.g); }
}
