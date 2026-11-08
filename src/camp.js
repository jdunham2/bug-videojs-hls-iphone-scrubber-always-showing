// The camp: a small walkable hub shown before and between runs. Walk the hero
// to a building and press E (or click the prompt) to use it:
//   Hall of Heroes → choose a character   Tailor's Tent → choose an outfit
//   Trophy Board   → save point / records  Camp Gate     → start a run

import * as THREE from 'three';
import { doorwayTexture } from './juice.js';
import { spawnProp, models, modelStatus, disposeTree } from './models.js';
import { Particles } from './fx.js';
import { ArrowSystem } from './arrows.js';
import { CHARACTERS, OUTFITS, profile, saveProfile, purchase, requirementMet, outfitKey, saveStatus, currentCharacter } from './profile.js';
import { Preview } from './preview.js';
import { interiorHtml, prepareInteriors } from './interiors.js';
import { mapArt, prepareMapArt } from './worldmap-art.js';
import { Room, ROOM_KINDS } from './rooms.js';
import { BOSS_FORMS } from './boss.js';
import { bounties, bountyInfo, claimBounty, bountiesReady, levelFor } from './progression.js';
import { TALENTS, rank, talentPoints, learn, resetTalents } from './talents.js';
import { PROVISIONS, MAX_PACK, pack, buyProvision, unpack, giftReady, claimGift, RUMORS, PLUMAGE, ownsPlumage, currentPlumage, buyPlumage } from './provisions.js';
import { falconUnlocked } from './companion.js';
import { Town, TOWN, ROAD } from './town.js';
import { villager, questOf, accept, handIn, fetchable } from './quests.js';
import { FALCON_LEVEL } from './progression.js';
import { dailyMission, dailyRecord, MODIFIERS, leaderboard } from './daily.js';
import { MISSIONS, ENDLESS, missionById, missionsIn, farReachesOpen, missionStars, missionUnlocked, totalStars, selectedMission, selectMission } from './missions.js';
import { fletcherStock, buyFletch, payFletchRestock, FLETCH_RESTOCK, restring, restringCost, merchantStock, price, buy, buyMystery, payRestock, RESTOCK_COST, MYSTERY_COST, temper, temperCost, hone, honeCost, honeTarget, MAX_POWER } from './shops.js';
import { DIFFICULTIES, isUnlocked, selectedDifficulty, selectDifficulty, underPowered } from './difficulty.js';
import { stash, findItem, equipped, equippedGadget, equipKey, isEquipped, equip, salvage, salvageValue, score, heroPower, statLines, perkLines, baseOf, RARITIES, slotLabel, gearIcon, PERKS, ROMAN_TIER } from './gear.js';

const rand = (a, b) => a + Math.random() * (b - a);
const RADIUS = 25; // the camp grew: an outer ring of newer shops
const HOUSE_COST = 150;

/** The road network on the world map (neighbouring places). */
const ROADS = [
  ['ruins', 'keep'],
  ['keep', 'forge'],
  ['ruins', 'endless'],
  ['ruins', 'daily'],
  ['ruins', 'marsh'],
  ['marsh', 'hollow'],
  ['hollow', 'keep'],
  ['keep', 'mines'],
  ['mines', 'caldera'],
  ['forge', 'caldera'],
  ['forge', 'canyon'],
  ['canyon', 'endless'],
  ['endless', 'harbor'],
  ['harbor', 'ruins'],
];

/** Roads on the Far Reaches map. */
const ROADS2 = [
  ['temple', 'grove'],
  ['grove', 'oasis'],
  ['oasis', 'cove'],
  ['cove', 'foundry'],
  ['foundry', 'highlands'],
  ['temple', 'foundry'],
  ['oasis', 'foundry'],
];

const MAP_ICONS = {
  temple: '<svg viewBox="0 0 24 24"><path d="M3 20 L 21 20 L 18 16 L 6 16 Z M 6 16 L 18 16 L 15 12 L 9 12 Z M 9 12 L 15 12 L 13 8 L 11 8 Z M 11 8 L 13 8 L 13 5 L 11 5 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  grove: '<svg viewBox="0 0 24 24"><path d="M4 12 Q 12 1 20 12 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 12 L 10 21 L 14 21 L 14 12" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="8.5" r="1" fill="currentColor"/><circle cx="14" cy="7.5" r="1" fill="currentColor"/></svg>',
  oasis: '<svg viewBox="0 0 24 24"><path d="M12 20 Q 13 13 12 7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7 Q 6 6 4 10 M 12 7 Q 18 6 20 10 M 12 7 Q 9 3 6 4 M 12 7 Q 15 3 18 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 21 Q 12 17 20 21" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  cove: '<svg viewBox="0 0 24 24"><path d="M3 15 Q 12 20 21 15 L 19 12 L 5 12 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 12 L 13 3 M 13 4 L 19 10 L 12 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 20 Q 6 18 10 20 T 18 20 T 24 20" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  foundry: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3 L 12 6 M 12 18 L 12 21 M 3 12 L 6 12 M 18 12 L 21 12 M 5.6 5.6 L 7.8 7.8 M 16.2 16.2 L 18.4 18.4 M 5.6 18.4 L 7.8 16.2 M 16.2 7.8 L 18.4 5.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
  highlands: '<svg viewBox="0 0 24 24"><path d="M2 20 L 9 8 L 13 14 L 16 10 L 22 20 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 6 Q 8 4 12 6 M 13 4 Q 17 2 20 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  marsh: '<svg viewBox="0 0 24 24"><path d="M3 18 Q 12 14 21 18 M 3 21 Q 12 17 21 21" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 16 L 8 5 M 12 15 L 12 3 M 16 16 L 16 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="12" cy="4" rx="1.4" ry="2.4" fill="currentColor"/></svg>',
  hollow: '<svg viewBox="0 0 24 24"><path d="M12 3 C 18 6, 20 12, 12 21 C 4 12, 6 6, 12 3 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6 L 12 20 M 12 11 L 15 8 M 12 14 L 9 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  mines: '<svg viewBox="0 0 24 24"><path d="M4 9 C 8 4, 16 4, 20 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 6 L 12 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  harbor: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7 L 12 21 M 8 10 L 16 10 M 5 14 C 5 19, 19 19, 19 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  canyon: '<svg viewBox="0 0 24 24"><path d="M2 20 L 5 11 L 10 11 L 12 20 M 12 20 L 14 8 L 20 8 L 22 20 Z M 2 20 L 22 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="18" cy="4" r="1.6" fill="currentColor"/></svg>',
  caldera: '<svg viewBox="0 0 24 24"><path d="M2 20 L 9 8 L 15 8 L 22 20 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 8 Q 12 11 14 8 M 12 6 C 11 4, 13 3, 12 1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
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
    // Places: a click-only list of every building, so screens can always be opened.
    this.places = document.getElementById('places');
    document.getElementById('places-btn').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.togglePlaces();
    });
    document.getElementById('places-list').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const b = e.target.closest('[data-place]');
      if (b) this.goPlace(b.dataset.place);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab' || !this.active || this.game.state !== 'camp') return;
      e.preventDefault();
      this.togglePlaces();
    });
    this.panel.addEventListener('pointerover', (e) => this.onPanelHover(e));
    this.panel.addEventListener('pointerleave', () => this.syncPreview());
  }

  build() {
    if (this.built) return;
    this.built = true;
    prepareMapArt();
    prepareInteriors();
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
    // The outer ring: newer shops (Meshy buildings; a tent stands in until they're generated).
    this.building(models.fletcherHut ? 'fletcherHut' : 'tent', 4.2, 16, 12.5, 'fletcher', "Fletcher's Workshop", 2.2);
    this.building(models.apothecary ? 'apothecary' : 'tent', 4.0, -15.5, 13.5, 'apothecary', 'Apothecary', 2.0);
    this.building(models.tavern ? 'tavern' : 'tent', 7.0, -9, 19.5, 'tavern', 'The Tavern', 3.6); // beside the road to town
    this.building(models.mews ? 'mews' : 'tent', 4.2, 17.5, -14, 'mews', "Falconer's Mews", 2.2);
    for (const [x, z] of [
      [-3, -3],
      [3, 3],
      [-6, -2],
      [5, -4],
      [-3, -9],
      [9, 14],
      [-13, 21],
      [4.5, 21],
      [12, -12],
      [-13, 8],
      [14, 4],
      [-2, 14.5],
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
    // Life around the outer ring: barrels and a fire by the tavern, crates by the
    // apothecary, archery butts by the fletcher, tents and signposts on the paths.
    for (const [id, size, x, z, rot, col] of [
      ['barrel', 1.1, -4.4, 21.8, 0.3, 0.5],
      ['barrel', 1.0, -5.2, 23, 1.2, 0.45],
      ['barrel', 1.1, -13.6, 17.4, 0.7, 0.5],
      ['campfire', 0.8, -5, 15.5, 0, 0.7],
      ['crates', 1.2, -12.2, 15.6, 0.4, 0.7],
      ['crates', 1.0, -18.4, 11.2, 1.1, 0.6],
      ['dummy', 1.9, 19.6, 8.4, -2.4, 0.5],
      ['dummy', 1.9, 20.6, 11.2, -2.6, 0.5],
      ['weaponPile', 1.2, 13.2, 15.4, 0.6, 0.6],
      ['tent', 2.4, -21, -2, 1.4, 1.8],
      ['tent', 2.2, 21.5, 2.5, -1.6, 1.7],
      ['signpost', 2.2, 8.5, 9.5, -0.8, 0.4],
      ['signpost', 2.2, -9.5, 11.5, 0.8, 0.4],
      ['crates', 1.1, 20.4, -10.5, 0.2, 0.6],
      ['lantern', 2.0, 14.5, -17.5, 0, 0.25],
    ]) this.prop(id, size, x, z, rot, col);
    const fire2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff9a4a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    fire2.position.set(-5, 0.9, 15.5);
    fire2.scale.setScalar(2.6);
    S.add(fire2);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + 0.2;
      if (Math.abs(a - Math.PI * 1.25) < 0.45) continue; // gap toward the gate
      if (Math.abs(a - Math.PI / 2) < 0.16) continue; // the road to town
      this.prop('fence', 1.0, Math.cos(a) * (RADIUS + 0.6), Math.sin(a) * (RADIUS + 0.6), -a, 0, { axis: 'x', size: 2.6 });
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(RADIUS + 3, RADIUS + 14);
      if (Math.abs(Math.cos(a) * d) < 8 && Math.sin(a) > 0) continue; // keep the road clear
      this.prop(Math.random() < 0.5 ? 'deadTree' : 'rocks', Math.random() < 0.5 ? rand(4, 7) : rand(1, 2.5), Math.cos(a) * d, Math.sin(a) * d, Math.random() * 6, 0);
    }
    // Down the road: the town.
    this.town = new Town(this);
    this.town.build(S, glowTexture);
    S.add(moon.target); // the moonlight (and its shadows) follows the hero, out to the town too
  }

  /** Is (x, z) somewhere the hero can walk: the camp, the road, or the town square? */
  inArea(x, z, r = 0) {
    if (Math.hypot(x, z) < RADIUS - r) return true;
    if (Math.abs(x) < ROAD.halfWidth - r && z > ROAD.from && z < ROAD.to) return true;
    return Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.r - r;
  }

  /** Training dummy: arrows hit it like an enemy; it wobbles and reports damage. */
  addDummy(x, z) {
    const p = this.prop('dummy', 2.0, x, z, -2.2, 0.5);
    this.arrows = new ArrowSystem(this.scene, (pos) => {
      if (!this.inArea(pos.x, pos.z, -1)) return true;
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
    if (!this.inArea(pos.x, pos.z, r)) {
      // Step back onto the nearest walkable ground: camp circle, road or town square.
      const opts = [];
      const d = Math.hypot(pos.x, pos.z) || 1;
      opts.push([(pos.x / d) * (RADIUS - r), (pos.z / d) * (RADIUS - r)]);
      opts.push([Math.max(-ROAD.halfWidth + r, Math.min(ROAD.halfWidth - r, pos.x)), Math.max(ROAD.from, Math.min(ROAD.to, pos.z))]);
      const dt = Math.hypot(pos.x - TOWN.x, pos.z - TOWN.z) || 1;
      opts.push([TOWN.x + ((pos.x - TOWN.x) / dt) * (TOWN.r - r), TOWN.z + ((pos.z - TOWN.z) / dt) * (TOWN.r - r)]);
      opts.sort((a, b) => Math.hypot(a[0] - pos.x, a[1] - pos.z) - Math.hypot(b[0] - pos.x, b[1] - pos.z));
      pos.x = opts[0][0];
      pos.z = opts[0][1];
    }
    for (const c of this.colliders.concat(this.decorColliders || [])) {
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
    this.marching = null;
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
    this.refreshDecor();
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
    if (!this.built && modelStatus.state !== 'loading') {
      this.build();
      this.refreshDecor();
    }
    if (!this.built) return;
    this.time += dt;
    const P = this.game.player;
    if (this.room) {
      try {
        return this.updateRoom(dt);
      } catch (err) {
        this.game.noteError(err);
        this.room = null; // something in the room broke: step back out to camp
        this.noRooms = true;
        this.leaving = false;
        document.body.classList.remove('in-room');
        this.game.setScene(this.scene);
        this.scene.add(P.group, ...P.indicators);
        P.collide = this.collide;
        return;
      }
    }
    if (this.marching) {
      this.particles.update(dt);
      return this.updateMarch(dt);
    }
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
    // Real time since the painted room covered the screen (it fades in over ~0.7 s).
    if (!(this.openKind && this.interior.classList.contains('show'))) this.coveredSince = 0;
    else this.coveredSince ||= performance.now();
    this.coveredFor = this.coveredSince ? (performance.now() - this.coveredSince) / 1000 : 0;
    if (this.arrows) this.arrows.update(dt, [this.dummy], { onArrowHit: (a, e, point) => e.hit(a.damage, a.dir, a.charge, a.perfect), onArrowStopped: () => {}, onRicochet: () => {}, particles: this.particles });
    if (this.dummy?.rig) {
      // Springy wobble away from the hit.
      const D = this.dummy;
      D.wobble *= Math.exp(-3 * dt);
      const sway = Math.sin(this.time * 14) * D.wobble * 0.25;
      D.rig.rotation.x = D.dir ? sway * D.dir.z : 0;
      D.rig.rotation.z = D.dir ? -sway * D.dir.x : 0;
    }
    this.town?.update(dt, P.pos, this.time);
    this.moon.position.set(P.pos.x - 8, 18, P.pos.z - 6);
    this.moon.target.position.set(P.pos.x, 0, P.pos.z);
    // The gate's doorway brightens as you walk up to it, with motes drifting out.
    const gate = this.spots.find((s) => s.kind === 'gate');
    if (gate && this.portal) {
      const close = Math.max(0, 1 - Math.hypot(P.pos.x - gate.x, P.pos.z - gate.z) / 6);
      this.portal.material.color.setScalar(1.25 + close * 1.1 + 0.08 * Math.sin(this.time * 3));
      if (Math.random() < dt * (3 + close * 14)) this.particles.spawn(new THREE.Vector3(gate.bx + rand(-1, 1), rand(0.4, 2.8), gate.bz + rand(-1, 1)), { count: 1, color: [2.6, 2.1, 1.1], speed: 0.4, up: 0.4, life: 1.6, size: 0.05, gravity: -0.2, drag: 0.5 });
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
      if (near) this.prompt.innerHTML = `<span class="cp-btn">${near.kind === 'gate' ? 'Enter' : near.kind === 'npc' ? 'Talk to' : near.kind === 'cottage' && !profile.house ? 'Look at' : 'Go inside'}</span> <b></b> <span class="cp-keys">click, or press <kbd>E</kbd> / <kbd>Enter</kbd></span>`;
      if (near) this.prompt.querySelector('b').textContent = near.label;
    }
    const I = this.game.input;
    const use = I.wasPressed('KeyE') || I.wasPressed('Enter') || I.wasPressed('NumpadEnter') || I.wasPressed('KeyF');
    if (use && near && !this.openKind && !this.entering) this.open(near);
    if (this.game.input.wasPressed('Escape') && this.openKind) this.close();
  }

  /** Spend talent points: one per hero level. */
  talentsHtml() {
    const lv = levelFor(profile.xp || 0);
    const pts = talentPoints(lv.level);
    const cards = TALENTS.map((t) => {
      const r = rank(t.id);
      const pips = Array.from({ length: t.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
      const can = pts.free > 0 && r < t.max;
      return `<div class="talent ${r ? 'has' : ''} ${r >= t.max ? 'maxed' : ''}"><div class="tl-icon">${t.icon}</div>
        <div class="tl-body"><div class="tl-name">${t.name}</div><div class="tl-text">${t.text} per rank</div><div class="tl-pips">${pips}</div></div>
        <button class="gold" data-act="talent-learn" data-id="${t.id}" ${can ? '' : 'disabled'}>${r >= t.max ? 'Max' : '+'}</button></div>`;
    }).join('');
    return `<div class="cp-head"><h2>Hero Talents</h2><p class="lead">One point for every hero level. They stay with you for every hero and every run.</p>
      <p class="lvline">Hero level <b>${lv.level}</b> · <b class="tl-free">${pts.free}</b> point${pts.free === 1 ? '' : 's'} to spend · ${pts.spent} spent</p></div>
      <div class="talents">${cards}</div>
      <div class="actions"><button data-act="talent-reset" ${pts.spent ? '' : 'disabled'}>Take back all points (free)</button></div>`;
  }

  // ------------------------------------------------------------ places menu

  togglePlaces(on = !this.places.classList.contains('open')) {
    if (on) {
      const list = document.getElementById('places-list');
      list.innerHTML = this.spots.map((s) => `<button type="button" data-place="${s.kind}">${s.label}</button>`).join('');
    }
    this.places.classList.toggle('open', on);
  }

  /** Jump straight to a building's screen (from the Places menu). */
  goPlace(kind) {
    this.togglePlaces(false);
    const spot = this.spots.find((s) => s.kind === kind);
    if (!spot || this.marching) return;
    if (this.room && !this.leaving) {
      // Leave the room first, then open the screen out in camp.
      this.leaveRoom();
      setTimeout(() => this.goPlace(kind), 400);
      return;
    }
    if (this.openKind) this.close();
    this.entering = this.flyHold = false;
    const P = this.game.player;
    P.pos.set(spot.x, 0, spot.z);
    P.vel.set(0, 0, 0);
    this.game.camTarget.copy(P.pos);
    this.showPanel(spot);
  }

  // ------------------------------------------------------------ setting out

  /**
   * Leaving through the gate: the hero strides into the glowing archway with
   * the camera close behind, the light swells to gold, and a title card names
   * where you're headed before the run begins.
   */
  marchOut(fromCheckpoint) {
    const G = this.game;
    const gate = this.spots.find((s) => s.kind === 'gate');
    if (!gate || this.marching) return G.startFromCamp(fromCheckpoint);
    this.marching = { t: 0, start: performance.now(), from: G.player.pos.clone(), to: new THREE.Vector3(gate.bx, 0, gate.bz), fromCheckpoint, dur: 1.5 };
    // Real-time safety net: the run starts even if frames are slow or stall.
    const M = this.marching;
    setTimeout(() => this.marching === M && this.finishMarch(M), 2600);
    this.flySpot = gate;
    this.flyHold = true;
    this.prompt.classList.remove('show');
    G.sfx.sample('whoosh', { vol: 0.4, rate: 0.6, jitter: 0 });
    G.sfx.sample('bell', { vol: 0.35, rate: 0.7, jitter: 0, delay: 0.3 });
    const m = selectedMission();
    const card = document.getElementById('setout');
    if (card) {
      const cp = profile.checkpoint;
      card.innerHTML = `<div class="so-eyebrow">Setting out</div><div class="so-title"></div><div class="so-sub"></div>`;
      card.querySelector('.so-title').textContent = m.name;
      card.querySelector('.so-sub').textContent = fromCheckpoint && cp ? `Continuing from wave ${cp.wave + 1}` : `${selectedDifficulty().name}${m.challenge ? ` · ${m.challenge.text}` : ''}`;
    }
  }

  /** Walk the hero into the gate; at the end, flash and start the run. */
  updateMarch(dt) {
    const M = this.marching;
    const G = this.game;
    const P = G.player;
    M.t = (performance.now() - M.start) / 1000; // real time, so slow frames don't drag it out
    const p = Math.min(1, M.t / M.dur);
    const e = p * p * (3 - 2 * p);
    P.pos.lerpVectors(M.from, M.to, e);
    const dir = new THREE.Vector3().subVectors(M.to, M.from).setY(0);
    if (dir.lengthSq() > 1e-4) {
      dir.normalize();
      P.vel.copy(dir).multiplyScalar(p < 0.95 ? 5 : 0);
    }
    this.portal.material.color.setScalar(1.3 + 2.5 * e);
    if (Math.random() < dt * 40) this.particles.spawn(new THREE.Vector3(M.to.x + rand(-1, 1), rand(0.3, 2.8), M.to.z + rand(-1, 1)), { count: 1, color: [3, 2.4, 1.2], speed: 0.6, up: 1, life: 0.8, size: 0.06, gravity: -0.5 });
    if (M.t > M.dur * 0.65 && !M.flashed) {
      M.flashed = true;
      document.body.classList.add('setting-out');
    }
    if (p >= 1 && !M.started) {
      M.started = true;
      setTimeout(() => this.finishMarch(M), 450);
    }
  }

  finishMarch(M) {
    if (this.marching !== M || M.done) return;
    M.done = true;
    document.body.classList.add('setting-out');
    this.marching = null;
    this.flyHold = false;
    this.portal.material.color.setRGB(1.3, 1.15, 0.9);
    this.game.start(M.fromCheckpoint);
    setTimeout(() => document.body.classList.remove('setting-out'), 1400);
  }

  // ------------------------------------------------------------ town: villagers, the cottage

  npcHtml() {
    const v = villager(this.npcFocus);
    if (!v) return '';
    const q = questOf(v.id);
    this.previewWhat = { kind: 'character', id: models[v.id] ? v.id : 'bandit' };
    this.previewAccent = '#ffd27a';
    let speech = v.hello;
    let task = '';
    if (q.finished) {
      speech = this.questThanks || 'You have done more for this town than anyone. Come and visit any time.';
    } else {
      const t = q.task;
      speech = this.questThanks && !q.accepted ? `${this.questThanks} …And there is one more thing.` : q.accepted ? (q.ready ? 'You did it? Let me see!' : t.intro) : t.intro;
      const pct = Math.round((Math.min(q.progress, q.need) / q.need) * 100);
      const r = t.reward || {};
      const reward = [r.gems ? `◆ ${r.gems}` : '', r.xp ? `${r.xp} XP` : '', r.item ? `${r.item === 'unique' ? 'Unique' : 'Rare'} gear` : '', t.unlock ? 'a change in town' : ''].filter(Boolean).join(' · ');
      let action = '';
      if (!q.accepted) action = '<button class="gold big" data-act="quest-accept">Accept task</button>';
      else if (t.kind === 'fetch') {
        const items = fetchable(t);
        if (!items.length) action = '<span class="tag">You have nothing that fits yet (equipped gear doesn’t count)</span>';
        else {
          const pick = items.find((it) => it.uid === this.questPick) || items[0];
          this.questPick = pick.uid;
          action = `<div class="gpicks">${items.map((it) => `<button class="gtile ${it.uid === pick.uid ? 'sel' : ''}" data-act="quest-pick" data-uid="${it.uid}" style="--rar:${RARITIES[it.rarity].color}" title="${esc(it.name)}">${gearIcon(it)}<span>${it.power}</span></button>`).join('')}</div>
            <button class="gold big" data-act="quest-handin">Give ${esc(pick.name)}</button>`;
        }
      } else if (t.kind === 'donate') action = `<button class="gold big" data-act="quest-handin" ${profile.gems >= t.gems ? '' : 'disabled'}>Donate ◆ ${t.gems}</button>`;
      else action = q.ready ? '<button class="gold big" data-act="quest-handin">Hand in</button>' : `<span class="tag">In progress: ${Math.min(q.progress, q.need)} / ${q.need}</span>`;
      task = `<div class="qtask ${q.ready ? 'ready' : ''}"><div class="qt-top"><span class="qt-step">Task ${q.step + 1} of ${v.tasks.length}</span><b>${t.text}</b></div>
        ${t.kind === 'event' || t.kind === 'mission' ? `<div class="bbar"><i style="width:${pct}%"></i></div>` : ''}
        <div class="qt-reward">Reward: ${reward}</div><div class="qt-act">${action}</div></div>`;
    }
    this.questThanks = null;
    return `<div class="cp-head"><h2>${v.name}</h2><p class="lead">${v.title}</p></div>
      ${this.shopNote ? `<p class="shop-note">${this.shopNote}</p>` : ''}
      <div class="cp-split"><div class="cp-stage"><canvas id="camp-preview"></canvas></div>
      <div><div class="speech">“${esc(speech)}”</div>${task}</div></div>`;
  }

  cottageHtml() {
    return `<div class="cp-head"><h2>A Cottage for Sale</h2><p class="lead">Stone walls, a thatched roof, a warm fire and a proper bed. Yours for ◆ ${HOUSE_COST}.</p></div>
      ${this.shopNote ? `<p class="shop-note">${this.shopNote}</p>` : ''}
      <ul class="house-perks">
        <li><b>Sleep in your own bed</b> before a dungeon and start it <b>Well Rested</b>: +30 max health for that run.</li>
        <li>Rested again after every run.</li>
        <li>A chest by the bed opens your stash (the Armory).</li>
      </ul>
      <div class="actions"><button class="gold big" data-act="house-buy" ${profile.gems >= HOUSE_COST ? '' : 'disabled'}>Buy the cottage · ◆ ${HOUSE_COST}</button></div>`;
  }

  /** Sleep in your own bed: fade out, morning, and you're Well Rested for the next run. */
  sleep() {
    const G = this.game;
    if (profile.rested) {
      G.banner('Already rested', 'Your next dungeon starts Well Rested', 1.6);
      return;
    }
    document.body.classList.add('sleeping');
    G.sfx.sample('bell', { vol: 0.25, rate: 0.6, jitter: 0, delay: 1.4 });
    setTimeout(() => {
      profile.rested = true;
      saveProfile();
      G.player.hp = G.maxHp();
      this.refreshHud();
    }, 1200);
    setTimeout(() => {
      document.body.classList.remove('sleeping');
      G.banner('Well rested', 'Your next dungeon starts with +30 max health', 2.2);
    }, 2600);
  }

  // ------------------------------------------------------------ outer-ring shops

  fletcherHtml() {
    const stock = fletcherStock();
    const cards = stock
      .map((item, i) => this.itemCard(item, item.sold ? '<div class="ic-act"><span class="tag">Sold</span></div>' : `<div class="ic-act"><button data-act="fletch-buy" data-i="${i}" class="gold" ${profile.gems < price(item) ? 'disabled' : ''}>Buy · ◆ ${price(item)}</button></div>`))
      .join('');
    const bows = stash().filter((it) => it.slot === 'bow' && it.perks?.length);
    const sel = bows.find((it) => it.uid === this.fletchSel) || bows[0];
    this.fletchSel = sel?.uid;
    this.previewItem = sel || stock.find((i) => !i.sold) || stock[0];
    const picks = bows.map((it) => `<button class="gtile ${it.uid === sel?.uid ? 'sel' : ''}" data-act="fletch-pick" data-uid="${it.uid}" style="--rar:${RARITIES[it.rarity].color}">${gearIcon(it)}<span>${it.power}</span></button>`).join('');
    const restringBox = sel
      ? `<div class="restring"><h3 class="sub">Restring a bow</h3><p class="lead">Swaps the bow's weakest perk for a different one at the same tier.</p><div class="gpicks">${picks}</div>
        ${this.itemCard(sel, `<div class="ic-act"><button data-act="fletch-restring" class="gold" ${profile.gems < restringCost(sel) ? 'disabled' : ''}>Restring · ◆ ${restringCost(sel)}</button></div>`)}</div>`
      : '<p class="empty">No bows with perks to restring yet.</p>';
    return `<div class="cp-head"><h2>Fletcher's Workshop</h2><p class="lead">“Bows are all I make, and I make them well. Better odds of something rare than the merchant.”</p></div>
      ${this.shopNote ? `<p class="shop-note">${this.shopNote}</p>` : ''}
      <div class="cp-split shop"><div class="cp-stage small"><canvas id="camp-preview"></canvas><div class="cp-icon" style="display:none"></div></div><div class="icards">${cards}</div></div>
      <div class="actions"><button data-act="fletch-restock" ${profile.gems < FLETCH_RESTOCK ? 'disabled' : ''}>New bows · ◆ ${FLETCH_RESTOCK}</button></div>
      ${restringBox}`;
  }

  /** Apothecary and Tavern: provisions for the next run, plus the tavern's daily gift. */
  provisionsHtml(shop) {
    const list = pack();
    const cards = Object.entries(PROVISIONS)
      .filter(([, p]) => p.shop === shop)
      .map(([id, p]) => {
        const packed = list.includes(id);
        const can = !packed && list.length < MAX_PACK && profile.gems >= p.cost;
        return `<div class="prov ${packed ? 'packed' : ''}"><div class="pv-icon">${p.icon}</div><div class="pv-body"><div class="pv-name">${p.name}</div><div class="pv-text">${p.text}</div></div>
          ${packed ? '<span class="tag on">Packed</span>' : `<button class="gold" data-act="prov-buy" data-id="${id}" ${can ? '' : 'disabled'}>◆ ${p.cost}</button>`}</div>`;
      })
      .join('');
    const packHtml = list.length
      ? list.map((id) => `<span class="pk-item">${PROVISIONS[id].icon} ${PROVISIONS[id].name} <button data-act="prov-unpack" data-id="${id}" title="Take it back out (refund)">✕</button></span>`).join('')
      : '<span class="empty">Nothing packed yet.</span>';
    let extra = '';
    if (shop === 'tavern') {
      const ready = giftReady();
      const rumor = RUMORS[(new Date().getDate() + profile.runs) % RUMORS.length];
      extra = `<div class="tavern-gift"><div><b>On the house</b><span>Gems every day, and sometimes a piece of gear.</span></div>
        <button class="gold big" data-act="tavern-gift" ${ready ? '' : 'disabled'}>${ready ? 'Claim today’s gift' : 'Come back tomorrow'}</button></div>
        <p class="rumor">Overheard at the bar: <i>“${rumor}”</i></p>`;
    }
    const title = shop === 'tavern' ? 'The Tavern' : 'Apothecary';
    const lead = shop === 'tavern' ? 'Warm fire, cold ale, and people who know things. Hire help for your next run.' : '“A good meal and the right tonic, and you’ll fight like two.” Each lasts for one run.';
    return `<div class="cp-head"><h2>${title}</h2><p class="lead">${lead}</p></div>
      ${this.shopNote ? `<p class="shop-note">${this.shopNote}</p>` : ''}
      ${extra}
      <div class="provs">${cards}</div>
      <div class="pack"><b>Packed for your next run (${list.length}/${MAX_PACK}):</b> ${packHtml}</div>`;
  }

  mewsHtml() {
    const cur = currentPlumage();
    const has = falconUnlocked();
    const cards = Object.entries(PLUMAGE)
      .map(([id, p]) => {
        const owned = ownsPlumage(id);
        const action = cur === id ? '<span class="tag on">Wearing</span>' : `<button class="gold" data-act="plumage" data-id="${id}" ${owned || profile.gems >= p.cost ? '' : 'disabled'}>${owned ? 'Use' : `◆ ${p.cost}`}</button>`;
        return `<div class="prov ${cur === id ? 'packed' : ''}"><div class="pv-icon" style="background:${p.swatch};border-color:${p.swatch}"></div><div class="pv-body"><div class="pv-name">${p.name}</div><div class="pv-text">${owned ? 'Owned' : 'Plumage for your falcon'}</div></div>${action}</div>`;
      })
      .join('');
    return `<div class="cp-head"><h2>Falconer's Mews</h2><p class="lead">${has ? 'Your falcon is well. Fancy a new look for it?' : `Your falcon joins you at hero level ${FALCON_LEVEL}. You can pick its colors now.`}</p></div>
      ${this.shopNote ? `<p class="shop-note">${this.shopNote}</p>` : ''}
      <div class="provs">${cards}</div>`;
  }

  // ------------------------------------------------------------ the camp grows

  /** Trophies and new structures that appear as you progress. */
  refreshDecor() {
    if (!this.built) return;
    if (this.decor) {
      this.decor.removeFromParent();
      disposeTree(this.decor);
    }
    this.decor = new THREE.Group();
    this.scene.add(this.decor);
    this.decorColliders = [];
    const lv = levelFor(profile.xp || 0).level;
    const m = profile.missions || {};
    const items = [
      { id: 'trophy', when: profile.bosses >= 1, name: "Gorvak's hammer on a plinth", build: () => this.trophyHammer(-1.5, -7.2) },
      { id: 'well', when: lv >= 3, name: 'A stone well', build: () => this.decorProp('springWell', 1.6, -1.5, 11, 0.4, 1.1) },
      { id: 'ruins', when: m.ruins?.clear, name: 'A relic from the Sunken Ruins', build: () => this.decorProp('pillarBroken', 2.4, 8.2, 8.6, 0.6, 0.7) },
      { id: 'keep', when: m.keep?.clear, name: 'Ice from Frostpeak Keep', build: () => this.decorProp('iceCrystals', 1.6, 10.6, 6.2, 0.2, 0.8) },
      { id: 'forge', when: m.forge?.clear, name: 'A brazier from the Molten Forge', build: () => this.decorProp('forgeBrazier', 1.5, 2.2, 10.8, 0, 0.6) },
      { id: 'marsh', when: m.marsh?.clear, name: "Brogg's reed banner", build: () => this.decorProp('wolfBanner', 2.6, 13.2, -4.2, -1.9, 0.4) },
      { id: 'hollow', when: m.hollow?.clear, name: 'A hunting trophy from Autumn Hollow', build: () => this.decorProp('weaponPile', 1.2, -13.4, 4.6, 0.8, 0.6) },
      { id: 'mines', when: m.mines?.clear, name: 'A mine cart of ore', build: () => this.decorProp('crates', 1.3, -3.4, 12.6, 0.3, 0.7) },
      { id: 'harbor', when: m.harbor?.clear, name: "Saltjaw's powder kegs", build: () => this.decorProp('powderBarrel', 1.0, 4.6, 12.2, 0.2, 0.5) },
      { id: 'canyon', when: m.canyon?.clear, name: 'Sandstone from Sunscorch Canyon', build: () => this.decorProp('rocks', 1.6, 12.8, -6.8, 0.4, 0.8) },
      { id: 'caldera', when: m.caldera?.clear, name: 'A pillar of cooled lava', build: () => this.decorProp('lavaPillar', 3.2, -12.6, -1.4, 0.2, 0.7) },
      { id: 'temple', when: m.temple?.clear, name: 'A stone head from the Verdant Temple', build: () => this.decorProp('stoneHead', 2.2, -8.5, 11.2, 2.4, 0.9) },
      { id: 'cove', when: m.cove?.clear, name: "Blackhook's anchor", build: () => this.decorProp('anchor', 1.6, 13.6, -1, -1.2, 0.6) },
      { id: 'grove', when: m.grove?.clear, name: 'Glowcaps from the grove', build: () => this.decorProp('mushroomCluster', 1.4, 7.5, -2.5, 0.6, 0.6) },
      { id: 'oasis', when: m.oasis?.clear, name: 'A palm from the oasis', build: () => this.decorProp('palmTree', 5, 10.8, 10, 0.3, 0.5) },
      { id: 'foundry', when: m.foundry?.clear, name: 'Cogs from the Clockwork Foundry', build: () => this.decorProp('cogPile', 1.2, -4, -12.5, 0.5, 0.6) },
      { id: 'highlands', when: m.highlands?.clear, name: 'A lantern from the high pass', build: () => this.decorProp('stoneLantern', 2, -4.5, 9, 0, 0.5) },
      { id: 'banners', when: profile.bosses >= 3, name: 'War banners at the gate', build: () => [this.decorProp('wolfBanner', 3, -11.4, -6.6, 0.6, 0.4), this.decorProp('wolfBanner', 3, -6.6, -11.4, 0.9, 0.4)] },
      { id: 'drum', when: lv >= 5, name: 'A war drum', build: () => this.decorProp('warDrum', 1.3, -12, 2 - 5.5, 0.4, 0.7) },
      { id: 'ballista', when: lv >= 7, name: 'A ballista on watch', build: () => this.decorProp('ballista', 2.2, 10.4, -10, -2.3, 1.0) },
      { id: 'hoard', when: (profile.totalGems || 0) >= 1000, name: 'A treasure hoard', build: () => this.decorProp('treasureChest', 1.1, 8.6, 4.6, -0.6, 0.7) },
      { id: 'statue', when: lv >= 10, name: 'A statue in your honour', build: () => this.decorProp('kingStatue', 3.6, 12.2, 6.2, -2.0, 1.0) },
    ];
    const seen = (profile.campSeen ||= []);
    const fresh = [];
    for (const it of items) {
      if (!it.when) continue;
      it.build();
      if (!seen.includes(it.id)) {
        seen.push(it.id);
        fresh.push(it.name);
      }
    }
    if (fresh.length) {
      saveProfile();
      setTimeout(() => this.active && this.game.banner('Your camp grows', fresh.join(' · '), 2.6), 900);
    }
  }

  decorProp(id, size, x, z, rotY, collideR) {
    const p = spawnProp(id, size);
    if (!p) return null;
    p.position.set(x, 0, z);
    p.rotation.y = rotY;
    this.decor.add(p);
    if (collideR > 0) this.decorColliders.push({ x, z, r: collideR });
    return p;
  }

  /** The boss's hammer mounted on a stone plinth, lit from below. */
  trophyHammer(x, z) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), new THREE.MeshStandardMaterial({ color: 0x5a544a, roughness: 0.85 }));
    plinth.position.set(x, 0.4, z);
    plinth.castShadow = plinth.receiveShadow = true;
    this.decor.add(plinth);
    const h = spawnProp('hammer', 1.8, { axis: 'x' });
    if (h) {
      h.position.set(x, 0.85, z);
      h.rotation.set(0, 0.6, 0.9);
      this.decor.add(h);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb066, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(x, 1.4, z);
    glow.scale.setScalar(2.2);
    this.decor.add(glow);
    this.decorColliders.push({ x, z, r: 0.8 });
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
      setTimeout(() => {
        try {
          this.switchToRoom(spot);
        } catch (err) {
          // The room couldn't be set up: don't leave the camp stuck "entering";
          // open the building's screen out here instead.
          G.noteError(err);
          this.roomFailed(spot);
        }
      }, 240);
    }, 330);
    // Safety net: whatever happens, never stay stuck on the way in.
    setTimeout(() => this.entering && !this.room && this.roomFailed(spot), 2500);
  }

  roomFailed(spot) {
    const G = this.game;
    this.entering = this.flyHold = false;
    this.room = null;
    document.body.classList.remove('in-room');
    G.setScene(this.scene);
    this.scene.add(G.player.group, ...G.player.indicators);
    G.player.collide = this.collide;
    this.noRooms = true; // use the screens directly from now on
    this.showPanel(spot);
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
    if (s.act === 'sleep') return this.sleep();
    this.showPanel({ kind: s.panel, label: s.label }, s.focus);
  }

  refreshHud() {
    document.getElementById('camp-gems').textContent = `◆ ${profile.gems}`;
    const r = document.getElementById('camp-records');
    const ready = bountiesReady();
    this.town?.refreshMarkers();
    const free = talentPoints(levelFor(profile.xp || 0).level).free;
    if (r) r.textContent = `Level ${levelFor(profile.xp || 0).level}${free ? ` (${free} talent point${free > 1 ? 's' : ''} to spend in the Hall)` : ''} · Power ${heroPower()} · Best wave ${profile.best.wave} · Bosses ${profile.bosses}${profile.rested ? ' · ☾ Well rested' : ''}${ready ? ` · ★ ${ready} bounty ready at the Trophy Board` : ''}`;
  }

  // ------------------------------------------------------------ panels

  open(spot) {
    spot = this.spots.find((s) => s.kind === spot.kind && (!spot.npc || s.npc === spot.npc)) || spot;
    if (spot.kind === 'cottage' && !profile.house) return this.showPanel(spot); // for sale: the sale screen first
    if (ROOM_KINDS.includes(spot.kind) && !this.room && !this.noRooms && modelStatus.state !== 'loading') return this.enterRoom(spot);
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
    if (spot.kind === 'npc') this.npcFocus = spot.npc;
    this.questPick = null;
    this.prompt.classList.remove('show');
    this.game.sfx.sample('uiConfirm', { vol: 0.4, jitter: 0 });
    if (!this.room) {
      // Step inside: the camera pushes to the door, then the room fades up behind the screen.
      this.flySpot = spot;
      this.game.sfx.sample('whoosh', { vol: 0.25, rate: 0.7, jitter: 0 });
      const room = interiorHtml(spot.kind);
      this.interior.innerHTML = room;
      this.interior.className = room ? `show k-${spot.kind}` : ''; // villagers: the town stays behind the screen
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

  /** Draw the open screen; if building it fails, say so rather than showing nothing. */
  render() {
    try {
      this.renderPanel();
    } catch (err) {
      this.game.noteError(err);
      this.panel.innerHTML = `<div class="cp-head"><h2>Something went wrong</h2><p class="lead">This screen couldn't be drawn. Close it and try again; if it keeps happening, open Settings → Copy diagnostics and send the report.</p></div><p class="empty"></p><button class="close" data-act="close" aria-label="Close">✕</button>`;
      this.panel.querySelector('.empty').textContent = String(err?.message || err);
      this.panel.classList.add('show');
    }
  }

  renderPanel() {
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
      const lv = levelFor(profile.xp || 0);
      const list = bounties()
        .map((b, i) => {
          const info = bountyInfo(b);
          return `<div class="bounty ${info.done ? 'done' : ''}"><div class="bt">${info.text}</div><div class="br">Reward: ◆ ${info.gems} · ${info.xp} XP · ${b.progress} / ${b.target}</div>
            <div class="bbar"><i style="width:${Math.round((b.progress / b.target) * 100)}%"></i></div>
            <div class="bact">${info.done ? `<button class="gold" data-act="bounty-claim" data-i="${i}">Claim</button>` : '<span class="tag">In progress</span>'}</div></div>`;
        })
        .join('');
      html = `<div class="cp-head"><h2>Trophy Board</h2><p class="lead">Bounties, records and your save. Finished bounties pay out here.</p>
        <p class="lvline">Hero level <b>${lv.level}</b><span class="lvbar"><i style="width:${Math.round(lv.frac * 100)}%"></i></span>${lv.into} / ${lv.need} XP</p></div>
        ${this.shopNote ? `<p class="shop-note">${this.shopNote}</p>` : ''}
        <h3 class="sub">Bounties</h3><div class="bounties">${list}</div>
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
    } else if (k === 'talents') {
      html = this.talentsHtml();
    } else if (k === 'npc') {
      html = this.npcHtml();
    } else if (k === 'cottage') {
      html = this.cottageHtml();
    } else if (k === 'fletcher') {
      html = this.fletcherHtml();
    } else if (k === 'apothecary') {
      html = this.provisionsHtml('apothecary');
    } else if (k === 'tavern') {
      html = this.provisionsHtml('tavern');
    } else if (k === 'mews') {
      html = this.mewsHtml();
    }
    this.panel.classList.toggle('wide', k === 'gate' || k === 'armory' || k === 'merchant' || k === 'blacksmith' || k === 'hall' || k === 'wardrobe' || k === 'talents' || k === 'fletcher' || k === 'apothecary' || k === 'tavern' || k === 'mews' || k === 'npc' || k === 'cottage');
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
    const icons = MAP_ICONS;
    // Roads between places, drawn in the art's 500x300 box; roads to locked places fade out.
    // Roads between neighbouring places (a gentle bend each); a road is faded
    // until both ends are open.
    const road = (a, b, open) => {
      const [x1, y1, x2, y2] = [a.map.x * 5, a.map.y * 3, b.map.x * 5, b.map.y * 3];
      const len = Math.hypot(x2 - x1, y2 - y1);
      const bend = len * 0.18;
      const cx = (x1 + x2) / 2 + ((y2 - y1) / len) * bend;
      const cy = (y1 + y2) / 2 - ((x2 - x1) / len) * bend;
      const d = `M${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
      return `<path class="rd-under ${open ? '' : 'off'}" d="${d}"/><path class="rd ${open ? '' : 'off'}" d="${d}"/>`;
    };
    const daily = dailyMission();
    const place = (id) => (id === 'endless' ? ENDLESS : id === 'daily' ? daily : missionById(id));
    const isOpen = (p) => p === ENDLESS || p === daily || missionUnlocked(p);
    // Which region's map is showing: the one you picked last, else where the selected mission is.
    const selRegion = sel.region || 1;
    if (!this.mapRegion || (this.mapRegion === 2 && !farReachesOpen())) this.mapRegion = selRegion;
    const region = this.mapRegion;
    const roads = (region === 2 ? ROADS2 : ROADS).map(([a, b]) => {
      const A = place(a);
      const B = place(b);
      return A && B ? road(A, B, isOpen(A) && isOpen(B)) : '';
    }).join('');
    // Fog hides the places you haven't reached yet.
    const fog = missionsIn(region)
      .filter((m) => !missionUnlocked(m))
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
    // The hero marker stands on the selected mission, on its own region's map.
    if ((this.heroRegion || selRegion) !== selRegion) this.heroAt = null;
    this.heroRegion = selRegion;
    const hero = this.heroAt || sel.map;
    const heroMarker = selRegion === region ? `<div class="whero" style="left:${hero.x}%;top:${hero.y}%"><div class="wh-flag">${MAP_ICONS.hero}</div><div class="wh-shadow"></div></div>` : '';
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
      const boss = BOSS_FORMS[sel.theme % BOSS_FORMS.length];
      detail = `<h3>${sel.name}</h3><p>${sel.blurb}</p><p class="mboss">Boss: <b>${boss.name}</b> · ${sel.waves} waves · enemies level ${sel.level + 1}+</p>
        <ul class="mobj">
          <li class="${st.clear ? 'done' : ''}">★ Defeat the boss (${sel.waves} waves)</li>
          <li class="${st.secret ? 'done' : ''}">★ Find the hidden treasure chest</li>
          <li class="${st.challenge ? 'done' : ''}">★ ${sel.challenge.text}</li>
        </ul>${this.tierPicker()}
        <div class="actions"><button data-act="new" class="gold">Start mission</button></div>`;
    }
    const far = farReachesOpen();
    const tabs = `<div class="wtabs"><button class="${region === 1 ? 'on' : ''}" data-act="region" data-v="1">The Borderlands</button><button class="${region === 2 ? 'on' : ''} ${far ? '' : 'locked'}" data-act="region" data-v="2" ${far ? '' : 'disabled'}>${far ? '' : MAP_ICONS.lock}The Far Reaches${far ? '' : ' · clear Emberfall Caldera'}</button></div>`;
    const nodes = missionsIn(region).map((m) => node(m, icons[m.id])).join('') + (region === 1 ? node(ENDLESS, MAP_ICONS.endless) + node(daily, MAP_ICONS.daily) : '');
    return `<h2>World Map</h2><p class="lead">Hero power <b>${heroPower()}</b> · ★ ${totalStars()} / ${MISSIONS.length * 3}</p>${tabs}
      <div class="wmap-wrap"><div class="wmap" data-region="${region}">${mapArt(region)}<svg class="wpaths" viewBox="0 0 500 300" preserveAspectRatio="none">${roads}</svg>
        ${fog}${clouds}<div class="wcart"><span>${region === 2 ? 'The Far Reaches' : 'The Borderlands'}</span></div>
        ${nodes}${heroMarker}</div>
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
    if (act === 'quest-accept') {
      if (accept(this.npcFocus)) G.sfx.sample('uiConfirm', { vol: 0.45, jitter: 0 });
      this.town?.refreshMarkers();
      return this.render();
    }
    if (act === 'quest-pick') {
      this.questPick = b.dataset.uid;
      return this.render();
    }
    if (act === 'quest-handin') {
      const r = handIn(this.npcFocus, this.questPick);
      if (r) {
        const up = r.xpResult && r.xpResult.after.level > r.xpResult.before.level;
        this.questThanks = r.done;
        this.shopNote = `Reward: ${[r.gems ? `◆ ${r.gems}` : '', r.xp ? `${r.xp} XP` : '', r.item ? r.item.name : ''].filter(Boolean).join(' · ')}${up ? ` · Level up! (${r.xpResult.after.level})` : ''}${r.unlock ? ' · Something new in town!' : ''}`;
        G.sfx.sample('jingleClear', { vol: 0.55, jitter: 0 });
        this.particles.spawn(G.player.pos.clone().setY(1.2), { count: 40, color: [3, 2.2, 0.6], speed: 5, up: 4, life: 0.9, size: 0.08, gravity: 3 });
        if (r.unlock) this.town?.refreshUnlocks();
        this.town?.refreshMarkers();
        this.refreshHud();
      }
      return this.render();
    }
    if (act === 'house-buy') {
      if (profile.gems >= HOUSE_COST && !profile.house) {
        profile.gems -= HOUSE_COST;
        profile.house = true;
        saveProfile();
        G.sfx.sample('jingleClear', { vol: 0.6, jitter: 0 });
        this.town?.setOwned();
        this.refreshHud();
        const spot = this.spots.find((x) => x.kind === 'cottage');
        this.close();
        G.banner('Your new home', 'Sleep in the bed before a dungeon to start it Well Rested', 2.2);
        setTimeout(() => this.open(spot), 700);
      }
      return;
    }
    if (act === 'fletch-buy') {
      const it = buyFletch(Number(b.dataset.i));
      this.shopNote = it ? `Bought ${it.name}. It's in your stash (Armory).` : 'Not enough gems.';
      G.sfx.sample(it ? 'jingleClear' : 'uiSwitch', { vol: 0.45, jitter: 0 });
      return this.render();
    }
    if (act === 'fletch-restock') {
      if (payFletchRestock()) G.sfx.sample('uiConfirm', { vol: 0.4, jitter: 0 });
      return this.render();
    }
    if (act === 'fletch-pick') {
      this.fletchSel = b.dataset.uid;
      return this.render();
    }
    if (act === 'fletch-restring') {
      const r = restring(findItem(this.fletchSel));
      this.shopNote = r ? `Restrung: ${r.was} → ${r.now}.` : 'Not enough gems.';
      G.sfx.sample(r ? 'clang' : 'uiSwitch', { vol: 0.4, rate: 1.5, jitter: 0 });
      return this.render();
    }
    if (act === 'prov-buy') {
      const ok = buyProvision(b.dataset.id);
      this.shopNote = ok ? `${PROVISIONS[b.dataset.id].name} packed for your next run.` : pack().length >= MAX_PACK ? `Your pack is full (${MAX_PACK}).` : 'Not enough gems.';
      G.sfx.sample(ok ? 'uiConfirm' : 'uiSwitch', { vol: 0.45, jitter: 0 });
      this.refreshHud();
      return this.render();
    }
    if (act === 'prov-unpack') {
      unpack(b.dataset.id);
      this.refreshHud();
      return this.render();
    }
    if (act === 'tavern-gift') {
      const r = claimGift(levelFor(profile.xp || 0).level);
      if (r) {
        this.shopNote = `On the house: ◆ ${r.gems}${r.item ? ` and ${r.item.name} (in your stash)` : ''}.`;
        G.sfx.sample('jingleClear', { vol: 0.5, jitter: 0 });
        this.particles.spawn(G.player.pos.clone().setY(1.2), { count: 30, color: [3, 2.2, 0.6], speed: 4, up: 3, life: 0.8, size: 0.08, gravity: 3 });
      }
      this.refreshHud();
      return this.render();
    }
    if (act === 'plumage') {
      if (buyPlumage(b.dataset.id)) {
        G.sfx.sample('uiConfirm', { vol: 0.45, jitter: 0 });
        G.falcon.applyPlumage();
      } else G.sfx.sample('uiSwitch', { vol: 0.3 });
      this.refreshHud();
      return this.render();
    }
    if (act === 'talent-learn') {
      if (learn(b.dataset.id, levelFor(profile.xp || 0).level)) {
        G.sfx.sample('uiConfirm', { vol: 0.45, rate: 1.2, jitter: 0 });
        G.player.hp = G.maxHp();
      } else G.sfx.sample('uiSwitch', { vol: 0.3 });
      this.refreshHud();
      return this.render();
    }
    if (act === 'talent-reset') {
      resetTalents();
      G.sfx.sample('whoosh', { vol: 0.3, rate: 1.2, jitter: 0 });
      this.refreshHud();
      return this.render();
    }
    if (act === 'bounty-claim') {
      const r = claimBounty(Number(b.dataset.i));
      if (r) {
        G.sfx.sample('jingleClear', { vol: 0.55, jitter: 0 });
        const up = r.xpResult.after.level > r.xpResult.before.level;
        this.shopNote = `Claimed: ◆ ${r.gems} and ${r.xp} XP.${up ? ` Level up! You're now level ${r.xpResult.after.level} (+◆ ${r.xpResult.rewards.reduce((a, w) => a + w.gems, 0)}${r.xpResult.rewards.some((w) => w.item) ? ' and new gear in your stash' : ''}).` : ''}`;
        this.particles.spawn(G.player.pos.clone().setY(1.2), { count: 40, color: [3, 2.2, 0.6], speed: 5, up: 4, life: 0.9, size: 0.08, gravity: 3 });
        if (up) G.banner('Level up!', `Hero level ${r.xpResult.after.level}`, 1.8);
        this.refreshHud();
      }
      return this.render();
    }
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
    if (act === 'region') {
      this.mapRegion = Number(v);
      G.sfx.sample('whoosh', { vol: 0.25, rate: 1.2, jitter: 0 });
      return this.render();
    }
    if (act === 'tier') {
      if (selectDifficulty(v)) G.sfx.sample('uiConfirm', { vol: 0.4, jitter: 0 });
      return this.render();
    }
    if (act === 'new' || act === 'continue') {
      this.close();
      this.marchOut(act === 'continue');
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
  const grad = g.createRadialGradient(512, 512, 0, 512, 512, 240);
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
