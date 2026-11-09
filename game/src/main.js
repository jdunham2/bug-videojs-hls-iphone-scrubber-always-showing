import * as THREE from 'three';
import { buildTerrain, heightAt, findSpawn, WATER_LEVEL, HALF } from './terrain.js';
import { Environment } from './environment.js';
import { World } from './world.js';
import { CreatureManager, SPECIES } from './creatures.js';
import { Player } from './player.js';
import { Building, KIND } from './building.js';
import { Inventory, ITEMS, RECIPES } from './items.js';
import { UI } from './ui.js';
import { SaveSystem, applySave } from './save.js';
import { WorldMap } from './map.js';
import { TouchControls, IS_TOUCH } from './touch.js';
import { Audio } from './audio.js';
import { pick, angleLerp } from './util.js';
import { clamp, lerp } from './noise.js';

const TAME_NAMES = ['Pebbles', 'Brutus', 'Fern', 'Ember', 'Moss', 'Tusk', 'Juniper', 'Rook', 'Saffron', 'Grit', 'Nova', 'Bramble', 'Kodiak', 'Wren'];

class Game {
  constructor(quality) {
    this.quality = quality;
    const canvas = document.getElementById('c');
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 4000);
    this.shared = { uTime: { value: 0 }, uWind: { value: 1 } };
    this.clock = new THREE.Clock();
    this.audio = new Audio();

    this.env = new Environment(this.scene, renderer, quality, this.shared);
    this.terrain = buildTerrain(quality);
    this.scene.add(this.terrain);
    this.spawnPoint = findSpawn();
    this.world = new World(this.scene, quality, this.shared, this.spawnPoint);
    this.building = new Building(this.scene, this.world, this.shared);

    this.player = new Player(this.camera, this.scene);
    this.player.vmMat.depthTest = false; this.player.vmMat.depthWrite = false;
    this.player.pos.copy(this.spawnPoint);
    this.player.yaw = 0;

    this.inv = new Inventory(() => this.ui && this.ui.refresh());
    this.hotIndex = 0;
    this.stats = { wood: 0, stone: 0, fiber: 0, ore: 0, ingot: 0, metalCrafted: 0, beds: 0, crafted: 0, cooked: 0, placedFire: 0, floors: 0, walls: 0, tamed: 0, rode: 0, kills: 0 };

    this.creatures = new CreatureManager(this.scene, this.world, {
      notify: (t, k) => this.ui.notify(t, k),
      roar: (c) => { c.roarT = 0.6; this.playRoar(c); },
      call: (c, d) => this.playRoar(c, true),
      bite: (c) => { if (c.pos.distanceTo(this.player.pos) < 40) this.audio.flesh(); },
      hitPlayer: (dmg, c) => this.hurtPlayer(dmg, c),
      dismount: () => this.dismount(),
      died: (c, attacker) => {
        if (attacker === 'player' || attacker === this.player.mount) { this.player.addXP(10 + c.level * 2, this.xpHooks); this.stats.kills++; this.ui.notify(`Killed ${c.label}`, 'kill'); }
        if (c.tamed) this.ui.notify(`Your ${c.name} was killed!`, 'warn');
      },
      ko: () => this.audio.tone({ f0: 160, f1: 60, dur: 0.6, vol: 0.3 }),
      thud: () => { this.audio.tone({ f0: 90, f1: 40, dur: 0.4, vol: 0.5, type: 'triangle' }); this.audio.noiseHit({ freq: 300, dur: 0.3, vol: 0.4, type: 'lowpass' }); },
      flap: (c) => { if (c.pos.distanceTo(this.player.pos) < 60) this.audio.noiseHit({ freq: 250, q: 0.6, dur: 0.5, vol: 0.35, type: 'lowpass' }); },
    });
    this.creatures.populate(this.spawnPoint);

    this.arrows = [];
    this.arrowGeo = (() => {
      const g = new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4); g.rotateX(Math.PI / 2); return g;
    })();
    this.arrowMat = new THREE.MeshStandardMaterial({ color: 0x8a6a40 });
    this.damageNums = [];

    this.input = { keys: {}, mx: 0, my: 0, sens: 1, onStep: (w) => this.audio.step(w) };
    this.attackCd = 0;
    this.feedCd = 0;
    this.locked = false;
    this.started = false;
    this.paused = false;

    this.ui = new UI(this);
    this.saves = new SaveSystem(this);
    this.map = new WorldMap(this);
    if (IS_TOUCH) { this.noLock = true; this.touch = new TouchControls(this); }
    this.xpHooks = { levelUp: (l) => { this.ui.banner(`LEVEL ${l}`, 'Health and stamina increased'); this.audio.tamed(); } };

    this.quests = [
      { title: 'Gather materials: punch trees, rocks and bushes', progress: () => `🪵 ${Math.min(this.stats.wood, 15)}/15 · 🪨 ${Math.min(this.stats.stone, 12)}/12 · 🌿 ${Math.min(this.stats.fiber, 20)}/20`, done: () => this.stats.wood >= 15 && this.stats.stone >= 12 && this.stats.fiber >= 20 },
      { title: 'Open crafting [Tab] and make a Stone Hatchet or Pick', progress: () => 'Tools gather faster and yield more', done: () => this.inv.count('hatchet') + this.inv.count('pick') > 0 || this.stats.crafted >= 1 },
      { title: 'Hunt: collect 3 Raw Meat and 2 Hide', progress: () => `🥩 ${Math.min(this.inv.count('meat') + this.stats.cooked, 3)}/3 · 🟫 ${Math.min(this.inv.count('hide'), 2)}/2 — Pudgewings are easy prey`, done: () => this.inv.count('meat') + this.stats.cooked >= 3 && this.inv.count('hide') >= 2 },
      { title: 'Build a Campfire, light it [E] and cook meat nearby', progress: () => `Cooked ${Math.min(this.stats.cooked, 1)}/1`, done: () => this.stats.cooked >= 1 },
      { title: 'Shelter: place a Timber Floor and 2 Walls', progress: () => `Floors ${Math.min(this.stats.floors, 1)}/1 · Walls ${Math.min(this.stats.walls, 2)}/2`, done: () => this.stats.floors >= 1 && this.stats.walls >= 2 },
      { title: 'Craft a Hunter Bow and Tranq Arrows (needs purple Dozeberries)', progress: () => `Bow ${this.inv.count('bow') ? '✔' : '✘'} · Arrows ${this.inv.count('arrow')}`, done: () => this.inv.count('bow') > 0 && this.inv.count('arrow') > 0 },
      { title: 'Knock out a creature with tranq arrows, then feed it to tame', progress: () => 'Herbivores eat Wildberries · Carnivores eat Raw Meat', done: () => this.stats.tamed >= 1 },
      { title: 'Craft a Rough Saddle and ride a rideable tame [E]', progress: () => 'Rideable: Trikeros, Crestcaller, Ironhide, Talonrunner, Spinesail, Gorgonax, and the flying Galewing and Thunderwing', done: () => this.stats.rode >= 1 },
      { title: 'Place a Sleeping Bag to set your respawn point', progress: () => 'Craft one from Hide and Fiber', done: () => this.stats.beds >= 1 },
      { title: 'Craft Hide Armor and wear it (tap it twice in the inventory)', progress: () => 'Armor soaks up damage until it breaks', done: () => !!this.player.armor },
      { title: 'Mine 10 Metal Ore in the northern mountains', progress: () => `🟠 ${Math.min(this.stats.ore, 10)}/10 — orange-veined rocks; use a pick`, done: () => this.stats.ore >= 10 },
      { title: 'Build a Forge, light it and smelt 8 Metal Ingots', progress: () => `🔩 ${Math.min(this.stats.ingot, 8)}/8 — stand near the lit forge with Ore and Wood`, done: () => this.stats.ingot >= 8 },
      { title: 'Craft a metal tool, weapon or armor at the Forge', progress: () => 'Metal Pick, Hatchet, Sword or Armor', done: () => this.stats.metalCrafted >= 1 },
      { title: 'Build a stone shelter: 2 Stone Floors and 4 Stone Walls', progress: () => `Floors ${Math.min(this.stoneCount('floor'), 2)}/2 · Walls ${Math.min(this.stoneCount('wall'), 4)}/4`, done: () => this.stoneCount('floor') >= 2 && this.stoneCount('wall') >= 4 },
    ];
    this.questIdx = 0;

    // starter kit
    this.inv.add('berries', 6);

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.ui.refresh();
    this.ui.quest(this.quests[0], 0, this.quests.length);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ------------------------------------------------ Input
  bindInput() {
    const canvas = this.renderer.domElement;
    document.addEventListener('keydown', (e) => {
      if (!this.started) return;
      if (e.code === 'KeyM' && !this.ui.open) { this.map.toggle(); return; }
      if (this.map.open) { if (e.code === 'Escape') this.map.toggle(false); return; }
      if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); this.toggleInventory(); return; }
      if (e.code === 'Escape' && this.ui.open) { this.toggleInventory(false); return; }
      if (this.ui.open || this.paused) return;
      this.input.keys[e.code] = true;
      if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < 8) this.selectHot(n); }
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF') this.toggleFollow();
      if (e.code === 'KeyR') this.building.rotate();
      if (e.code === 'KeyV') this.player.camDist = this.player.camDist > 10 ? 7 : 13;
    });
    document.addEventListener('keyup', (e) => { this.input.keys[e.code] = false; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked && !this.ui.open) { this.input.mx += e.movementX; this.input.my += e.movementY; }
    });
    // Fallback for embedded/sandboxed pages where pointer lock is refused: free mouse-look.
    document.addEventListener('pointerlockerror', () => {
      if (!this.started) return;
      this.noLock = true;
      this.locked = !this.ui.open;
      this.setPaused(false);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.started || this.ui.open) return;
      if (!this.locked) { this.lock(); return; }
      if (e.button === 0) this.input.mouseDown = true;
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.input.mouseDown = false; if (this.touch) this.touch.hold.attack = false; });
    document.addEventListener('wheel', (e) => {
      if (!this.started || this.ui.open || !this.locked) return;
      this.selectHot((this.hotIndex + (e.deltaY > 0 ? 1 : 7)) % 8);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.started && !this.ui.open && !this.map.open && this.player.alive) this.setPaused(true);
      if (this.locked) this.setPaused(false);
    });
    document.getElementById('resume').addEventListener('click', () => this.lock());
    document.getElementById('inv-close').addEventListener('click', () => this.toggleInventory(false));
    document.getElementById('inv-save').addEventListener('click', () => this.saves.save(true));
    document.getElementById('pause-save').addEventListener('click', () => this.saves.save(true));
    const flush = () => { if (this.started && this.player.alive) { this.saves.flushLocal(); this.saves.save(); } };
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
    document.getElementById('respawn').addEventListener('click', () => this.respawn());
  }

  lock() { if (this.noLock) { this.locked = !this.ui.open; return; } try { const r = this.renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }

  setPaused(p) {
    this.paused = p;
    document.getElementById('pause').classList.toggle('show', p);
    if (p) this.input.keys = {};
  }

  toggleInventory(force) {
    const open = force ?? !this.ui.open;
    if (!open) this.openStorage = null;
    this.ui.toggleInventory(open);
    this.input.keys = {};
    this.input.mouseDown = false; if (this.touch) this.touch.hold.attack = false;
    if (open) { if (this.noLock) this.locked = false; else document.exitPointerLock?.(); }
    else this.lock();
  }

  selectHot(i) {
    this.hotIndex = i;
    const s = this.inv.slots[i];
    if (s && ITEMS[s.id].food) { this.useItem(i); }
    this.ui.refresh();
  }

  activeItem() { return this.inv.slots[this.hotIndex]; }

  useItem(i) {
    const s = this.inv.slots[i];
    if (!s) return;
    const def = ITEMS[s.id];
    const p = this.player;
    if (def.armor) { this.wearArmor(i); return; }
    if (def.food) {
      p.food = Math.min(100, p.food + def.food);
      if (def.water) p.water = Math.min(100, p.water + def.water);
      if (def.heal) p.hp = Math.min(p.maxHp, p.hp + def.heal);
      if (def.sick) { p.hp -= def.sick * 0.3; }
      this.inv.remove(s.id, 1);
      this.audio.eat();
      this.ui.notify(`Ate ${def.name}`);
    }
  }

  craft(r) {
    if (!this.inv.has(r.cost)) return;
    if (r.station && !this.stationNear(r.station)) { this.ui.notify(`Craft this next to a ${ITEMS[r.station].name}`, 'warn'); return; }
    if (['metalpick', 'metalhatchet', 'sword', 'metalarmor'].includes(r.id)) this.stats.metalCrafted++;
    this.inv.pay(r.cost);
    const left = this.inv.add(r.id, r.yield || 1);
    if (left) this.ui.notify('Inventory full!', 'warn');
    this.stats.crafted++;
    this.saves.markDirty();
    this.audio.craft();
    this.ui.notify(`Crafted ${ITEMS[r.id].name}${r.yield ? ` ×${r.yield}` : ''}`, 'craft');
    this.player.addXP(4, this.xpHooks);
  }

  give(id, qty, silent) {
    if (qty <= 0) return;
    const left = this.inv.add(id, qty);
    if (id in this.stats) this.stats[id] += qty - left;
    this.saves.markDirty();
    if (!silent) this.ui.notify(`+${qty - left} ${ITEMS[id].name}`, 'loot');
    if (left > 0) this.ui.notify('Inventory full!', 'warn');
  }

  // ------------------------------------------------ Look target
  lookTarget() {
    const p = this.player;
    const origin = p.mount ? this.camera.position.clone() : p.eye;
    const dir = p.mount ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion) : p.lookDir();
    const extra = p.mount ? origin.distanceTo(p.mount.center) : 0;
    const c = this.creatures.pick(origin, dir, 40 + extra);
    const n = this.world.pickNode(origin, dir, 6 + extra);
    const fire = p.mount ? null : this.building.usableNear(p.pos);
    return { origin, dir, c, n, fire };
  }

  interact() {
    const p = this.player;
    if (!p.alive) return;
    if (p.mount) { this.dismount(); return; }
    const { c, n, fire } = this.lookTarget();
    if (c && c.dist < 4 + c.creature.hitR) {
      const cr = c.creature;
      if (!cr.alive) { this.harvestCarcass(cr, 0.6); return; }
      if (cr.ko && !cr.tamed) { this.feed(cr); return; }
      if (cr.tamed) {
        if (cr.def.rideable) {
          if (!cr.saddled) {
            if (this.inv.count('saddle') > 0) { this.inv.remove('saddle', 1); cr.saddled = true; this.ui.notify(`Saddled ${cr.name}`); }
            else { this.ui.notify(`${cr.name} needs a Rough Saddle to ride`, 'warn'); return; }
          }
          this.mount(cr);
        } else this.toggleFollow(cr);
        return;
      }
    }
    if (n && n.dist < 4 && n.node.kind === 'bush') { this.harvestNode(n.node, 1.0, true); return; }
    if (fire) { this.useProp(fire); return; }
    if (this.canDrink()) {
      p.water = Math.min(100, p.water + 25);
      this.audio.splash();
      this.ui.notify('You drink fresh water');
    }
  }

  useProp(piece) {
    const kind = KIND[piece.type];
    if (kind === 'fire' || kind === 'forge') {
      if (!piece.lit && kind === 'forge' && this.inv.count('wood') === 0) { this.ui.notify('The forge needs Wood as fuel', 'warn'); return; }
      piece.lit = !piece.lit;
      this.audio.noiseHit({ freq: 3000, q: 0.5, dur: 0.4, vol: 0.2, type: 'highpass' });
      if (kind === 'fire') this.ui.notify(piece.lit ? 'Campfire lit — stand nearby to cook Raw Meat' : 'Campfire extinguished');
      else this.ui.notify(piece.lit ? 'Forge lit — stand nearby with Metal Ore and Wood to smelt ingots' : 'Forge put out');
      this.saves.markDirty();
    } else if (kind === 'storage') {
      this.openStorage = piece;
      this.toggleInventory(true);
    } else if (kind === 'bed') {
      this.bed = piece;
      this.saves.markDirty();
      if (this.env.daylight < 0.3) this.sleep();
      else this.ui.notify('Respawn point set. Come back at night to sleep until morning.');
    }
  }

  sleep() {
    const fade = document.getElementById('sleep-fade');
    fade.classList.add('show');
    this.input.keys = {};
    setTimeout(() => {
      if (this.env.time > 0.27) this.env.day++;
      this.env.time = 0.27;
      const p = this.player;
      p.hp = p.maxHp; p.stam = p.maxStam;
      p.food = Math.max(0, p.food - 18); p.water = Math.max(0, p.water - 22);
      this.ui.banner(`DAY ${this.env.day}`, 'You wake rested at dawn');
      this.saves.markDirty();
    }, 900);
    setTimeout(() => fade.classList.remove('show'), 1800);
  }

  // Equip armor from an inventory slot (swaps with whatever is worn).
  wearArmor(i) {
    const s = this.inv.slots[i];
    const prev = this.player.armor;
    this.inv.slots[i] = prev ? { id: prev.id, qty: 1, dur: prev.dur } : null;
    this.player.armor = { id: s.id, dur: s.dur ?? ITEMS[s.id].durability };
    this.ui.notify(`Wearing ${ITEMS[s.id].name}`, 'craft');
    this.audio.noiseHit({ freq: 1200, q: 1, dur: 0.2, vol: 0.2 });
    this.saves.markDirty();
    this.ui.refresh();
  }

  unwearArmor() {
    const a = this.player.armor;
    if (!a) return;
    if (this.inv.freeSlot() < 0) { this.ui.notify('Inventory full!', 'warn'); return; }
    this.inv.slots[this.inv.freeSlot()] = { id: a.id, qty: 1, dur: a.dur };
    this.player.armor = null;
    this.ui.refresh();
  }

  storeMove(fromInv, i) {
    const box = this.openStorage;
    if (!box) return;
    const src = fromInv ? this.inv.slots : box.items, dst = fromInv ? box.items : this.inv.slots;
    const s = src[i];
    if (!s) return;
    const def = ITEMS[s.id];
    if (!def.tool && !def.armor) {
      for (const d of dst) { if (d && d.id === s.id && d.qty < def.stack) { const n = Math.min(def.stack - d.qty, s.qty); d.qty += n; s.qty -= n; } if (s.qty <= 0) break; }
    }
    if (s.qty > 0) { const j = dst.findIndex((x) => !x); if (j < 0) { this.ui.notify(fromInv ? 'Storage box is full' : 'Inventory full!', 'warn'); this.ui.refresh(); return; } dst[j] = s; }
    src[i] = null;
    this.saves.markDirty();
    this.ui.refresh();
  }

  stoneCount(kind) { return this.building.pieces.filter((p) => p.type.startsWith('s') && p.type !== 'storage' && (KIND[p.type] === kind || (kind === 'wall' && KIND[p.type] === 'door'))).length; }

  stationNear(station) {
    return this.building.pieces.some((p) => p.type === station && p.pos.distanceTo(this.player.pos) < 9);
  }

  canDrink() {
    const p = this.player;
    if (p.pos.y < WATER_LEVEL + 0.3) return true;
    const d = p.lookDir();
    const e = p.eye;
    if (d.y < -0.2) { const t = (WATER_LEVEL - e.y) / d.y; if (t > 0 && t < 4.5) { const x = e.x + d.x * t, z = e.z + d.z * t; return heightAt(x, z) < WATER_LEVEL; } }
    return false;
  }

  toggleFollow(cr) {
    if (!cr) { const { c } = this.lookTarget(); cr = c && c.creature; }
    if (!cr || !cr.tamed) return;
    cr.follow = !cr.follow;
    this.ui.notify(`${cr.name}: ${cr.follow ? 'Following' : 'Staying'}`);
  }

  feed(cr) {
    if (this.feedCd > 0) return;
    const def = cr.def;
    const torporLow = cr.torpor / cr.maxTorpor < 0.35;
    if (torporLow && this.inv.count('sleepberry') > 0) {
      this.inv.remove('sleepberry', 1);
      cr.torpor = Math.min(cr.maxTorpor, cr.torpor + cr.maxTorpor * 0.12);
      this.ui.notify(`Fed Dozeberries to keep ${def.name} asleep`);
      this.feedCd = 0.35; this.audio.eat(); return;
    }
    let food = def.tameFood;
    let mult = 1;
    if (food === 'meat' && this.inv.count('meat') === 0 && this.inv.count('cooked') > 0) { food = 'cooked'; mult = 0.7; }
    if (this.inv.count(food) === 0) { this.ui.notify(`${def.name} needs ${ITEMS[def.tameFood].name} to tame`, 'warn'); return; }
    this.inv.remove(food, 1);
    cr.tame = Math.min(100, cr.tame + (100 / cr.tameCost()) * mult);
    this.feedCd = 0.35;
    this.audio.eat();
    if (cr.tame >= 100) this.completeTame(cr);
  }

  completeTame(cr) {
    this.saves.markDirty();
    cr.tamed = true;
    cr.state = 'tamed';
    cr.lieT = 1;
    cr.torpor = 0;
    cr.hp = cr.maxHp;
    cr.follow = true;
    cr.name = pick(TAME_NAMES);
    this.stats.tamed++;
    this.audio.tamed();
    this.ui.banner(`${cr.def.name} TAMED!`, `Say hello to ${cr.name} (Lv ${cr.level}). [F] Follow / Stay${cr.def.rideable ? ' · [E] Ride with a saddle' : ''}`);
    this.player.addXP(30 + cr.level * 3, this.xpHooks);
  }

  mount(cr) {
    const p = this.player;
    p.mount = cr;
    cr.riddenBy = p;
    cr.state = 'ridden';
    p.yaw = cr.yaw + Math.PI;
    p.pitch = -0.25;
    this.stats.rode++;
    this.ui.notify(cr.def.flyer ? `Riding ${cr.name} — [Space] take off, look where you want to fly, [W] forward, [Shift] boost` : `Riding ${cr.name} — [LMB] attack · [Shift] sprint · [E] dismount · [V] zoom`);
    this.playRoar(cr);
  }

  dismount() {
    const p = this.player;
    const cr = p.mount;
    if (!cr) return;
    cr.riddenBy = null;
    cr.state = cr.alive ? 'tamed' : 'dead';
    p.mount = null;
    const side = new THREE.Vector3(Math.cos(cr.yaw), 0, -Math.sin(cr.yaw)).multiplyScalar(cr.radius + 1.2);
    p.pos.copy(cr.pos).add(side);
    const g = heightAt(p.pos.x, p.pos.z);
    p.pos.y = cr.flying ? Math.max(cr.pos.y, g) : g + 0.2;
    p.vel.set(0, 0, 0);
  }

  // ------------------------------------------------ Combat & gathering
  primary(dt) {
    const p = this.player;
    this.attackCd -= dt;
    if (!this.input.mouseDown || this.attackCd > 0 || !p.alive) return;
    const item = this.activeItem();
    const def = item ? ITEMS[item.id] : null;

    if (p.mount) { this.mountAttack(); return; }

    // placement mode
    if (def && def.place) {
      const s = this.placement;
      if (s && s.ok) {
        this.building.place(def.place, s.pos, s.rot);
        this.saves.markDirty();
        this.inv.remove(item.id, 1);
        this.audio.build();
        if (KIND[def.place] === 'floor') this.stats.floors++;
        if (KIND[def.place] === 'wall' || KIND[def.place] === 'door') this.stats.walls++;
        if (def.place === 'bed') { this.stats.beds++; this.bed = this.building.pieces[this.building.pieces.length - 1]; this.ui.notify('Respawn point set'); }
        if (def.place === 'campfire') this.stats.placedFire++;
        this.player.addXP(3, this.xpHooks);
      } else this.ui.notify('Cannot place here', 'warn');
      this.attackCd = 0.35;
      this.input.mouseDown = false; if (this.touch) this.touch.hold.attack = false;
      return;
    }

    if (def && def.ranged) {
      if (this.inv.count('arrow') <= 0) { this.ui.notify('No Tranq Arrows', 'warn'); this.attackCd = 0.5; this.input.mouseDown = false; if (this.touch) this.touch.hold.attack = false; return; }
      this.inv.remove('arrow', 1);
      this.fireArrow();
      p.swing = 0.6;
      this.attackCd = 0.9;
      this.wear(item, 1);
      return;
    }

    if (p.stam < 3) { this.attackCd = 0.3; return; }
    p.stam -= 3;
    p.swing = 1;
    this.attackCd = def && def.id === 'spear' ? 0.75 : 0.6;
    this.audio.whoosh();
    // resolve the hit slightly into the swing
    setTimeout(() => this.resolveMelee(item, def), 140);
  }

  resolveMelee(item, def) {
    const p = this.player;
    const { origin, dir, c, n } = this.lookTarget();
    const reach = def?.reach || 3.0;
    const cd = c ? c.dist : Infinity, nd = n ? n.dist : Infinity;
    if (c && cd <= reach && cd <= nd) {
      const cr = c.creature;
      if (!cr.alive) { this.harvestCarcass(cr, def?.gather?.bush ? 1 : 0.6); this.wear(item, 1); return; }
      if (cr.tamed) return;
      const dmg = def ? def.damage : 5;
      const torpor = def ? (def.torpor || 0) : 4;
      this.creatures.damage(cr, dmg * (0.9 + Math.random() * 0.2), torpor, 'player');
      this.audio.flesh();
      this.hitMarker();
      this.damageNumber(cr.center, Math.round(dmg));
      this.wear(item, 1);
      return;
    }
    if (n && nd <= reach + 0.5) {
      const node = n.node;
      const power = def ? def.gather[node.kind] : (node.kind === 'bush' ? 1 : 0.55);
      this.harvestNode(node, power);
      this.wear(item, 1);
    }
  }

  harvestNode(node, power, byHand) {
    const yields = World.yieldsFor(node.type);
    const tool = this.activeItem()?.id;
    for (const [id, base] of yields) {
      let mult = power;
      if (id === 'flint') mult = tool === 'pick' || tool === 'metalpick' ? 1.6 : tool === 'hatchet' ? 0.15 : 0.25;
      if (id === 'ore') mult = tool === 'metalpick' ? 2.4 : tool === 'pick' ? 1.1 : 0.12;
      if (id === 'stone' && (tool === 'pick' || tool === 'metalpick')) mult *= 0.8;
      if (id === 'wood' && tool === 'hatchet') mult *= 1.1;
      if (id === 'fiber' && node.kind === 'tree') mult = byHand ? 0 : 0.6;
      const q = base * mult * 0.5;
      const amt = Math.floor(q) + (Math.random() < q % 1 ? 1 : 0);
      this.give(id, amt);
    }
    const destroyed = this.world.harvest(node, power * 10);
    if (node.kind === 'tree') this.audio.chop(); else if (node.kind === 'rock') this.audio.mine(); else this.audio.rustle();
    if (destroyed && node.kind === 'tree') this.audio.tone({ f0: 90, f1: 40, dur: 0.6, vol: 0.4, type: 'triangle' });
    this.player.addXP(destroyed ? 3 : 0.4, this.xpHooks);
  }

  harvestCarcass(cr, power) {
    const d = cr.def.drops;
    const tool = this.activeItem()?.id;
    for (const [id, base] of Object.entries(d)) {
      let mult = power;
      if (id === 'hide' && tool === 'hatchet') mult *= 0.6;
      if (id === 'meat' && tool === 'hatchet') mult *= 1.3;
      const q = (base / 3) * mult;
      const amt = Math.floor(q) + (Math.random() < q % 1 ? 1 : 0);
      this.give(id, amt);
    }
    cr.carcass -= 1;
    cr.hitFlash = 0.1;
    this.audio.flesh();
  }

  wear(item, n) {
    if (!item || item.dur === undefined) return;
    item.dur -= n;
    if (item.dur <= 0) {
      const i = this.inv.slots.indexOf(item);
      if (i >= 0) this.inv.slots[i] = null;
      this.ui.notify(`Your ${ITEMS[item.id].name} broke!`, 'warn');
      this.audio.tone({ f0: 400, f1: 100, dur: 0.3, vol: 0.3, type: 'square' });
    }
    this.ui.refresh();
  }

  mountAttack() {
    const p = this.player, m = p.mount;
    this.attackCd = m.species === 'talonrunner' ? 0.7 : 1.2;
    m.attackAnim = 1;
    const fwd = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    const reach = m.def.reach * m.scale + 1.5;
    let hit = false;
    for (const o of this.creatures.list) {
      if (o === m || o.tamed || !o.alive) continue;
      if (Math.abs(o.center.y - m.center.y) > reach + 2) continue;
      const to = new THREE.Vector3().subVectors(o.pos, m.pos).setY(0);
      const d = to.length() - o.radius;
      if (d < reach && to.normalize().dot(fwd) > 0.3) {
        if (o.ko) continue;
        this.creatures.damage(o, m.dmg, 0, m);
        this.damageNumber(o.center, Math.round(m.dmg));
        hit = true;
      }
    }
    // harvesting with a mount
    const nodes = this.world.nodesNear(m.pos.x, m.pos.z, reach + 3);
    for (const node of nodes) {
      if (!node.alive) continue;
      const to = new THREE.Vector3(node.x - m.pos.x, 0, node.z - m.pos.z);
      if (to.length() < reach + 1 && to.normalize().dot(fwd) > 0.4) { this.harvestNode(node, m.species === 'ironhide' && node.kind === 'rock' ? 3.2 : m.species === 'trikeros' && node.kind !== 'rock' ? 2.2 : 1.2); break; }
    }
    // carcasses
    for (const o of this.creatures.list) {
      if (o.alive) continue;
      const to = new THREE.Vector3().subVectors(o.center, m.pos).setY(0);
      if (to.length() < reach + o.radius && to.normalize().dot(fwd) > 0.3) { this.harvestCarcass(o, 1.5); break; }
    }
    if (hit) { this.audio.flesh(); this.hitMarker(); }
    this.playRoar(m, true);
  }

  fireArrow() {
    const p = this.player;
    const dir = p.lookDir();
    const mesh = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    mesh.castShadow = true;
    const pos = p.eye.addScaledVector(dir, 0.6);
    pos.y -= 0.05;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.arrows.push({ mesh, pos, vel: dir.clone().multiplyScalar(62), life: 12, stuck: false });
    this.audio.bowShot();
  }

  updateArrows(dt) {
    const seg = new THREE.Vector3();
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      if (a.life <= 0) { this.scene.remove(a.mesh); this.arrows.splice(i, 1); continue; }
      if (a.stuck) continue;
      a.vel.y -= 9.8 * dt;
      seg.copy(a.vel).multiplyScalar(dt);
      const len = seg.length();
      const dir = seg.clone().normalize();
      const hit = this.creatures.pick(a.pos, dir, len, false);
      if (hit && !hit.creature.tamed) {
        const cr = hit.creature;
        this.creatures.damage(cr, 4 + Math.random() * 2, 48 * (1 + this.player.level * 0.02), 'player');
        this.hitMarker();
        this.damageNumber(cr.center, 'zZ');
        this.audio.flesh();
        this.scene.remove(a.mesh); this.arrows.splice(i, 1);
        continue;
      }
      a.pos.add(seg);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.clone().add(a.vel));
      if (a.pos.y < heightAt(a.pos.x, a.pos.z)) { a.stuck = true; a.life = 6; }
      else if (a.pos.y < WATER_LEVEL - 0.2) { a.life = 0; }
    }
  }

  hitMarker() {
    const h = document.getElementById('crosshair');
    h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit');
  }

  damageNumber(pos, text) {
    const el = document.createElement('div');
    el.className = 'dmg';
    el.textContent = text;
    document.getElementById('hud').appendChild(el);
    this.damageNums.push({ el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.5, (Math.random() - 0.5))), t: 0 });
  }

  updateDamageNums(dt) {
    const v = new THREE.Vector3();
    for (let i = this.damageNums.length - 1; i >= 0; i--) {
      const d = this.damageNums[i];
      d.t += dt; d.pos.y += dt * 1.5;
      v.copy(d.pos).project(this.camera);
      if (d.t > 0.9 || v.z > 1) { d.el.remove(); this.damageNums.splice(i, 1); continue; }
      d.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * window.innerWidth}px, ${(-v.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%,-50%) scale(${1.2 - d.t * 0.4})`;
      d.el.style.opacity = 1 - d.t / 0.9;
    }
  }

  hurtPlayer(dmg, c) {
    const p = this.player;
    if (p.mount) { this.creatures.damage(p.mount, dmg, 0, c); return; }
    if (p.armor) {
      dmg *= 1 - ITEMS[p.armor.id].armor;
      p.armor.dur -= 1;
      if (p.armor.dur <= 0) { this.ui.notify(`Your ${ITEMS[p.armor.id].name} broke!`, 'warn'); p.armor = null; }
    }
    p.damage(dmg);
    this.audio.hurt();
    p.yaw += (Math.random() - 0.5) * 0.05;
    // knockback
    const away = new THREE.Vector3().subVectors(p.pos, c.pos).setY(0).normalize().multiplyScalar(4);
    p.vel.add(away); p.vel.y += 2;
    if (!p.alive) this.die(c);
  }

  die(c) {
    this.dismount();
    document.getElementById('death').classList.add('show');
    document.getElementById('death-msg').textContent = c ? `Killed by a Lv ${c.level} ${c.def.name}` : 'You perished';
    document.exitPointerLock?.();
    for (const o of this.creatures.list) if (o.target === 'player') { o.state = 'wander'; o.target = null; }
  }

  respawn() {
    const p = this.player;
    p.alive = true; p.hp = p.maxHp; p.stam = p.maxStam; p.food = Math.max(p.food, 60); p.water = Math.max(p.water, 60);
    if (this.bed && this.building.pieces.includes(this.bed)) {
      p.pos.copy(this.bed.pos).add(new THREE.Vector3(1.2, 0.2, 0));
      this.ui.notify('You wake up at your Sleeping Bag');
    } else p.pos.copy(this.spawnPoint);
    p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = 0;
    document.getElementById('death').classList.remove('show');
    this.lock();
  }

  playRoar(c, quiet) {
    const d = c.pos.distanceTo(this.player.pos);
    const v = new THREE.Vector3().subVectors(c.pos, this.camera.position).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const pan = clamp(v.dot(right), -1, 1);
    const size = ({ pudgewing: 0.4, talonrunner: 0.8, trikeros: 2, thunderneck: 5, gorgonax: 4, ironhide: 2.2, spinesail: 3.5, galewing: 0.7, thunderwing: 2.2, crestcaller: 1.4, dashbeak: 0.3, domehead: 1.1 }[c.species] || 1) * c.scale;
    this.audio.roar(size, quiet ? d * 1.5 : d, pan, ['pudgewing', 'dashbeak', 'galewing'].includes(c.species) || (c.species === 'talonrunner' || c.species === 'crestcaller') && quiet ? 'chirp' : 'roar');
  }

  // ------------------------------------------------ Riding
  updateFlight(dt) {
    const p = this.player, m = p.mount, k = this.input.keys;
    const joy = this.input.joy || { x: 0, y: 0 };
    const fwd = clamp((k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) + joy.y, -1, 1);
    const str = clamp((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + joy.x, -1, 1);
    const up = k.Space ? 1 : 0, down = k.KeyC || k.ControlLeft ? 1 : 0;
    if (!m.flying) {
      m.flying = true; m.vy = 9; m.pos.y += 0.5;
      this.audio.noiseHit({ freq: 300, q: 0.6, dur: 0.5, vol: 0.4, type: 'lowpass' });
    }
    const sprint = k.ShiftLeft || k.ShiftRight;
    const mag = Math.min(1, Math.hypot(fwd, str));
    const maxSp = m.def.fly * (sprint ? 1.6 : 1);
    const prevYaw = m.yaw;
    if (mag > 0.08) {
      const mx = -Math.sin(p.yaw) * fwd + Math.cos(p.yaw) * str;
      const mz = -Math.cos(p.yaw) * fwd - Math.sin(p.yaw) * str;
      m.yaw = angleLerp(m.yaw, Math.atan2(mx, mz), Math.min(1, dt * 2.4));
    }
    m.speed = lerp(m.speed, mag > 0.08 ? maxSp * mag : 0, Math.min(1, dt * 1.5));
    // fly where you look: camera pitch steers climb and dive while moving forward
    let vyT = (fwd > 0.2 ? Math.sin(p.pitch + 0.3) * m.speed * 0.9 : 0) + (up - down) * 11;
    if (mag <= 0.08 && !up && !down) vyT = Math.sin(this.shared.uTime.value * 2) * 0.5;
    m.vy = lerp(m.vy || 0, vyT, Math.min(1, dt * 3));
    m.pos.x = clamp(m.pos.x + Math.sin(m.yaw) * m.speed * dt, -HALF * 1.25, HALF * 1.25);
    m.pos.z = clamp(m.pos.z + Math.cos(m.yaw) * m.speed * dt, -HALF * 1.25, HALF * 1.25);
    m.pos.y = Math.min(m.pos.y + m.vy * dt, 190);
    const land = heightAt(m.pos.x, m.pos.z);
    const ground = Math.max(land, WATER_LEVEL + 0.6);
    if (m.pos.y <= ground) {
      m.pos.y = ground;
      // touch down on dry land when descending slowly
      if (land > WATER_LEVEL + 0.3 && vyT <= 0.6 && m.speed < m.def.fly * 0.8) { m.flying = false; m.vy = 0; }
      else m.vy = Math.max(m.vy, 0);
    }
    m.flyPitch = -Math.atan2(m.vy, Math.max(4, m.speed)) * 0.8;
    const turn = ((m.yaw - prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    m.bank = lerp(m.bank || 0, clamp(-turn / Math.max(dt, 1e-3) * 0.35, -0.7, 0.7), Math.min(1, dt * 3));
    p.pos.set(m.pos.x, m.pos.y + m.model.hipH * m.scale + 0.6, m.pos.z);
    m.lieT = 0;
    this.creatures.animate(m, dt);
  }

  updateMount(dt) {
    const p = this.player, m = p.mount;
    if (!m) return;
    if (!m.alive) { this.dismount(); return; }
    if (m.def.flyer && (m.flying || this.input.keys.Space)) { this.updateFlight(dt); return; }
    const k = this.input.keys;
    const joy = this.input.joy || { x: 0, y: 0 };
    const fwd = clamp((k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) + joy.y, -1, 1);
    const str = clamp((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + joy.x, -1, 1);
    const sprint = k.ShiftLeft || k.ShiftRight;
    let target = m.def.walk * 1.6;
    if (sprint) target = m.def.run * 1.15;
    if (Math.hypot(fwd, str) > 0.08) {
      const mx = -Math.sin(p.yaw) * fwd + Math.cos(p.yaw) * str;
      const mz = -Math.cos(p.yaw) * fwd - Math.sin(p.yaw) * str;
      const desired = Math.atan2(mx, mz);
      m.yaw = angleLerp(m.yaw, desired, Math.min(1, dt * (m.radius > 2 ? 2.5 : 6)));
      m.speed = lerp(m.speed, target, Math.min(1, dt * 3));
    } else m.speed = lerp(m.speed, 0, Math.min(1, dt * 4));
    const nx = m.pos.x + Math.sin(m.yaw) * m.speed * dt, nz = m.pos.z + Math.cos(m.yaw) * m.speed * dt;
    const nh = heightAt(nx, nz);
    if (nh > -1.0 && Math.abs(nx) < HALF * 0.97 && Math.abs(nz) < HALF * 0.97) { m.pos.x = nx; m.pos.z = nz; }
    else m.speed = 0;
    this.world.collide(m.pos, m.radius * 0.6);
    m.pos.y = Math.max(heightAt(m.pos.x, m.pos.z), WATER_LEVEL - 1.0);
    p.pos.set(m.pos.x, m.pos.y + m.model.hipH * m.scale + 0.6, m.pos.z);
    m.lieT = 0;
    this.creatures.animate(m, dt);
  }

  // ------------------------------------------------ Frame
  start() {
    this.started = true;
    this.audio.start();
    this.lock();
    this.clock.start();
    this.ui.banner('ISLE OF THE PRIMAL', 'Survive. Gather. Build. Tame.');
    this.loop();
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    const p = this.player;
    const running = this.started && !this.paused;
    if (this.touch) this.touch.apply();
    if (running) {
      this.shared.uTime.value += dt;
      this.feedCd -= dt;
      p.update(dt, this.input, this.world, this.building);
      this.input.mx = 0; this.input.my = 0;
      this.updateMount(dt);
      if (!this.ui.open) this.primary(dt);
      p.survival(dt);
      if (!p.alive && !document.getElementById('death').classList.contains('show')) this.die(null);
      this.env.update(dt, p.pos);
      this.world.update(dt);
      this.creatures.update(dt, p, this.shared.uTime.value);
      this.building.update(dt, this.shared.uTime.value);
      this.updateArrows(dt);
      this.cooking(dt);
      this.saves.tick(dt);
      this.map.update(dt);
    } else if (!this.started) {
      // title-screen flyover
      this.shared.uTime.value += dt;
      this.env.update(dt * 0.3, p.pos);
      this.creatures.update(dt, { pos: new THREE.Vector3(9999, 0, 9999), alive: false, crouch: false, yaw: 0 }, 0);
      const t = this.shared.uTime.value * 0.03;
      this.camera.position.set(Math.cos(t) * 260, 75, Math.sin(t) * 260);
      this.camera.lookAt(-40, 20, -120);
      return;
    }
    p.updateCamera(dt, this.camera);

    // equip / placement ghost
    const item = this.activeItem();
    const def = item ? ITEMS[item.id] : null;
    p.equip(def && def.tool ? item.id : null);
    if (def && def.place && !p.mount && running) {
      this.placement = this.building.updateGhost(def.place, p.eye, p.lookDir());
    } else { this.building.setGhost(null); this.placement = null; }

    this.updateHUD(dt);
    this.updateDamageNums(dt);
    this.audio.ambience(dt, { shore: Math.max(0, heightAt(p.pos.x, p.pos.z)) * 6, night: 1 - this.env.daylight, height: p.pos.y, underwater: p.underwater });
  }

  cooking(dt) {
    // smelting at a lit forge: 2 ore + 1 wood -> 1 ingot
    const forge = this.building.fires.find((f) => f.type === 'forge' && f.lit && f.pos.distanceTo(this.player.pos) < 8);
    if (forge) {
      this.smeltT = (this.smeltT || 0) + dt;
      if (this.smeltT > 2.5) {
        this.smeltT = 0;
        if (this.inv.count('wood') < 1) { forge.lit = false; this.ui.notify('The forge ran out of Wood', 'warn'); }
        else if (this.inv.count('ore') >= 2) {
          this.inv.remove('ore', 2); this.inv.remove('wood', 1); this.inv.add('ingot', 1);
          this.stats.ingot++; this.saves.markDirty();
          this.ui.notify('Smelted 1 Metal Ingot', 'craft');
          this.audio.mine();
        }
      }
    }
    const fire = this.building.fires.find((f) => f.type === 'campfire' && f.lit && f.pos.distanceTo(this.player.pos) < 6);
    if (!fire || this.inv.count('meat') === 0) { this.cookT = 0; return; }
    this.cookT = (this.cookT || 0) + dt;
    if (this.cookT > 3) {
      this.cookT = 0;
      this.inv.remove('meat', 1);
      this.inv.add('cooked', 1);
      this.stats.cooked++;
      this.ui.notify('Cooked 1 Meat', 'craft');
      this.audio.noiseHit({ freq: 4000, q: 0.5, dur: 0.6, vol: 0.12, type: 'highpass' });
    }
  }

  updateHUD(dt) {
    const p = this.player;
    this.ui.bars(p);
    this.ui.frame(this);
    // quests
    const q = this.quests[this.questIdx];
    if (q && q.done()) {
      this.questIdx++;
      this.saves.markDirty();
      this.audio.craft();
      this.player.addXP(15, this.xpHooks);
      this.ui.notify('Objective complete!', 'quest');
      if (this.questIdx >= this.quests.length) this.ui.banner('SLICE COMPLETE', 'You tamed and rode a beast of the island.');
    }
    this._qT = (this._qT || 0) - dt;
    if (this._qT <= 0) { this._qT = 0.25; this.ui.quest(this.quests[this.questIdx], this.questIdx, this.quests.length); }

    // look target + prompts
    const { c, n, fire } = this.lookTarget();
    let prompt = '';
    const item = this.activeItem();
    const def = item ? ITEMS[item.id] : null;
    let tgt = null;
    if (c && c.dist < 40) {
      tgt = c.creature;
      const cr = tgt;
      if (c.dist < 4 + cr.hitR && !p.mount) {
        if (!cr.alive) prompt = '<kbd>E</kbd> / <kbd>LMB</kbd> Harvest carcass';
        else if (cr.ko && !cr.tamed) prompt = `<kbd>E</kbd> Feed ${ITEMS[cr.def.tameFood].name} (${this.inv.count(cr.def.tameFood)})${cr.torpor / cr.maxTorpor < 0.35 ? ` · auto-feeds Dozeberries (${this.inv.count('sleepberry')})` : ''}`;
        else if (cr.tamed) prompt = cr.def.rideable ? `<kbd>E</kbd> Ride ${cr.name}${cr.saddled ? '' : ' (needs saddle)'} · <kbd>F</kbd> ${cr.follow ? 'Stay' : 'Follow'}` : `<kbd>E</kbd>/<kbd>F</kbd> ${cr.follow ? 'Stay' : 'Follow'}`;
      }
    }
    if (!prompt && !p.mount) {
      if (n && n.dist < 4 && n.node.kind === 'bush') prompt = `<kbd>E</kbd> Pick ${n.node.type === 'dozebush' ? 'Dozeberries' : 'Wildberries'}`;
      else if (n && n.dist < 3.5) prompt = `<kbd>LMB</kbd> ${n.node.kind === 'tree' ? 'Harvest Tree' : n.node.type === 'metal' ? 'Mine Metal Ore' + (this.activeItem()?.id?.includes('pick') ? '' : ' (use a pick)') : 'Harvest Rock'}`;
      else if (fire) {
        const k = KIND[fire.type];
        prompt = k === 'fire' ? `<kbd>E</kbd> ${fire.lit ? 'Extinguish' : 'Light'} Campfire`
          : k === 'forge' ? `<kbd>E</kbd> ${fire.lit ? 'Put out' : 'Light'} Forge · Ore ${this.inv.count('ore')} · Wood ${this.inv.count('wood')}`
          : k === 'storage' ? '<kbd>E</kbd> Open Storage Box'
          : `<kbd>E</kbd> ${this.env.daylight < 0.3 ? 'Sleep until morning' : 'Set respawn point'}`;
      }
      else if (this.canDrink()) prompt = '<kbd>E</kbd> Drink';
      if (def && def.place) prompt = `<kbd>LMB</kbd> Place ${def.name} · <kbd>R</kbd> Rotate`;
    }
    if (p.mount) {
      const m = p.mount;
      const alt = m.pos.y - Math.max(heightAt(m.pos.x, m.pos.z), 0);
      if (m.def.flyer && m.flying) prompt = `Flying <b>${m.name}</b> · ${Math.round(alt)} m up · look to steer · <kbd>Space</kbd>/<kbd>C</kbd> up/down · <kbd>E</kbd> ${alt > 6 ? 'Jump off (you will fall!)' : 'Dismount'}`;
      else if (m.def.flyer) prompt = `Riding <b>${m.name}</b> · <kbd>Space</kbd> Take off · <kbd>E</kbd> Dismount`;
      else prompt = `Riding <b>${m.name}</b> · HP ${Math.ceil(m.hp)}/${m.maxHp} · <kbd>E</kbd> Dismount`;
    }
    this.ui.setPrompt(prompt);
    this.ui.setTarget(tgt);
  }
}

// ------------------------------------------------ Boot
const qualityBtns = document.querySelectorAll('[data-q]');
let quality = 'high';
try { quality = localStorage.getItem('iotp-quality') || (IS_TOUCH ? 'low' : 'high'); } catch (e) { /* ignore */ }
const qParam = new URLSearchParams(location.search).get('quality');
if (qParam === 'low' || qParam === 'high') quality = qParam;
qualityBtns.forEach((b) => {
  b.classList.toggle('sel', b.dataset.q === quality);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    quality = b.dataset.q;
    try { localStorage.setItem('iotp-quality', quality); } catch (er) { /* ignore */ }
    location.reload();
  });
});

const loading = document.getElementById('loading-text');
loading.textContent = 'Shaping the island…';
setTimeout(() => {
  const game = new Game(quality);
  window.game = game;
  game.loop();
  document.getElementById('title').classList.add('ready');
  loading.textContent = IS_TOUCH ? 'Tap to begin' : 'Click to begin';
  const playBtn = document.getElementById('play');
  const newBtn = document.getElementById('newgame');
  const info = document.getElementById('save-info');
  let armed = false;
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const showSave = () => {
    const d = game.saves.best();
    newBtn.hidden = !d;
    playBtn.textContent = d ? 'CONTINUE' : 'ENTER THE ISLAND';
    info.textContent = d ? `Day ${d.world.day} · Level ${d.player.level} · ${d.tames.length} tame${d.tames.length === 1 ? '' : 's'} · saved ${ago(d.savedAt)} to ${game.saves.where}` : '';
  };
  showSave();
  game.saves.onChange(showSave);
  const begin = (load) => {
    if (game.started) return;
    const d = load ? game.saves.best() : null;
    const loaded = d && applySave(game, d);
    document.getElementById('title').classList.add('hide');
    document.getElementById('hud').classList.add('show');
    game.started = true;
    game.audio.start();
    game.lock();
    if (IS_TOUCH) { try { const r = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); r?.catch?.(() => {}); } catch (e) { /* optional */ } }
    if (loaded) game.ui.banner(`DAY ${game.env.day}`, 'Welcome back, survivor');
    else game.ui.banner('ISLE OF THE PRIMAL', 'Survive · Gather · Build · Tame');
  };
  playBtn.addEventListener('click', () => begin(true));
  newBtn.addEventListener('click', async () => {
    if (!armed) { armed = true; newBtn.textContent = 'Tap again to erase your save'; newBtn.classList.add('warn'); return; }
    await game.saves.erase();
    begin(false);
  });
}, 50);
