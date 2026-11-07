// The camp: a small walkable hub shown before and between runs. Walk the hero
// to a building and press E (or click the prompt) to use it:
//   Hall of Heroes → choose a character   Tailor's Tent → choose an outfit
//   Rune Shrine    → save point / records  Ruin Gate     → start a run

import * as THREE from 'three';
import { spawnProp, models, modelStatus } from './models.js';
import { Particles } from './fx.js';
import { ArrowSystem } from './arrows.js';
import { CHARACTERS, OUTFITS, profile, saveProfile, purchase, requirementMet, outfitKey } from './profile.js';

const rand = (a, b) => a + Math.random() * (b - a);
const RADIUS = 15;

export class Camp {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1218);
    this.scene.fog = new THREE.Fog(0x0e1218, 24, 48);
    this.colliders = [];
    this.spots = [];
    this.built = false;
    this.time = 0;
    this.panel = document.getElementById('camp-panel');
    this.prompt = document.getElementById('camp-prompt');
    this.prompt.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.near) this.open(this.near);
    });
    this.panel.addEventListener('pointerdown', (e) => this.onPanelClick(e));
  }

  build() {
    if (this.built) return;
    this.built = true;
    const S = this.scene;
    S.add(new THREE.HemisphereLight(0x9fb4ff, 0x3a2c20, 1.25));
    const moon = new THREE.DirectionalLight(0xbcd0ff, 1.8);
    moon.position.set(-8, 18, -6);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.03;
    S.add(moon);
    this.fireLight = new THREE.PointLight(0xff8a3c, 40, 18, 1.5);
    this.fireLight.position.set(0, 1.6, 0);
    S.add(this.fireLight);
    this.particles = new Particles(S, 300);

    // Ground: grass with a worn dirt clearing around the fire.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
    ground.receiveShadow = true;
    S.add(ground);

    // Buildings, each with an interaction spot in front of it (facing the fire).
    // The camera looks from +x,+z, so buildings sit on the far half of the camp.
    this.building('heroHall', 6.5, -10, 2.5, 'hall', 'Hall of Heroes', 3.4);
    this.building('tailorTent', 5, 9, -6, 'wardrobe', "Tailor's Tent", 3.0);
    this.building('shrine', 3.6, 1.5, -10.5, 'shrine', 'Rune Shrine', 1.4);
    this.building('archway', 5.5, -8.5, -8.5, 'gate', 'Ruin Gate', 2.3);
    // A swirling portal inside the gate.
    this.portalMat = new THREE.MeshBasicMaterial({ map: portalTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.6, 0.9, 3) });
    this.portal = new THREE.Mesh(new THREE.CircleGeometry(1.35, 48), this.portalMat);
    this.portal.position.set(-8.5, 1.7, -8.5);
    this.portal.lookAt(0, 1.7, 0);
    this.portal.translateZ(0.3);
    S.add(this.portal);

    this.prop('campfire', 1.0, 0, 0, 0, 1.0);
    this.addDummy(5, 1.5);
    this.prop('weaponRack', 1.7, -5, 9.5, 0.6, 0.8);
    this.prop('signpost', 2.2, -5, -5, 0.8, 0.4);
    this.prop('tent', 2.4, -11, -5, 1.0, 1.8);
    this.prop('tent', 2.4, 6.5, -12, -0.4, 1.8);
    this.prop('tent', 2.2, 12.5, 1, -1.6, 1.6);
    for (const [x, z] of [
      [-3, -3],
      [3, 3],
      [-6, -2],
      [5, -4],
      [-3, -9],
    ]) {
      this.prop('lantern', 2.0, x, z, Math.random() * 6, 0.25);
      // A soft glow sprite instead of a real light: point lights cost on every pixel.
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb066, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(x, 1.85, z);
      glow.scale.setScalar(1.6);
      S.add(glow);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x6a4020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pool.position.set(x, 0.03, z);
      S.add(pool);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      if (Math.abs(a - Math.PI * 1.25) < 0.45) continue; // gap toward the gate
      this.prop('fence', 1.0, Math.cos(a) * (RADIUS + 0.6), Math.sin(a) * (RADIUS + 0.6), -a, 0, { axis: 'x', size: 2.6 });
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(RADIUS + 3, RADIUS + 14);
      this.prop(Math.random() < 0.5 ? 'deadTree' : 'rocks', Math.random() < 0.5 ? rand(4, 7) : rand(1, 2.5), Math.cos(a) * d, Math.sin(a) * d, Math.random() * 6, 0);
    }
  }

  /** Training dummy: arrows hit it like an enemy; it wobbles and reports damage. */
  addDummy(x, z) {
    const p = this.prop('dummy', 2.0, x, z, -2.2, 0.5);
    this.arrows = new ArrowSystem(this.scene, (pos) => {
      if (Math.hypot(pos.x, pos.z) > RADIUS + 1) return true;
      return this.colliders.some((c) => c !== dummyCollider && Math.hypot(pos.x - c.x, pos.z - c.z) < c.r);
    });
    const dummyCollider = this.colliders[this.colliders.length - 1];
    const G = this.game;
    const d = {
      pos: new THREE.Vector3(x, 0, z),
      radius: 0.5,
      rig: p || new THREE.Group(),
      removed: false,
      wobble: 0,
      isHittable: () => true,
      hit: (damage, dir, charge, perfect) => {
        d.wobble = Math.min(1.4, d.wobble + 0.5 + charge * 0.6 + (perfect ? 0.5 : 0));
        d.dir = dir.clone();
        G.numbers.spawn(d.pos.clone().setY(2.2), Math.round(damage), perfect ? 'perfect' : charge >= 0.999 ? 'crit' : 'normal');
        if (perfect) G.numbers.spawn(d.pos.clone().setY(3), 'PERFECT!', 'callout gold');
        G.sfx.hit(perfect, G.panAt(d.pos));
        this.particles.spawn(d.pos.clone().setY(1.3), { count: perfect ? 20 : 8, color: perfect ? [3, 2.1, 0.5] : 0xd8c48a, speed: 3, up: 2, life: 0.5, size: 0.08, dir, spread: 1 });
        G.tips?.done('camp');
        return null;
      },
    };
    this.dummy = d;
  }

  prop(id, size, x, z, rotY, collideR, opts = {}) {
    const p = spawnProp(id, opts.size || size, opts);
    if (!p) return null;
    p.position.set(x, 0, z);
    p.rotation.y = rotY;
    this.scene.add(p);
    if (collideR > 0) this.colliders.push({ x, z, r: collideR });
    return p;
  }

  building(id, size, x, z, kind, label, collideR) {
    const rot = Math.atan2(-x, -z); // face the campfire
    const p = this.prop(id, size, x, z, rot, collideR);
    const toCenter = new THREE.Vector2(-x, -z).normalize();
    this.spots.push({ kind, label, x: x + toCenter.x * (collideR + 1.6), z: z + toCenter.y * (collideR + 1.6), obj: p });
  }

  /** Keep the hero inside the camp and out of buildings. */
  collide = (pos, r) => {
    const d = Math.hypot(pos.x, pos.z);
    if (d > RADIUS - r) pos.multiplyScalar((RADIUS - r) / d);
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const dd = Math.hypot(dx, dz);
      if (dd < c.r + r && dd > 1e-4) {
        pos.x = c.x + (dx / dd) * (c.r + r);
        pos.z = c.z + (dz / dd) * (c.r + r);
      }
    }
  };

  enter() {
    if (modelStatus.state !== 'loading') this.build();
    const G = this.game;
    const P = G.player;
    this.active = true;
    this.scene.add(P.group);
    P.collide = this.collide;
    P.pos.set(2, 0, 4);
    P.vel.set(0, 0, 0);
    P.hideIndicators();
    P.hp = G.maxHp();
    P.dead = false;
    P.drawing = false;
    P.attachModel();
    G.camTarget.copy(P.pos);
    this.close();
    this.refreshHud();
  }

  leave() {
    const G = this.game;
    this.active = false;
    G.scene.add(G.player.group);
    G.player.collide = null;
    this.close();
    this.prompt.classList.remove('show');
  }

  update(dt, time) {
    if (!this.active) return;
    if (!this.built && modelStatus.state !== 'loading') this.build();
    if (!this.built) return;
    this.time += dt;
    const P = this.game.player;
    this.fireLight.intensity = 40 * (0.85 + 0.1 * Math.sin(time * 11) + 0.05 * Math.sin(time * 27));
    if (Math.random() < dt * 25) {
      this.particles.spawn(new THREE.Vector3(rand(-0.3, 0.3), 0.5, rand(-0.3, 0.3)), { count: 1, color: [3, 1.2, 0.25], speed: 0.4, up: 3, life: 1, size: 0.07, gravity: -1.5, drag: 0.5 });
    }
    if (Math.random() < dt * 5) {
      this.particles.spawn(new THREE.Vector3(0, 1.2, 0), { count: 1, color: 0x2b2a2a, speed: 0.2, up: 1.2, life: 2, size: 0.3, gravity: -0.5, drag: 0.3 });
    }
    this.particles.update(dt);
    if (this.arrows) this.arrows.update(dt, [this.dummy], { onArrowHit: (a, e, point) => e.hit(a.damage, a.dir, a.charge, a.perfect), onArrowStopped: () => {}, onRicochet: () => {}, particles: this.particles });
    if (this.dummy?.rig) {
      // Springy wobble away from the hit.
      const D = this.dummy;
      D.wobble *= Math.exp(-3 * dt);
      const sway = Math.sin(this.time * 14) * D.wobble * 0.25;
      D.rig.rotation.x = D.dir ? sway * D.dir.z : 0;
      D.rig.rotation.z = D.dir ? -sway * D.dir.x : 0;
    }
    this.portal.rotateZ(dt * 1.5);
    this.portalMat.opacity = 0.75 + 0.2 * Math.sin(time * 3);
    // Nearest building in reach.
    let near = null;
    let best = 2.6;
    for (const s of this.spots) {
      const d = Math.hypot(P.pos.x - s.x, P.pos.z - s.z);
      if (d < best) {
        best = d;
        near = s;
      }
    }
    if (near !== this.near) {
      this.near = near;
      this.prompt.classList.toggle('show', !!near && !this.openKind);
      if (near) this.prompt.innerHTML = `<kbd>E</kbd> ${near.kind === 'gate' ? 'Enter' : 'Visit'} <b></b>`;
      if (near) this.prompt.querySelector('b').textContent = near.label;
    }
    if (this.game.input.wasPressed('KeyE') && near && !this.openKind) this.open(near);
    if (this.game.input.wasPressed('Escape') && this.openKind) this.close();
  }

  refreshHud() {
    document.getElementById('camp-gems').textContent = `◆ ${profile.gems}`;
  }

  // ------------------------------------------------------------ panels

  open(spot) {
    this.openKind = spot.kind;
    this.prompt.classList.remove('show');
    this.game.sfx.sample('uiConfirm', { vol: 0.4, jitter: 0 });
    this.render();
    this.panel.classList.add('show');
  }

  close() {
    this.openKind = null;
    this.panel.classList.remove('show');
    if (this.near) this.prompt.classList.add('show');
  }

  render() {
    const k = this.openKind;
    let html = '';
    if (k === 'hall') {
      html = `<h2>Hall of Heroes</h2><p class="lead">Choose who walks into the ruins.</p><div class="choices">${CHARACTERS.map((c) => this.card(c.id, c.name, c.perk, c.blurb, c.cost, c.requires, c.id, profile.character === c.id, !!models[c.id])).join('')}</div>`;
    } else if (k === 'wardrobe') {
      const list = OUTFITS.filter((o) => o.base === profile.character);
      const cur = profile.outfit[profile.character] || 'default';
      html = `<h2>Tailor's Tent</h2><p class="lead">New looks for ${CHARACTERS.find((c) => c.id === profile.character).name.split(' ')[0]}.</p>`;
      html += list.length
        ? `<div class="choices">${list.map((o) => this.card(outfitKey(o), o.name, '', '', o.cost, o.requires, `${o.base}:${o.id}`, cur === o.id, true)).join('')}</div>`
        : `<p class="empty">The tailor is still working on outfits for this hero. Come back soon.</p>`;
    } else if (k === 'shrine') {
      const cp = profile.checkpoint;
      html = `<h2>Rune Shrine</h2><p class="lead">The shrine remembers your victories. Beat a boss to save your progress here.</p>
        <div class="records">
          <div><b>${profile.best.wave}</b><span>Best wave</span></div>
          <div><b>${profile.bosses}</b><span>Bosses slain</span></div>
          <div><b>${profile.runs}</b><span>Runs</span></div>
          <div><b>◆ ${profile.totalGems}</b><span>Gems found</span></div>
        </div>
        ${cp ? `<p class="save">Saved: after wave ${cp.wave} with ${Object.keys(cp.build).length} skills. Enter the gate to continue from wave ${cp.wave + 1}.</p>` : '<p class="save none">No save yet.</p>'}`;
    } else if (k === 'gate') {
      const cp = profile.checkpoint;
      html = `<h2>Ruin Gate</h2><p class="lead">The portal hums. The ruins are waiting.</p><div class="actions">
        <button data-act="new">New run · Wave 1</button>
        ${cp ? `<button data-act="continue" class="gold">Continue · Wave ${cp.wave + 1}</button>` : ''}
      </div>`;
    }
    this.panel.innerHTML = `${html}<button class="close" data-act="close" aria-label="Close">✕</button><p class="foot">◆ ${profile.gems} soul gems · Esc to close</p>`;
  }

  card(key, name, perk, blurb, cost, req, value, selected, available) {
    const owned = !!profile.owned[key];
    const met = requirementMet(req);
    let action;
    if (!available) action = '<span class="tag">Coming soon</span>';
    else if (selected) action = '<span class="tag on">Equipped</span>';
    else if (owned) action = `<button data-act="equip" data-v="${value}">Equip</button>`;
    else if (!met) action = `<span class="tag lock">🔒 ${req.label}</span>`;
    else action = `<button data-act="buy" data-v="${value}" data-cost="${cost}" ${profile.gems < cost ? 'disabled' : ''}>Unlock ◆ ${cost}</button>`;
    return `<div class="choice ${selected ? 'sel' : ''} ${!owned && !met ? 'locked' : ''}"><div class="nm">${name}</div>${perk ? `<div class="pk">${perk}</div>` : ''}${blurb ? `<div class="bl">${blurb}</div>` : ''}<div class="ac">${action}</div></div>`;
  }

  onPanelClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    const v = b.dataset.v;
    const G = this.game;
    if (act === 'close') return this.close();
    if (act === 'new' || act === 'continue') {
      this.close();
      G.startFromCamp(act === 'continue');
      return;
    }
    const isOutfit = this.openKind === 'wardrobe';
    if (act === 'buy') {
      const item = isOutfit ? OUTFITS.find((o) => outfitKey(o) === v) : CHARACTERS.find((c) => c.id === v);
      const err = purchase(isOutfit ? v : v, Number(b.dataset.cost), item.requires);
      if (err) {
        G.sfx.sample('uiSwitch', { vol: 0.4 });
        return;
      }
      G.sfx.sample('jingleClear', { vol: 0.5, jitter: 0 });
    }
    // Equip (also right after buying).
    if (isOutfit) {
      const [base, id] = v.split(':');
      profile.outfit[base] = id;
    } else {
      profile.character = v;
    }
    saveProfile();
    G.player.attachModel();
    G.sfx.pick();
    this.particles.spawn(G.player.pos.clone().setY(1), { count: 30, color: [3, 2.2, 0.6], speed: 4, up: 3, life: 0.8, size: 0.08, gravity: 2 });
    this.refreshHud();
    this.render();
  }
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#1e2716';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = `hsla(${rand(70, 110)}, ${rand(20, 45)}%, ${rand(9, 22)}%, 0.6)`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, rand(1, 2), rand(2, 6));
  }
  // Worn dirt clearing in the middle (the texture maps to a 120m disc: center ≈ 512).
  const grad = g.createRadialGradient(512, 512, 0, 512, 512, 140);
  grad.addColorStop(0, 'rgba(70,52,36,0.95)');
  grad.addColorStop(0.7, 'rgba(70,52,36,0.6)');
  grad.addColorStop(1, 'rgba(70,52,36,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function portalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  for (let r = 120; r > 4; r -= 3) {
    g.strokeStyle = `rgba(${150 + r},${80 + r / 2},255,${0.1 + (120 - r) / 180})`;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, r, r * 0.07, r * 0.07 + Math.PI * 1.3);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
