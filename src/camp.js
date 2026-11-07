// The camp: a small walkable hub shown before and between runs. Walk the hero
// to a building and press E (or click the prompt) to use it:
//   Hall of Heroes → choose a character   Tailor's Tent → choose an outfit
//   Trophy Board   → save point / records  Camp Gate     → start a run

import * as THREE from 'three';
import { doorwayTexture } from './juice.js';
import { spawnProp, models, modelStatus } from './models.js';
import { Particles } from './fx.js';
import { ArrowSystem } from './arrows.js';
import { CHARACTERS, OUTFITS, profile, saveProfile, purchase, requirementMet, outfitKey, saveStatus, currentCharacter } from './profile.js';
import { Preview } from './preview.js';
import { interiorHtml } from './interiors.js';
import { mapArt } from './worldmap-art.js';
import { Room, ROOM_KINDS } from './rooms.js';
import { dailyMission, dailyRecord, MODIFIERS, leaderboard } from './daily.js';
import { MISSIONS, ENDLESS, missionStars, missionUnlocked, totalStars, selectedMission, selectMission } from './missions.js';
import { merchantStock, price, buy, buyMystery, payRestock, RESTOCK_COST, MYSTERY_COST, temper, temperCost, hone, honeCost, honeTarget, MAX_POWER } from './shops.js';
import { DIFFICULTIES, isUnlocked, selectedDifficulty, selectDifficulty, underPowered } from './difficulty.js';
import { stash, findItem, equipped, equippedGadget, equipKey, isEquipped, equip, salvage, salvageValue, score, heroPower, statLines, perkLines, baseOf, RARITIES, slotLabel, gearIcon, PERKS, ROMAN_TIER } from './gear.js';

const rand = (a, b) => a + Math.random() * (b - a);
const RADIUS = 15;

const MAP_ICONS = {
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11 V 8 a 4 4 0 0 1 8 0 V 11" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  hero: '<svg viewBox="0 0 24 24"><path d="M8 4 Q 18 12 8 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8 4 L 8 20 M 5 12 L 19 12 M 16 9.5 L 19 12 L 16 14.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ruins: '<svg viewBox="0 0 24 24"><path d="M4 20 L 4 9 L 7 9 L 7 20 M 10 20 L 10 6 L 14 6 L 14 20 M 17 20 L 17 11 L 20 11 L 20 20 M 2 20 L 22 20" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  keep: '<svg viewBox="0 0 24 24"><path d="M4 20 L 4 8 L 6 8 L 6 6 L 8 6 L 8 8 L 10 8 L 10 6 L 14 6 L 14 8 L 16 8 L 16 6 L 18 6 L 18 8 L 20 8 L 20 20 Z M 10 20 L 10 15 C 10 13, 14 13, 14 15 L 14 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  forge: '<svg viewBox="0 0 24 24"><path d="M3 14 L 15 14 C 15 11, 18 10, 21 10 L 21 12 C 19 12, 18 13, 18 14 L 18 16 L 15 16 L 13 20 L 7 20 L 5 16 L 3 16 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 4 C 11 6, 8 7, 10 10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  daily: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2 L 12 5 M 12 19 L 12 22 M 2 12 L 5 12 M 19 12 L 22 12 M 5 5 L 7 7 M 17 17 L 19 19 M 5 19 L 7 17 M 17 7 L 19 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  endless: '<svg viewBox="0 0 24 24"><path d="M12 3 L 20 7 L 20 13 C 20 17, 16 20, 12 21 C 8 20, 4 17, 4 13 L 4 7 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 12 L 16 12 M 12 8 L 12 16" stroke="currentColor" stroke-width="1.8"/></svg>',
};

/** A colour per outfit for its swatch and the pedestal glow. */
const OUTFIT_COLORS = { default: '#5f8f4a', heroCrimson: '#c8443a', heroFrost: '#7fc4ff', heroShadow: '#6a5a8a', heroGold: '#ffc04d' };

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** One line on where progress is kept, shown at the trophy board. */
function saveWhere() {
  if (saveStatus.cloud === 'on') return '✓ Progress is saved to your account';
  if (saveStatus.cloud === 'connecting') return 'Connecting to your account save…';
  if (saveStatus.local) return '✓ Progress is saved in this browser';
  return 'This browser is blocking saves: progress lasts until you close the page';
}

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
    this.interior = document.getElementById('camp-interior');
    this.fly = 0; // 0 = out in the camp, 1 = camera pushed up to a building's door
    this.rooms = {}; // walkable interiors, built on first visit
    this.room = null;
    this.prompt = document.getElementById('camp-prompt');
    // The prompt is a real button: click or tap it to go inside.
    const enter = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.near && !this.openKind) this.room ? this.useStation(this.near) : this.open(this.near);
    };
    this.prompt.addEventListener('pointerdown', enter);
    this.prompt.addEventListener('click', (e) => e.stopPropagation());
    this.panel.addEventListener('pointerdown', (e) => this.onPanelClick(e));
    this.panel.addEventListener('pointerover', (e) => this.onPanelHover(e));
    this.panel.addEventListener('pointerleave', () => this.syncPreview());
  }

  build() {
    if (this.built) return;
    this.built = true;
    const S = this.scene;
    S.add(new THREE.HemisphereLight(0x9fb4ff, 0x3a2c20, 1.25));
    const moon = (this.moon = new THREE.DirectionalLight(0xbcd0ff, 1.8));
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
    this.building('trophyBoard', 3.6, 1.5, -10.5, 'shrine', 'Trophy Board', 1.4);
    this.building('archway', 5.5, -8.5, -8.5, 'gate', 'Camp Gate', 2.3);
    // The road beyond the gate: warm light through the opening.
    this.portal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), new THREE.MeshBasicMaterial({ map: doorwayTexture(), transparent: true, depthWrite: false, color: new THREE.Color(1.3, 1.15, 0.9) }));
    this.portal.position.set(-8.5, 1.6, -8.5);
    this.portal.lookAt(0, 1.6, 0);
    this.portal.translateZ(-0.2);
    S.add(this.portal);

    this.prop('campfire', 1.0, 0, 0, 0, 1.0);
    this.addDummy(5, 1.5);
    this.building('weaponRack', 1.9, -6, 8.5, 'armory', 'Armory', 0.9);
    this.prop('signpost', 2.2, -5, -5, 0.8, 0.4);
    this.prop('tent', 2.4, -11, -5, 1.0, 1.8);
    this.building('blacksmithForge', 4.2, 6, -12, 'blacksmith', 'Blacksmith', 2.0);
    this.building('merchantStall', 3.6, 12, 2, 'merchant', 'Merchant', 1.7);
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
    this.spots.push({ kind, label, x: x + toCenter.x * (collideR + 1.6), z: z + toCenter.y * (collideR + 1.6), bx: x, bz: z, obj: p });
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
    this.room = null;
    document.body.classList.remove('in-room');
    this.flyHold = false;
    this.leaving = this.entering = false;
    // The hero and their draw indicators (charge ring, aim line) come along to camp.
    this.scene.add(P.group, ...P.indicators);
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
    this.room = null;
    document.body.classList.remove('in-room');
    G.scene.add(G.player.group, ...G.player.indicators);
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
    if (this.room) return this.updateRoom(dt);
    this.fireLight.intensity = 40 * (0.85 + 0.1 * Math.sin(time * 11) + 0.05 * Math.sin(time * 27));
    if (Math.random() < dt * 25) {
      this.particles.spawn(new THREE.Vector3(rand(-0.3, 0.3), 0.5, rand(-0.3, 0.3)), { count: 1, color: [3, 1.2, 0.25], speed: 0.4, up: 3, life: 1, size: 0.07, gravity: -1.5, drag: 0.5 });
    }
    if (Math.random() < dt * 5) {
      this.particles.spawn(new THREE.Vector3(0, 1.2, 0), { count: 1, color: 0x2b2a2a, speed: 0.2, up: 1.2, life: 2, size: 0.3, gravity: -0.5, drag: 0.3 });
    }
    // Fireflies drifting over the grass around the camp.
    if (Math.random() < dt * 7) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(4, 15);
      this.particles.spawn(new THREE.Vector3(Math.cos(a) * r, rand(0.4, 2.2), Math.sin(a) * r), { count: 1, color: [2.2, 2.8, 0.7], speed: 0.25, up: 0.15, life: rand(2.5, 4), size: 0.06, gravity: -0.05, drag: 0.4 });
    }
    this.particles.update(dt);
    // Camera push toward the door while a building is open (eased in game.updateCamera).
    const flyTo = this.flyHold || (this.openKind && !this.room) ? 1 : 0;
    this.fly += (flyTo - this.fly) * (1 - Math.exp(-(flyTo ? 5 : 7) * dt));
    if (this.openKind) this.preview?.update(dt);
    if (this.arrows) this.arrows.update(dt, [this.dummy], { onArrowHit: (a, e, point) => e.hit(a.damage, a.dir, a.charge, a.perfect), onArrowStopped: () => {}, onRicochet: () => {}, particles: this.particles });
    if (this.dummy?.rig) {
      // Springy wobble away from the hit.
      const D = this.dummy;
      D.wobble *= Math.exp(-3 * dt);
      const sway = Math.sin(this.time * 14) * D.wobble * 0.25;
      D.rig.rotation.x = D.dir ? sway * D.dir.z : 0;
      D.rig.rotation.z = D.dir ? -sway * D.dir.x : 0;
    }
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
      if (near) this.prompt.innerHTML = `<span class="cp-btn">${near.kind === 'gate' ? 'Enter' : 'Go inside'}</span> <b></b> <span class="cp-keys">click, or press <kbd>E</kbd> / <kbd>Enter</kbd></span>`;
      if (near) this.prompt.querySelector('b').textContent = near.label;
    }
    const I = this.game.input;
    const use = I.wasPressed('KeyE') || I.wasPressed('Enter') || I.wasPressed('NumpadEnter') || I.wasPressed('KeyF');
    if (use && near && !this.openKind && !this.entering) this.open(near);
    if (this.game.input.wasPressed('Escape') && this.openKind) this.close();
  }

  // ------------------------------------------------------------ walkable interiors

  /** Walk in: the camera pushes to the door, a quick fade, and you're inside. */
  enterRoom(spot) {
    const G = this.game;
    this.entering = true;
    this.flySpot = spot;
    this.flyHold = true;
    this.prompt.classList.remove('show');
    G.sfx.sample('whoosh', { vol: 0.3, rate: 0.7, jitter: 0 });
    setTimeout(() => {
      if (!this.active || !this.entering) return;
      G.fade();
      setTimeout(() => this.switchToRoom(spot), 240);
    }, 330);
  }

  switchToRoom(spot) {
    const G = this.game;
    const P = G.player;
    if (!this.active || !this.entering) return;
    const room = (this.rooms[spot.kind] ||= new Room(spot.kind, G, spot.label));
    room.refresh();
    G.setScene(room.scene);
    room.scene.add(P.group, ...P.indicators);
    P.collide = room.collide;
    P.pos.copy(room.entry);
    P.vel.set(0, 0, 0);
    P.drawing = false;
    P.hideIndicators();
    G.camTarget.copy(P.pos);
    this.room = room;
    this.roomSpot = spot;
    this.entering = this.flyHold = false;
    this.fly = 0;
    this.near = null;
    this.prompt.classList.remove('show');
    G.sfx.sample('uiConfirm', { vol: 0.35, rate: 0.8, jitter: 0 });
    G.tips.hide();
    document.body.classList.add('in-room');
    G.banner(spot.label, 'Walk up to things and press E · the doormat leads back out', 1.6);
  }

  leaveRoom() {
    const G = this.game;
    if (this.leaving) return;
    this.leaving = true;
    this.close();
    this.prompt.classList.remove('show');
    G.fade();
    G.sfx.sample('whoosh', { vol: 0.25, rate: 0.9, jitter: 0 });
    setTimeout(() => {
      this.leaving = false;
      if (!this.active || !this.room) return;
      const P = G.player;
      const spot = this.roomSpot;
      this.room = null;
      document.body.classList.remove('in-room');
      G.setScene(this.scene);
      this.scene.add(P.group, ...P.indicators);
      P.collide = this.collide;
      P.pos.set(spot.x, 0, spot.z);
      P.vel.set(0, 0, 0);
      G.camTarget.copy(P.pos);
      this.near = null;
    }, 240);
  }

  /** Inside a building: tick the room, show the nearest station, use it on E. */
  updateRoom(dt) {
    const room = this.room;
    const P = this.game.player;
    let near = null;
    let best = Infinity;
    for (const s of room.allStations()) {
      const d = Math.hypot(P.pos.x - s.x, P.pos.z - s.z);
      if (d < s.r && d < best) {
        best = d;
        near = s;
      }
    }
    room.update(dt, P.pos, this.openKind ? null : near);
    if (this.openKind) this.preview?.update(dt);
    if (near !== this.near) {
      this.near = near;
      this.prompt.classList.toggle('show', !!near && !this.openKind);
      if (near) {
        this.prompt.innerHTML = `<span class="cp-btn">${near.verb}</span> <b></b> <span class="cp-keys">click, or press <kbd>E</kbd> / <kbd>Enter</kbd></span>`;
        this.prompt.querySelector('b').textContent = near.label;
      }
    }
    const I = this.game.input;
    const use = I.wasPressed('KeyE') || I.wasPressed('Enter') || I.wasPressed('NumpadEnter') || I.wasPressed('KeyF');
    if (use && near && !this.openKind) this.useStation(near);
    if (I.wasPressed('Escape')) {
      if (this.openKind) this.close();
      else this.leaveRoom();
    }
  }

  useStation(s) {
    if (s.act === 'exit') return this.leaveRoom();
    this.showPanel({ kind: s.panel, label: s.label }, s.focus);
  }

  refreshHud() {
    document.getElementById('camp-gems').textContent = `◆ ${profile.gems}`;
    const r = document.getElementById('camp-records');
    if (r) r.textContent = `Power ${heroPower()} · Best wave ${profile.best.wave} · Bosses ${profile.bosses} · Runs ${profile.runs}`;
  }

  // ------------------------------------------------------------ panels

  open(spot) {
    spot = this.spots.find((s) => s.kind === spot.kind) || spot;
    if (ROOM_KINDS.includes(spot.kind) && !this.room && modelStatus.state !== 'loading') return this.enterRoom(spot);
    this.showPanel(spot);
  }

  /** Open a building's screen. Out in the camp it gets the painted interior behind it. */
  showPanel(spot, focus) {
    this.preview ||= new Preview(this.game.renderer);
    this.hallFocus = this.tailorFocus = null;
    this.openKind = spot.kind;
    this.shopNote = '';
    if (spot.kind === 'hall' && focus) this.hallFocus = focus;
    if (spot.kind === 'wardrobe' && focus) this.tailorFocus = focus;
    this.prompt.classList.remove('show');
    this.game.sfx.sample('uiConfirm', { vol: 0.4, jitter: 0 });
    if (!this.room) {
      // Step inside: the camera pushes to the door, then the room fades up behind the screen.
      this.flySpot = spot;
      this.game.sfx.sample('whoosh', { vol: 0.25, rate: 0.7, jitter: 0 });
      this.interior.innerHTML = interiorHtml(spot.kind);
      this.interior.className = `show k-${spot.kind}`;
    }
    this.render();
    this.panel.classList.add('show');
  }

  close() {
    this.preview?.hide();
    const wasOpen = this.openKind;
    this.openKind = null;
    this.interior.classList.remove('show');
    this.panel.classList.remove('show');
    // Purchases and equips change what's on display.
    if (wasOpen && this.room) this.room.refresh();
    if (this.near) this.prompt.classList.add('show');
  }

  render() {
    const k = this.openKind;
    let html = '';
    this.previewWhat = null;
    this.previewItem = null;
    if (k === 'hall') {
      html = this.hallHtml();
    } else if (k === 'wardrobe') {
      html = this.tailorHtml();
    } else if (k === 'shrine') {
      const cp = profile.checkpoint;
      html = `<h2>Trophy Board</h2><p class="lead">Every victory gets carved into the board. Beat a boss to mark a save point.</p>
        <div class="records">
          <div><b>${profile.best.wave}</b><span>Best wave</span></div>
          <div><b>${profile.bosses}</b><span>Bosses slain</span></div>
          <div><b>${profile.runs}</b><span>Runs</span></div>
          <div><b>◆ ${profile.totalGems}</b><span>Gems found</span></div>
        </div>
        ${cp ? `<p class="save">Saved: after wave ${cp.wave} with ${Object.keys(cp.build).length} skills. Enter the gate to continue from wave ${cp.wave + 1}.</p>` : '<p class="save none">No save yet.</p>'}
        <p class="where">${saveWhere()}</p>`;
    } else if (k === 'armory') {
      html = this.armoryHtml();
    } else if (k === 'merchant') {
      html = this.merchantHtml();
    } else if (k === 'blacksmith') {
      html = this.blacksmithHtml();
    } else if (k === 'gate') {
      html = this.worldMapHtml();
    }
    this.panel.classList.toggle('wide', k === 'gate' || k === 'armory' || k === 'merchant' || k === 'blacksmith' || k === 'hall' || k === 'wardrobe');
    this.panel.innerHTML = `${html}<button class="close" data-act="close" aria-label="Close">✕</button><p class="foot">◆ ${profile.gems} gems · Esc to close</p>`;
    this.syncPreview();
  }

  // ------------------------------------------------------------ armory

  /** Equipped bow and armor, the stash, and a detail view comparing the selected item. */
  armoryHtml() {
    const items = stash();
    const filter = this.gearFilter || 'all';
    const shown = items.filter((i) => filter === 'all' || i.slot === filter).sort((a, b) => (isEquipped(b) - isEquipped(a)) || score(b) - score(a));
    const sel = findItem(this.gearSel) || equipped('bow');
    this.gearSel = sel?.uid;
    const tile = (i) =>
      `<button class="gtile ${i.uid === sel?.uid ? 'sel' : ''} ${isEquipped(i) ? 'eq' : ''}" data-act="gear-select" data-uid="${i.uid}" data-preview="item:${i.uid}" style="--rar:${RARITIES[i.rarity].color}">
        <span class="gi">${gearIcon(i)}</span><span class="gp">${i.power}</span>${isEquipped(i) ? '<span class="ge">E</span>' : ''}</button>`;
    const slotCard = (key, label) => {
      const i = key.startsWith('gadget') ? equippedGadget(Number(key.slice(-1))) : equipped(key);
      if (!i) return `<div class="gslot empty"><div class="gs-label">${label}</div><div class="gs-name">Empty</div></div>`;
      return `<button class="gslot" data-act="gear-select" data-uid="${i.uid}" style="--rar:${RARITIES[i.rarity].color}"><span class="gs-icon">${gearIcon(i)}</span><div class="gs-label">${label}</div><div class="gs-name">${esc(i.name)}</div><div class="gs-meta">${RARITIES[i.rarity].name} · Power ${i.power}</div></button>`;
    };
    let detail = '';
    if (sel) {
      const cur = sel.slot === 'gadget' ? equippedGadget(1) || equippedGadget(2) : equipped(sel.slot);
      const R = RARITIES[sel.rarity];
      this.previewItem = sel;
      detail = `<div class="gear-detail" style="--rar:${R.color}"><div class="cp-stage small"><canvas id="camp-preview"></canvas><div class="cp-icon" style="display:none"></div></div>
        <div class="gc-top"><span class="gc-rar">${R.name} ${slotLabel(sel.slot)}</span><span class="gc-pow">Power ${sel.power}</span></div>
        <div class="gc-name">${esc(sel.name)}</div>
        <div class="gc-base">${baseOf(sel).blurb}${isEquipped(sel) || !cur || cur.base !== sel.base && sel.slot === 'gadget' ? '' : ` Compared with ${esc(cur.name)}.`}</div>
        <div class="gc-stats">${statLines(sel, isEquipped(sel) || (sel.slot === 'gadget' && cur?.base !== sel.base) ? null : cur)}</div>
        <div class="gc-perks">${perkLines(sel) || '<div class="pk none">No perks</div>'}</div>
        <div class="actions">${this.gearActions(sel)}</div></div>`;
    }
    const tab = (f, label) => `<button class="gtab ${filter === f ? 'on' : ''}" data-act="gear-filter" data-f="${f}">${label}</button>`;
    return `<div class="cp-head"><h2>Armory</h2><p class="lead">Hero power <b>${heroPower()}</b>. Gear you find in the ruins ends up here.</p></div>
      <div class="gslots">${slotCard('bow', 'Bow')}${slotCard('armor', 'Armor')}${slotCard('gadget1', 'Gadget · 1')}${slotCard('gadget2', 'Gadget · 2')}</div>
      <div class="garmory"><div><div class="gtabs">${tab('all', 'All')}${tab('bow', 'Bows')}${tab('armor', 'Armor')}${tab('gadget', 'Gadgets')}<span class="gcount">${items.length} / 40</span></div>
      <div class="ggrid">${shown.map(tile).join('')}</div></div>${detail}</div>`;
  }

  // ------------------------------------------------------------ world map

  /** The world map: mission nodes on a painted map, details and the tier picker. */
  worldMapHtml() {
    const sel = selectedMission();
    const cp = profile.checkpoint;
    const stars = (id) => {
      const st = missionStars(id);
      return [st.clear, st.secret, st.challenge].map((on) => `<i class="${on ? 'on' : ''}">★</i>`).join('');
    };
    const node = (m, icon) => {
      const open = m === ENDLESS || missionUnlocked(m);
      const badge = m === ENDLESS ? '<span class="ms">∞</span>' : m.daily ? `<span class="ms daily">${dailyRecord().best ? dailyRecord().best.toLocaleString() : 'New today'}</span>` : `<span class="ms">${stars(m.id)}</span>`;
      return `<button class="mnode ${sel.id === m.id ? 'sel' : ''} ${open ? '' : 'locked'} ${m.daily ? 'daily' : ''}" data-act="mission" data-v="${m.id}" style="left:${m.map.x}%;top:${m.map.y}%" ${open ? '' : 'disabled'}>
        <span class="mi">${open ? icon : MAP_ICONS.lock}</span><span class="mn">${m.name}</span>${badge}</button>`;
    };
    const icons = { ruins: MAP_ICONS.ruins, keep: MAP_ICONS.keep, forge: MAP_ICONS.forge };
    // Roads between places, drawn in the art's 500x300 box; roads to locked places fade out.
    const road = (a, b, open) => {
      const [x1, y1, x2, y2] = [a.map.x * 5, a.map.y * 3, b.map.x * 5, b.map.y * 3];
      const d = `M${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) * 1 - 36} ${x2} ${y2}`;
      return `<path class="rd-under ${open ? '' : 'off'}" d="${d}"/><path class="rd ${open ? '' : 'off'}" d="${d}"/>`;
    };
    const daily = dailyMission();
    const roads =
      MISSIONS.slice(1).map((m, i) => road(MISSIONS[i], m, missionUnlocked(m))).join('') + road(MISSIONS[0], ENDLESS, true) + road(MISSIONS[0], daily, true);
    // Fog hides the places you haven't reached yet.
    const fog = MISSIONS.filter((m) => !missionUnlocked(m))
      .map((m) => `<div class="wfog" style="left:${m.map.x}%;top:${m.map.y}%"></div>`)
      .join('');
    // Clouds keep drifting across redraws: start each one where its loop has got to.
    const now = performance.now() / 1000;
    const clouds = [
      [14, 70, 0, 1],
      [38, 95, 30, 0.8],
      [62, 80, 55, 1.2],
      [80, 110, 12, 0.9],
    ]
      .map(([top, dur, off, sc]) => `<div class="wcloud" style="top:${top}%;animation-duration:${dur}s;animation-delay:-${((now + off) % dur).toFixed(2)}s;--s:${sc}"></div>`)
      .join('');
    const hero = this.heroAt || sel.map;
    const heroMarker = `<div class="whero" style="left:${hero.x}%;top:${hero.y}%"><div class="wh-flag">${MAP_ICONS.hero}</div><div class="wh-shadow"></div></div>`;
    setTimeout(() => this.moveHero(), 0);
    let detail;
    if (sel.daily) {
      const rec = dailyRecord();
      detail = `<h3>Daily Trial</h3><p>${daily.blurb}</p>
        <div class="dmods">${daily.mods.map((id) => `<div class="dmod"><b>${MODIFIERS[id].name}</b> ${MODIFIERS[id].text}</div>`).join('')}</div>
        <p class="dbest">Your best today: <b>${rec.best ? rec.best.toLocaleString() : '—'}</b>${rec.rewarded ? ' · reward claimed' : ' · first clear pays gear'}</p>
        <div class="dboard" id="daily-board"><div class="db-title">Today's leaderboard</div><div class="db-rows">Loading…</div></div>
        ${this.tierPicker()}<div class="actions"><button data-act="new" class="gold">Start trial</button></div>`;
      setTimeout(() => this.fillLeaderboard(), 0);
    } else if (sel === ENDLESS) {
      detail = `<h3>${ENDLESS.name}</h3><p>${ENDLESS.blurb}</p>${this.tierPicker()}<div class="actions">
        <button data-act="new" class="gold">Start · Wave 1</button>
        ${cp ? `<button data-act="continue">Continue · Wave ${cp.wave + 1}</button>` : ''}</div>`;
    } else {
      const st = missionStars(sel.id);
      detail = `<h3>${sel.name}</h3><p>${sel.blurb}</p>
        <ul class="mobj">
          <li class="${st.clear ? 'done' : ''}">★ Defeat the boss (${sel.waves} waves)</li>
          <li class="${st.secret ? 'done' : ''}">★ Find the hidden treasure chest</li>
          <li class="${st.challenge ? 'done' : ''}">★ ${sel.challenge.text}</li>
        </ul>${this.tierPicker()}
        <div class="actions"><button data-act="new" class="gold">Start mission</button></div>`;
    }
    return `<h2>World Map</h2><p class="lead">Hero power <b>${heroPower()}</b> · ★ ${totalStars()} / ${MISSIONS.length * 3}</p>
      <div class="wmap-wrap"><div class="wmap">${mapArt()}<svg class="wpaths" viewBox="0 0 500 300" preserveAspectRatio="none">${roads}</svg>
        ${fog}${clouds}<div class="wcart"><span>The Borderlands</span></div>
        ${MISSIONS.map((m) => node(m, icons[m.id])).join('')}${node(ENDLESS, MAP_ICONS.endless)}${node(daily, MAP_ICONS.daily)}${heroMarker}</div>
      <div class="mdetail">${detail}</div></div>`;
  }

  /** Walk the hero marker along the road from the last place picked to the new one. */
  moveHero() {
    const el = this.panel.querySelector('.whero');
    if (!el) return;
    const to = selectedMission().map;
    const from = this.heroAt || to;
    this.heroAt = { ...to };
    if (from.x === to.x && from.y === to.y) return;
    const t0 = performance.now();
    const cx = (from.x + to.x) / 2;
    const cy = Math.min(from.y, to.y) - 12;
    el.classList.add('walking');
    const step = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - t0) / 750);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const u = 1 - e;
      el.style.left = `${u * u * from.x + 2 * u * e * cx + e * e * to.x}%`;
      el.style.top = `${u * u * from.y + 2 * u * e * cy + e * e * to.y}%`;
      if (t < 1) requestAnimationFrame(step);
      else el.classList.remove('walking');
    };
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ hall & tailor

  /** Status line + action button for a character or outfit. */
  unlockAction(key, cost, req, value, selected, available) {
    const owned = !!profile.owned[key];
    if (!available) return '<span class="tag">Coming soon</span>';
    if (selected) return '<span class="tag on">Equipped</span>';
    if (owned) return `<button data-act="equip" data-v="${value}" class="gold big">Equip</button>`;
    if (!requirementMet(req)) return `<span class="tag lock">🔒 ${req.label}</span>`;
    return `<button data-act="buy" data-v="${value}" data-cost="${cost}" class="gold big" ${profile.gems < cost ? 'disabled' : ''}>Unlock · ◆ ${cost}</button>`;
  }

  hallHtml() {
    const focus = CHARACTERS.find((c) => c.id === this.hallFocus) || currentCharacter();
    this.hallFocus = focus.id;
    this.previewWhat = { kind: 'character', id: focus.id, outfit: profile.outfit[focus.id] || 'default' };
    this.previewAccent = '#ffc860';
    const owned = !!profile.owned[focus.id];
    const cards = CHARACTERS.map((c) => {
      const has = !!profile.owned[c.id];
      const met = requirementMet(c.requires);
      return `<button class="hcard ${c.id === focus.id ? 'sel' : ''} ${!has && !met ? 'locked' : ''}" data-act="focus" data-v="${c.id}" data-preview="char:${c.id}">
        <span class="hc-name">${c.name}</span><span class="hc-perk">${c.perk}</span>
        <span class="hc-state">${profile.character === c.id ? '<i class="on">Equipped</i>' : has ? 'Owned' : met ? `◆ ${c.cost}` : `🔒 ${c.requires.label}`}</span></button>`;
    }).join('');
    return `<div class="cp-head"><h2>Hall of Heroes</h2><p class="lead">Choose who walks into the ruins.</p></div>
      <div class="cp-split">
        <div class="cp-stage"><canvas id="camp-preview"></canvas>
          <div class="cp-info"><div class="cp-name">${focus.name}</div><div class="cp-perk">${focus.perk}</div><div class="cp-blurb">${focus.blurb}</div>
          <div class="cp-act">${this.unlockAction(focus.id, focus.cost, focus.requires, focus.id, profile.character === focus.id, !!models[focus.id])}</div>
          ${owned ? '' : `<div class="cp-note">${requirementMet(focus.requires) ? 'Preview: unlock to play as this hero.' : 'Preview of a locked hero.'}</div>`}</div></div>
        <div class="cp-list">${cards}</div>
      </div>`;
  }

  tailorHtml() {
    const hero = currentCharacter();
    const list = OUTFITS.filter((o) => o.base === hero.id);
    if (!list.length) return `<div class="cp-head"><h2>Tailor's Tent</h2></div><p class="empty">The tailor is still working on outfits for ${hero.name.split(' ')[0]}. Come back soon.</p>`;
    const cur = profile.outfit[hero.id] || 'default';
    const focus = list.find((o) => o.id === this.tailorFocus) || list.find((o) => o.id === cur) || list[0];
    this.tailorFocus = focus.id;
    this.previewWhat = { kind: 'character', id: hero.id, outfit: focus.id };
    this.previewAccent = OUTFIT_COLORS[focus.id] || '#ffc860';
    const key = outfitKey(focus);
    const cards = list
      .map((o) => {
        const has = !!profile.owned[outfitKey(o)];
        const met = requirementMet(o.requires);
        return `<button class="hcard swatch ${o.id === focus.id ? 'sel' : ''} ${!has && !met ? 'locked' : ''}" data-act="focus" data-v="${o.id}" data-preview="outfit:${o.id}" style="--sw:${OUTFIT_COLORS[o.id] || '#888'}">
          <span class="sw"></span><span class="hc-name">${o.name}</span>
          <span class="hc-state">${cur === o.id ? '<i class="on">Wearing</i>' : has ? 'Owned' : met ? `◆ ${o.cost}` : `🔒 ${o.requires.label}`}</span></button>`;
      })
      .join('');
    return `<div class="cp-head"><h2>Tailor's Tent</h2><p class="lead">New looks for ${hero.name.split(' ')[0]}. Try anything on before you buy.</p></div>
      <div class="cp-split">
        <div class="cp-stage"><canvas id="camp-preview"></canvas>
          <div class="cp-info"><div class="cp-name">${focus.name}</div>
          <div class="cp-act">${this.unlockAction(key, focus.cost, focus.requires, key, cur === focus.id, true)}</div>
          ${profile.owned[key] ? '' : '<div class="cp-note">Trying it on. Unlock to keep it.</div>'}</div></div>
        <div class="cp-list">${cards}</div>
      </div>`;
  }

  /** Hovering a choice previews it on the stand (without re-rendering the panel). */
  onPanelHover(e) {
    const el = e.target.closest('[data-preview]');
    if (!el || !this.preview) return;
    const canvas = this.panel.querySelector('#camp-preview');
    const [kind, id] = el.dataset.preview.split(':');
    if (kind === 'char') this.preview.show(canvas, { kind: 'character', id, outfit: profile.outfit[id] || 'default' }, '#ffc860');
    else if (kind === 'outfit') this.preview.show(canvas, { kind: 'character', id: profile.character, outfit: id }, OUTFIT_COLORS[id] || '#ffc860');
    else if (kind === 'item') {
      const item = findItem(id) || merchantStock().find((i) => i.uid === id);
      if (item) this.showItemPreview(item);
    }
  }

  /** Put an item on the stand (bows in 3D; armor and gadgets as a big icon). */
  showItemPreview(item) {
    const stage = this.panel.querySelector('.cp-stage');
    if (!stage || !item) return;
    const color = RARITIES[item.rarity].color;
    stage.style.setProperty('--rar', color);
    const canvas = stage.querySelector('#camp-preview');
    const icon = stage.querySelector('.cp-icon');
    if (item.slot === 'bow') {
      canvas.style.display = '';
      icon.style.display = 'none';
      this.preview?.show(canvas, { kind: 'bow', item: { base: item.base, rarity: item.rarity } }, color);
    } else {
      canvas.style.display = 'none';
      icon.style.display = '';
      icon.innerHTML = gearIcon(item);
    }
  }

  /** After rendering a panel: wire the preview stand to whatever it should show. */
  syncPreview() {
    if (!this.preview) return;
    const canvas = this.panel.querySelector('#camp-preview');
    if (!canvas) return this.preview.hide();
    if (this.previewItem) return this.showItemPreview(this.previewItem);
    if (this.previewWhat) this.preview.show(canvas, this.previewWhat, this.previewAccent);
  }

  /** A compact card for one item (used by the shops). */
  itemCard(item, extra = '') {
    const R = RARITIES[item.rarity];
    return `<div class="icard" data-preview="item:${item.uid}" style="--rar:${R.color}"><div class="ic-head"><span class="gi">${gearIcon(item)}</span><div><div class="gc-rar">${R.name} ${slotLabel(item.slot)}</div><div class="ic-name">${esc(item.name)}</div><div class="ic-meta">Power ${item.power}</div></div></div>
      <div class="gc-perks">${perkLines(item) || '<div class="pk none">No perks</div>'}</div>${extra}</div>`;
  }

  merchantHtml() {
    const stock = merchantStock();
    const cards = stock
      .map((item, i) => this.itemCard(item, item.sold ? '<div class="ic-act"><span class="tag">Sold</span></div>' : `<div class="ic-act"><button data-act="shop-buy" data-i="${i}" class="gold" ${profile.gems < price(item) ? 'disabled' : ''}>Buy · ◆ ${price(item)}</button></div>`))
      .join('');
    const mystery = ['bow', 'armor', 'gadget'].map((sl) => `<button data-act="shop-mystery" data-slot="${sl}" ${profile.gems < MYSTERY_COST ? 'disabled' : ''}>Mystery ${slotLabel(sl)} · ◆ ${MYSTERY_COST}</button>`).join('');
    this.previewItem = stock.find((i) => !i.sold) || stock[0];
    return `<div class="cp-head"><h2>Merchant</h2><p class="lead">“Finest goods this side of the mountains. New stock every time you come back.”</p></div>
      ${this.shopNote ? `<p class="shop-note">${this.shopNote}</p>` : ''}
      <div class="cp-split shop"><div class="cp-stage small"><canvas id="camp-preview"></canvas><div class="cp-icon" style="display:none"></div></div><div class="icards">${cards}</div></div>
      <div class="actions">${mystery}<button data-act="shop-restock" ${profile.gems < RESTOCK_COST ? 'disabled' : ''}>Restock · ◆ ${RESTOCK_COST}</button></div>`;
  }

  blacksmithHtml() {
    const items = [...stash()];
    const sel = findItem(this.smithSel) || equipped('bow');
    this.smithSel = sel?.uid;
    const tiles = items
      .sort((a, b) => (isEquipped(b) - isEquipped(a)) || score(b) - score(a))
      .map((i) => `<button class="gtile ${i.uid === sel?.uid ? 'sel' : ''} ${isEquipped(i) ? 'eq' : ''}" data-act="smith-select" data-uid="${i.uid}" data-preview="item:${i.uid}" style="--rar:${RARITIES[i.rarity].color}"><span class="gi">${gearIcon(i)}</span><span class="gp">${i.power}</span>${isEquipped(i) ? '<span class="ge">E</span>' : ''}</button>`)
      .join('');
    let detail = '';
    if (sel) {
      const target = honeTarget(sel);
      const maxed = sel.power >= MAX_POWER;
      this.previewItem = sel;
      detail = '<div class="cp-stage small"><canvas id="camp-preview"></canvas><div class="cp-icon" style="display:none"></div></div>' + this.itemCard(
        sel,
        `<div class="ic-act col">
          <button data-act="smith-temper" class="gold" ${maxed || profile.gems < temperCost(sel) ? 'disabled' : ''}>${maxed ? 'Fully tempered' : `Temper: Power ${sel.power} → ${sel.power + 1} · ◆ ${temperCost(sel)}`}</button>
          <button data-act="smith-hone" ${!target || profile.gems < honeCost(sel) ? 'disabled' : ''}>${target ? `Hone ${PERKS[target[0]].name} → ${ROMAN_TIER[target[1] + 1]} · ◆ ${honeCost(sel)}` : 'No perk to hone'}</button>
        </div>`,
      );
    }
    return `<div class="cp-head"><h2>Blacksmith</h2><p class="lead">“Bring me your gear. I'll make it hit harder and hold up longer.”</p></div>
      ${this.shopNote ? `<p class="shop-note">${this.shopNote}</p>` : ''}
      <div class="garmory"><div class="ggrid">${tiles}</div>${detail}</div>`;
  }

  onShopAct(act, data) {
    const G = this.game;
    let ok = false;
    this.shopNote = '';
    if (act === 'shop-buy') {
      const item = buy(Number(data.i));
      if (item) this.shopNote = `Bought <b style="color:${RARITIES[item.rarity].color}">${esc(item.name)}</b>. It's in your stash at the Armory.`;
      ok = !!item;
    } else if (act === 'shop-mystery') {
      const item = buyMystery(data.slot);
      if (item) this.shopNote = `The bundle held <b style="color:${RARITIES[item.rarity].color}">${esc(item.name)}</b> (${RARITIES[item.rarity].name}, Power ${item.power}).`;
      ok = !!item;
      if (item?.rarity === 'unique') G.sfx.sample('jingleClear', { vol: 0.6, jitter: 0 });
    } else if (act === 'shop-restock') {
      ok = payRestock();
    } else if (act === 'smith-select') {
      this.smithSel = data.uid;
      G.sfx.sample('uiSelect', { vol: 0.25, jitter: 0 });
      return this.render();
    } else if (act === 'smith-temper') {
      ok = temper(findItem(this.smithSel));
      if (ok) {
        this.shopNote = 'Tempered: +1 power.';
        G.sfx.sample('clang', { vol: 0.8, rate: 1.1, jitter: 0.1 });
      }
    } else if (act === 'smith-hone') {
      const name = hone(findItem(this.smithSel));
      ok = !!name;
      if (ok) {
        this.shopNote = `${name} honed to the next tier.`;
        G.sfx.sample('clang', { vol: 0.8, rate: 1.4, jitter: 0.1 });
      }
    }
    G.sfx.sample(ok ? 'ding' : 'uiSwitch', { vol: ok ? 0.45 : 0.3, rate: ok ? 1.5 : 1, jitter: 0 });
    if (ok) G.player.hp = G.maxHp();
    this.refreshHud();
    this.render();
  }

  /** Fill in the daily leaderboard (names set as text, never HTML). */
  async fillLeaderboard() {
    const board = await leaderboard(8);
    const el = document.querySelector('#daily-board .db-rows');
    if (!el) return;
    if (!board) {
      el.textContent = 'The shared leaderboard appears when the game runs as a claude.ai page.';
      return;
    }
    if (!board.top.length) {
      el.textContent = 'No scores yet today. Be the first!';
      return;
    }
    el.innerHTML = '';
    board.top.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = `db-row ${r.me ? 'me' : ''}`;
      row.innerHTML = '<span class="r"></span><span class="n"></span><span class="s"></span>';
      row.querySelector('.r').textContent = `${i + 1}`;
      row.querySelector('.n').textContent = r.me ? `${r.name} (you)` : r.name;
      row.querySelector('.s').textContent = r.score.toLocaleString();
      el.appendChild(row);
    });
    if (board.rank && board.rank > board.top.length) {
      const you = document.createElement('div');
      you.className = 'db-row me';
      you.textContent = `You: #${board.rank} of ${board.total}`;
      el.appendChild(you);
    }
  }

  /** Difficulty cards: pick the tier for the next run. */
  tierPicker() {
    const cur = selectedDifficulty();
    const cards = DIFFICULTIES.map((d) => {
      const open = isUnlocked(d);
      const prev = DIFFICULTIES.find((x) => x.id === d.unlock);
      const warn = open && underPowered(d) ? `<div class="tw">Recommended power ${d.power}</div>` : `<div class="tp">Power ${d.power}+</div>`;
      return `<button class="tier ${d.id === cur.id ? 'on' : ''} ${open ? '' : 'locked'}" data-act="tier" data-v="${d.id}" style="--tc:${d.color}" ${open ? '' : 'disabled'}>
        <div class="tn">${d.name}</div><div class="tb">${open ? d.blurb : `🔒 Beat a boss on ${prev.name}`}</div>${open ? warn : ''}
        ${open && d.id !== 'adventurer' ? `<div class="tl">Loot +${d.lootPower} power · gems ×${d.gems}</div>` : ''}</button>`;
    }).join('');
    return `<div class="tiers">${cards}</div>`;
  }

  /** Equip / salvage buttons for the selected item (gadgets pick a slot). */
  gearActions(sel) {
    const key = equipKey(sel);
    const salvageBtn = key ? '' : `<button data-act="gear-salvage" data-uid="${sel.uid}">Salvage · ◆ ${salvageValue(sel)}</button>`;
    if (sel.slot === 'gadget') {
      const slots = [1, 2]
        .filter((n) => key !== `gadget${n}`)
        .map((n) => `<button data-act="gear-equip" data-uid="${sel.uid}" data-key="gadget${n}" class="gold">Equip in slot ${n}</button>`)
        .join('');
      return (key ? `<span class="tag on">In slot ${key.slice(-1)}</span>` : '') + slots + salvageBtn;
    }
    return key ? '<span class="tag on">Equipped</span>' : `<button data-act="gear-equip" data-uid="${sel.uid}" class="gold">Equip</button>${salvageBtn}`;
  }

  onGearAct(act, data) {
    const G = this.game;
    if (act === 'gear-select') this.gearSel = data.uid;
    else if (act === 'gear-filter') this.gearFilter = data.f;
    else if (act === 'gear-equip') {
      const item = findItem(data.uid);
      if (item) {
        equip(item, data.key || undefined);
        G.sfx.sample('clang', { vol: 0.5, rate: 1.3, jitter: 0 });
        G.player.hp = G.maxHp();
      }
    } else if (act === 'gear-salvage') {
      const item = findItem(data.uid);
      const gems = item ? salvage(item) : 0;
      if (gems) {
        G.sfx.sample('ding', { vol: 0.5, rate: 1.6, jitter: 0 });
        this.gearSel = null;
        this.refreshHud();
      }
    }
    G.sfx.sample('uiSelect', { vol: 0.25, jitter: 0 });
    this.render();
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
    if (act.startsWith('gear-')) return this.onGearAct(act, b.dataset);
    if (act.startsWith('shop-') || act.startsWith('smith-')) return this.onShopAct(act, b.dataset);
    if (act === 'focus') {
      if (this.openKind === 'hall') this.hallFocus = v;
      else this.tailorFocus = v;
      G.sfx.sample('uiSelect', { vol: 0.3, jitter: 0 });
      return this.render();
    }
    if (act === 'mission') {
      if (selectMission(v)) G.sfx.sample('uiSelect', { vol: 0.35, jitter: 0 });
      return this.render();
    }
    if (act === 'tier') {
      if (selectDifficulty(v)) G.sfx.sample('uiConfirm', { vol: 0.4, jitter: 0 });
      return this.render();
    }
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
