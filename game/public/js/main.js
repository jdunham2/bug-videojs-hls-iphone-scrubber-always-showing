// Emberfall client entry: renderer, post-processing, zones, networking glue, cinematics, music, game loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from './state.js';
import { Input } from './input.js';
import { sfx } from './audio.js';
import { Net } from './net.js';
import { fx } from './fx.js';
import { ui } from './ui.js';
import { Lobby } from './lobby.js';
import { loadSettings, saveSettings, QUALITY, getToken, setToken } from './settings.js';
import { LocalPlayer, CameraRig, gearOf } from './player.js';
import { fxPlay, enemiesInRadius } from './skills.js';
import { Cinematic, introShots, bossShots, storyShots } from './cinematic.js';
import { Footsteps, decals, recoil, rumble, SPLAT } from './feel.js';
const footsteps = new Footsteps();
import { WeatherView } from './weather.js';
import { Wildlife } from './wildlife.js';
import { Townsfolk } from './townsfolk.js';
import { Fishing } from './fishing.js';
import { hourAt, weatherFx, nearLake } from '../shared/life.js';
const weather = new WeatherView(), fishing = new Fishing();
G.fishingUI = fishing;
let clockStart = performance.now() / 1000;
const weatherChip = document.createElement('div'); weatherChip.className = 'weatherChip'; weatherChip.style.cssText = 'right:16px;left:auto;top:338px;text-align:right'; document.getElementById('hud')?.appendChild(weatherChip);
function setWeather(kind, announce) {
  G.weather = kind || 'clear'; weather.set(G.weather);
  const W = weatherFx(G.weather);
  if (announce && G.weather !== 'clear') ui.toast(`${W.icon} ${W.name}`, '#bcd4ec', W.desc);
  else if (announce) ui.toast('☀ The weather clears', '#ffe6a0');
}
G.decals = decals;
import { entityRoot, EnemyView, AllyView, RemoteView, LootView, ProjView, StructView, HazardView, buildStructure, EMOTES } from './entities.js';
import { TownZone } from './zones/town.js';
import { DungeonZone } from './zones/dungeon.js';
import { DarkZone } from './zones/dark.js';
import { RegionZone } from './zones/region.js';
import { setupTouch } from './touch.js';
import { REGIONS, QUESTS, EVENTS, ACT1_END } from '../shared/regions.js';
import { STRUCTURES, TOWN } from '../shared/world.js';
import { RARITIES, GEMS, gemName, parseGem } from '../shared/items.js';
const RARITY_BASE = RARITIES.map((r) => r.color);
const RARITY_CB = ['#d0d0d0', '#f0e442', '#56b4e9', '#cc79a7', '#e69f00'];
import { CLASSES } from '../shared/classes.js';
import { SHRINES, LEVER_NAMES } from '../shared/dungeon.js';
import { RIFT_MODS, RIFT_TIME } from '../shared/rifts.js';

// ---------- renderer ----------
const settings = loadSettings();
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false; // the composer renders several passes; count the whole frame
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 900);
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.5, 0.85);
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass());

let dynScale = 1;
function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * QUALITY[settings.quality].pixel * (settings.dynres ? dynScale : 1));
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  fx.p.mat.uniforms.scale.value = (innerHeight * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
addEventListener('resize', resize);

// ---------- globals ----------
const input = new Input(canvas);
const net = new Net();
Object.assign(G, { renderer, camera, fx, audio: sfx, ui, net, input, party: new Map(), hazards: new Map(), hazardViews: new Map(), prof: null, lock: null, slowmo: 0, cinematic: false, laneThreat: [0, 0, 0], buildTarget: null, settings });
ui.init(settings);
const lobby = new Lobby();
const cine = new Cinematic(camera);

const town = new TownZone(renderer);
town.grassMax = town.grass.count;
let dark = null, dungeon = null;
const regions = {};
const camRig = new CameraRig(camera);
let player = null;
const killed = new Map();
let traveling = false, introPlayed = false;
let ghost = null, ghostKind = null;

function applySettings() {
  const Q = QUALITY[settings.quality];
  resize();
  const shadowWas = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = Q.shadows;
  for (const z of [town, dark, dungeon, regions.marsh, regions.peaks]) {
    if (!z) continue;
    const L = z.sun || z.moon;
    if (L && L.shadow.mapSize.x !== Q.shadowMap) { L.shadow.mapSize.set(Q.shadowMap, Q.shadowMap); L.shadow.map?.dispose(); L.shadow.map = null; }
    if (shadowWas !== Q.shadows) z.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
  }
  bloom.enabled = Q.bloom;
  town.grass.count = Math.floor(town.grassMax * Q.grass);
  sfx.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
  input.sens = settings.sens; input.invertY = settings.invertY; input.bindings = { ...settings.bindings };
  if (player) ui.buildSkillBar(player.cls);
  RARITIES.forEach((r, i) => (r.color = settings.cb ? RARITY_CB[i] : RARITY_BASE[i]));
  document.documentElement.style.setProperty('--ui-scale', settings.uiScale);
  const touchOn = settings.touch === 'on' || (settings.touch === 'auto' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window));
  if (touchOn && !touchUI) touchUI = setupTouch(input);
  touchUI?.show(touchOn && G.inGame); document.body.classList.toggle('touchmode', touchOn);
}
let touchUI = null;
applySettings();

function setActiveZone(zone) {
  zone.scene.add(fx.root, entityRoot, decals.root);
  weather.attach(zone.scene);
  if ((zone.type === 'region' || zone === town) && !zone.wildlife) zone.wildlife = new Wildlife(zone, zone.type === 'region' ? zone.key : 'town');
  if (zone === town && !town.folk) town.folk = new Townsfolk(town);
  if (zone !== town) town.folk?.setVisible(false);
  if (player) zone.scene.add(player.root);
  renderPass.scene = zone.scene;
  G.zone = zone;
  bloom.strength = zone.bloom.strength; bloom.radius = zone.bloom.radius; bloom.threshold = zone.bloom.threshold;
  renderer.toneMappingExposure = zone.exposure;
  ui.setMarks(zone);
}
setActiveZone(town);
ui.fade(false);

function clearEntities() {
  for (const m of [G.enemies, G.allies, G.loots, G.projectiles, G.structures, G.hazardViews]) { for (const v of m.values()) v.dispose(); m.clear(); }
  G.hazards.clear();
  for (const r of G.remotes.values()) r.dispose();
  G.remotes.clear(); killed.clear(); fx.clear(); decals.clear();
  player?.kit.clear();
  G.lock = null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let zoneQueue = Promise.resolve();

function musicFor() {
  if (!G.zone) return 'town';
  if (G.rift && !G.rift.done) return G.rift.guardian ? 'boss' : 'night';
  if (G.zone.type === 'region') { for (const e of G.enemies.values()) if (e.boss && !e.dead && player && e.pos.distanceTo(player.pos) < 40) return 'boss'; return G.event ? 'night' : G.zoneKey === 'marsh' ? 'dark' : 'town'; }
  for (const e of G.enemies.values()) if (e.boss && !e.dead && player && e.pos.distanceTo(player.pos) < 35 && (e.type !== 'ogre' || G.zone.type === 'town')) return 'boss';
  if (G.zone.type === 'town') return G.defense.phase === 'day' || G.defense.phase === 'dawn' ? 'town' : 'night';
  return G.zone.type;
}

async function switchZone(m) {
  const prevKey = G.zoneKey;
  if (cine.active) cine.stop();
  if (G.inGame && prevKey) { ui.fade(true); await sleep(380); }
  clearEntities();
  if (ghost) { ghost.parent?.remove(ghost); ghost = null; }
  G.buildMode = false;
  ui.closeAll();
  let zone, oldDungeon = null;
  if (m.type === 'town') zone = town;
  else if (m.type === 'dark') zone = dark ||= new DarkZone(renderer);
  else if (m.type === 'region') { zone = regions[m.zone] ||= new RegionZone(renderer, m.zone); applySettings(); }
  else if (m.type === 'rift') { if (dungeon) oldDungeon = dungeon; dungeon = new DungeonZone(renderer, m.seed, m.level, m.cleared, m.rift); dungeon.key = m.zone; zone = dungeon; applySettings(); }
  else {
    if (dungeon && dungeon.key !== m.zone) { oldDungeon = dungeon; dungeon = null; }
    if (!dungeon) { dungeon = new DungeonZone(renderer, m.seed, m.level, m.cleared, m.rift); dungeon.key = m.zone; applySettings(); }
    zone = dungeon;
  }
  G.zoneKey = m.zone;
  G.event = null;
  if (typeof m.clock === 'number') clockStart = performance.now() / 1000 - m.clock;
  setWeather(m.weather, false); fishing.stop(false, true);
  G.rift = m.rift ? { ...m.rift, t0: performance.now() / 1000 - m.rift.elapsed } : null;
  setActiveZone(zone);
  if (oldDungeon) oldDungeon.dispose();
  let sx = zone.spawn.x, sz = zone.spawn.z, face = { x: 0, z: -1 };
  if (m.type === 'town') {
    const from = prevKey.startsWith('dungeon') ? TOWN.dungeonPortal : prevKey === 'dark' ? TOWN.darkPortal : null;
    if (from) { const l = Math.hypot(from.x, from.z); face = { x: -from.x / l, z: -from.z / l }; sx = from.x + face.x * 11; sz = from.z + face.z * 11; }
    G.roomLevel = m.level;
    if (m.defense) applyDefense(m.defense, true);
    if (m.structs) applyStructs({ list: m.structs });
  }
  player.teleport(sx, sz, zone);
  player.ry = Math.atan2(face.x, face.z);
  camRig.yaw = Math.atan2(-face.x, -face.z);
  camRig.snap(player);
  const banners = { town: ['EMBERHOLD', G.defense.phase === 'day' ? 'The Last City' : 'The night is upon us'], dark: ['THE DARK WORLD', 'Where gold buys power'], dungeon: [`DEPTH ${m.level}`, zone.name || 'The Depths'], region: [REGIONS[m.zone]?.name.toUpperCase() || '', REGIONS[m.zone]?.sub || ''], rift: [`EMBER RIFT ${m.rift?.k}`, (m.rift?.mods || []).map((k) => RIFT_MODS[k].name).join(' · ')] };
  if (prevKey || !settings.intro) ui.zoneBanner(...banners[m.type]);
  if (prevKey) sfx.portal();
  if (m.type === 'rift') setTimeout(() => ui.toast('Slay enemies to fill the rift — then face its Guardian', '#c77dff', `Beat ${Math.round(RIFT_TIME / 60)} minutes to raise your keystone`), 1200);
  if (m.type === 'dungeon' && !m.cleared) setTimeout(() => ui.toast(`Pull the levers in the order shown on the gate, then slay ${zone.d.bossType === 'matriarch' ? 'the Ash Matriarch' : 'the Bone Tyrant'}`, '#ff9a7a', 'Clearing the dungeon raises the depth for the whole party'), 1500);
  traveling = false;
  ui.fade(false);
  if (!prevKey && settings.intro && !introPlayed) playIntro();
}

function playIntro() {
  introPlayed = true;
  const cp = Math.cos(camRig.pitch);
  camera.userData.rest = player.pos.clone().add(new THREE.Vector3(Math.sin(camRig.yaw) * cp, Math.sin(camRig.pitch), Math.cos(camRig.yaw) * cp).multiplyScalar(camRig.dist)).add(new THREE.Vector3(0, 1.7, 0));
  cine.play(introShots(player, camRig), { onEnd: () => ui.zoneBanner('EMBERHOLD', 'The Last City') });
}

// ---------- defense & structures ----------
function applyDefense(m, silent) {
  const prev = G.defense.phase;
  Object.assign(G.defense, m);
  if (m.structHp) for (const [id, hp] of m.structHp) { const v = G.structures.get(id); if (v) v.s.hp = hp; }
  if (silent || prev === m.phase || G.zone !== town) return;
  if (m.phase === 'build') { ui.bigBanner('NIGHTFALL', `The horde gathers — press ${input.bindings.build.replace('Key', '')} to build defenses`, 4500); sfx.bell(); town.ringBell(); }
  if (m.phase === 'dawn') {
    if (m.result === 'victory') { ui.bigBanner('DAWN BREAKS', 'Emberhold stands! Gold has been paid to the defenders.', 5000); sfx.victory(); }
    else { ui.bigBanner('THE HEART DIMS', 'Emberhold was overrun… but it endures.', 5000); sfx.boss(); }
  }
}
function applyStructs(m) {
  if (G.zone !== town) return;
  const ids = new Set(m.list.map((s) => s.id));
  for (const [id, v] of G.structures) if (!ids.has(id)) {
    const p = v.g.position.clone(); p.y += 1;
    fx.emit({ pos: p, count: 40, speed: 6, color: '#c8a070', color2: '#3a2a1a', size: 0.4, life: 1, up: 1, gravity: 10 });
    sfx.enemyDie(); v.dispose(); G.structures.delete(id);
  }
  for (const s of m.list) {
    const v = G.structures.get(s.id);
    if (v) v.setData(s);
    else {
      G.structures.set(s.id, new StructView(s, town));
      if (m.built === s.id) { fx.emit({ pos: new THREE.Vector3(s.x, town.groundHeight(s.x, s.z) + 0.5, s.z), count: 30, speed: 4, color: '#ffe0a0', color2: '#a07040', size: 0.3, life: 0.8, up: 1 }); sfx.build(); }
    }
  }
  if (m.repaired) { const v = G.structures.get(m.repaired); if (v) { fx.emit({ pos: v.g.position.clone().setY(v.g.position.y + 1), count: 30, speed: 2, color: '#8affb0', color2: '#20a050', size: 0.3, life: 0.8, up: 1 }); sfx.build(); } }
  const all = [...G.structures.values()];
  for (const v of all) v.relink(all);
}

// ---------- actions ----------
G.actions = {
  travel(to) { if (traveling) return; traveling = true; net.send({ t: 'zone', to }); setTimeout(() => (traveling = false), 4000); },
  startNight() { net.send({ t: 'startNight' }); },
  openShop() { ui.openPanel('shop'); },
  openTalents(atTrainer) { ui._atTrainer = !!atTrainer; ui.openPanel('talents'); },
  openStash() { ui.openPanel('stash'); },
  openSmith() { ui.openPanel('smith'); },
  openWardrobe() { ui.openPanel('wardrobe'); },
  openResearch() { ui.openPanel('research'); },
  openWaypoint() { ui.openPanel('waypoint'); },
  talk() { net.send({ t: 'talk' }); },
  challengeKing() { net.send({ t: 'challenge' }); },
  relic(i) { net.send({ t: 'relic', i }); },
  openRift() { ui.openPanel('riftPanel'); },
  openBoard() { ui.openPanel('board'); net.send({ t: 'leaderboard' }); },
  openChest(ch) { if (!ch.open) net.send({ t: 'chest', id: ch.id }); },
  applySettings, playIntro: () => { if (player) playIntro(); },
  respawn() {
    player.dead = false; player.hp = player.stats.maxHp; player.invuln = 2; player.deadAnim = 0;
    player.teleport(G.zone.spawn.x, G.zone.spawn.z, G.zone);
    camRig.snap(player);
    ui.showDeath(false);
    fx.emit({ pos: player.pos.clone().setY(player.pos.y + 1), count: 60, speed: 3, color: '#fff2c0', color2: '#ffaa30', size: 0.3, life: 1.2, up: 1 });
  },
};

// ---------- networking ----------
net.on('welcome', (m) => {
  G.myId = m.id; G.roomCode = m.room; G.roomLevel = m.level;
  setToken(m.token);
  ui.setRoom(m.room);
  lobby.dispose();
  ui.hideLobby();
  G.inGame = true;
  applySettings();
  setTimeout(() => ui.chat('★', net.offline ? 'Press H for help. Solo mode: your hero is saved in this browser.' : 'Press H for help. Share your party code to play with friends!'), 800);
});
net.on('profile', (m) => {
  const first = !G.prof;
  G.prof = m;
  if (first) { player = new LocalPlayer(m); G.player = player; ui.buildSkillBar(m.cls); }
  else player.setProfile(m, false);
  ui.setProfile(m);
});
net.on('levelUp', (m) => {
  if (!player) return;
  setTimeout(() => { player.setProfile(G.prof, true); fx.levelUp(player.pos.clone()); }, 50);
  sfx.levelUp();
  ui.bigBanner('LEVEL UP', `Level ${m.level} — you earned a talent point (${input.bindings.talents.replace('Key', '')})`);
});
net.on('enterZone', (m) => { zoneQueue = zoneQueue.then(() => switchZone(m)); });
net.on('weather', (m) => { if (m.zone === G.zoneKey) setWeather(m.kind, true); });
net.on('clock', (m) => { clockStart = performance.now() / 1000 - m.clock; });
net.on('fishBite', (m) => fishing.onBite(m));
net.on('fishCaught', (m) => fishing.caught(m));
net.on('fishLost', (m) => { if (m.text) ui.toast(m.text, '#ff9a7a'); });
net.on('players', (m) => {
  const seen = new Set();
  for (const p of m.list) {
    if (p.id === G.myId) continue;
    seen.add(p.id);
    G.party.set(p.id, p);
    const v = G.remotes.get(p.id);
    if (p.zone === G.zoneKey && !traveling) { if (v) v.apply(p); else G.remotes.set(p.id, new RemoteView(p)); }
    else if (v) { v.dispose(); G.remotes.delete(p.id); }
  }
  for (const id of G.party.keys()) if (!seen.has(id)) G.party.delete(id);
});
net.on('left', (m) => { G.party.delete(m.id); const v = G.remotes.get(m.id); if (v) { v.dispose(); G.remotes.delete(m.id); } });
net.on('ents', (m) => {
  if (m.zone !== G.zoneKey || !G.zone) return;
  const ids = new Set();
  for (const a of m.list) {
    ids.add(a[0]);
    const v = G.enemies.get(a[0]);
    if (v) { if (!v.dead) v.apply(a); }
    else if (!killed.has(a[0])) G.enemies.set(a[0], new EnemyView(a));
  }
  for (const [id, v] of G.enemies) if (!ids.has(id) && !v.dead) { v.dispose(); G.enemies.delete(id); }
  const aids = new Set();
  for (const a of m.allies || []) { aids.add(a[0]); const v = G.allies.get(a[0]); if (v) v.apply(a); else G.allies.set(a[0], new AllyView(a)); }
  for (const [id, v] of G.allies) if (!aids.has(id)) { v.dispose(); G.allies.delete(id); }
});
// ---- Act II: companion, Storm Herald, story cutscenes ----
const allyPos = (id) => G.allies.get(id)?.pos.clone();
net.on('allyDown', (m) => { const v = G.allies.get(m.id); ui.toast('Scout Ilsa is down!', '#ff9a7a', 'Stand next to her to revive'); if (v) fx.emit({ pos: v.pos.clone().setY(v.pos.y + 1), count: 30, speed: 3, color: '#ff8a6a', color2: '#400000', size: 0.3, life: 0.6 }); });
net.on('allyUp', (m) => { const p = allyPos(m.id); ui.toast(m.by ? `${m.by} revived Scout Ilsa` : 'Scout Ilsa is back on her feet', '#5eea8a'); if (p) { fx.emit({ pos: p.setY(p.y + 1), count: 50, speed: 3, color: '#c8ffd8', color2: '#20a050', size: 0.35, life: 1, up: 1 }); sfx.shrine(); } });
net.on('allyFx', (m) => {
  const p = allyPos(m.id) || new THREE.Vector3(m.x, G.zone.groundHeight(m.x, m.z), m.z);
  if (m.kind === 'mend') { fx.shockwave(p.clone().setY(p.y + 0.1), 10, '#5eea8a', 0.6); fx.emit({ pos: p.clone().setY(p.y + 1), count: 70, speed: 5, color: '#d8ffe4', color2: '#20c060', size: 0.35, life: 1.1, up: 1.5, radius: 3 }); sfx.shrine(); if (Math.random() < 0.5) ui.toast('Ilsa: "Mending Wind — hold the line!"', '#7affb0'); }
  else { fx.emit({ pos: p.clone().setY(p.y + 1.6), count: 24, speed: 6, color: '#e8fff0', color2: '#3a9a6a', size: 0.25, life: 0.4 }); sfx.arrow?.(); }
});
net.on('mend', (m) => { if (!player || player.dead) return; player.heal(m.amt); fx.text(player.pos.clone().setY(player.pos.y + 2.2), `+${m.amt}`, 'heal', 0.9); });
net.on('relic', (m) => { const n = [0, 1, 2].filter((i) => m.r & (1 << i)).length; ui.toast(`Storm Relic recovered (${n}/3)`, '#5ab8ff', 'The storm screams — its guardians close in!'); sfx.loot(4); G.shake = 0.4; if (player) fx.emit({ pos: player.pos.clone().setY(player.pos.y + 1.4), count: 80, speed: 6, color: '#e8f6ff', color2: '#2a7aff', size: 0.4, life: 0.9, up: 1 }); });
net.on('heraldCall', () => { ui.bigBanner('THE HERALD CALLS', 'The Storm Drake is bound to its will — slay the Drake to break the bond!', 4000); sfx.roar(); G.shake = 0.9; if (G.zone?.flash !== undefined) G.zone.flash = 1; });
net.on('heraldBond', () => { ui.bigBanner('THE BOND SHATTERS', 'The Herald drinks the Drake\'s storm — it can be harmed again!', 3500); sfx.gate(); G.shake = 1; if (G.zone?.flash !== undefined) G.zone.flash = 1; });
net.on('actComplete', () => {
  sfx.victory();
  const go = () => ui.bigBanner('ACT II COMPLETE', 'The Storm Crown is broken — Stormspire sees the stars again', 6000);
  if (G.zoneKey === 'peaks' && player) cine.play(storyShots('outro', G.zone, player), { onEnd: go }); else go();
});
const afterCine = [];
function act2Cutscene(kind, then) {
  if (G.zoneKey !== 'peaks' || !player) return then?.();
  player.invuln = 30;
  cine.play(storyShots(kind, G.zone, player), { onEnd: () => { player.invuln = 0.5; then?.(); while (afterCine.length) afterCine.shift()(); } });
}
net.on('eatk', (m) => G.enemies.get(m.id)?.attack());
net.on('ehit', (m) => {
  const e = G.enemies.get(m.id);
  if (!e) return;
  if (m.stun) e.stunFx = 1;
  if (m.blocked && m.by === G.myId) { fx.text(e.pos.clone().setY(e.pos.y + e.height), 'BLOCKED — FLANK IT!', 'xp', 0.8); fx.emit({ pos: e.pos.clone().setY(e.pos.y + 1.2), count: 10, speed: 4, color: '#ffffff', color2: '#ffd34d', size: 0.2, life: 0.3 }); }
  else if (m.shield && m.by === G.myId && Math.random() < 0.3) fx.text(e.pos.clone().setY(e.pos.y + e.height), 'SHIELDED', 'xp', 0.6);
  if (m.immune) { if (m.by === G.myId && Math.random() < 0.25) fx.text(e.pos.clone().setY(e.pos.y + e.height), 'IMMUNE — KILL THE DRAKE', 'xp', 0.7); return; }
  if (m.by === G.myId) return;
  e.hit(m.crit);
  const p = e.pos.clone(); p.y += e.height * 0.6;
  fx.hitSpark(p, m.crit);
  if (m.by) fx.text(p, String(m.dmg), m.crit ? 'crit' : '', 0.8);
});
net.on('edie', (m) => {
  killed.set(m.id, G.time);
  const e = G.enemies.get(m.id);
  if (m.quiet) { if (e) { e.dispose(); G.enemies.delete(m.id); } if (G.lock === e) G.lock = null; return; }
  const pos = e ? e.pos.clone() : new THREE.Vector3(m.x, G.zone.groundHeight(m.x, m.z), m.z);
  pos.y += 1;
  if (e) e.die();
  if (G.lock === e) G.lock = null;
  decals.add('splat', pos.x, pos.z, ENEMY_BOSS.has(m.type) ? 5 : 1.4 + Math.random() * 0.8, SPLAT[m.type] || (G.zone?.type === 'region' && G.zoneKey === 'peaks' ? '#c8c8d0' : '#4a4038'));
  fx.boneBurst(pos, m.type === 'wraith' ? '#b26bff' : m.type === 'imp' ? '#ff6a3a' : m.type === 'brute' ? '#8a9a6a' : m.type.includes('spider') || m.type === 'matriarch' ? '#5a2a20' : m.type === 'goblin' ? '#ffd34d' : '#e8e0cc');
  sfx.enemyDie();
  if (player) { player.addStyle(m.affix ? 18 : 10, 'kill'); }
  if (player && e && player.stats.flags.g_combust && e.hitByMe && G.time - e.hitByMe < 3) { for (const o of enemiesInRadius(e.pos, 3)) if (o !== e) player.dealDamage(o, player.stats.dmg * 0.6, { kb: 1 }, true); fxPlay('explode', { x: e.pos.x, z: e.pos.z, r: 3 }); }
  if (m.type === 'goblin') { ui.toast('Treasure Goblin slain!', '#ffd34d', 'It spilled its hoard'); fx.goldBurst(pos); fx.emit({ pos, count: 120, speed: 8, color: '#ffe066', color2: '#ffaa00', size: 0.3, life: 1.5, gravity: 12, up: 1.5 }); sfx.coin(); sfx.coin(); }
  if (ENEMY_BOSS.has(m.type)) { recoil.kick(0.05); rumble(0.9, 0.6, 500); decals.add('scorch', pos.x, pos.z, 7, '#ffffff', 40); G.shake = 1; fx.shockwave(pos, 10, '#ff6a3a', 1); fx.emit({ pos, count: 200, speed: 10, color: '#ffcf6a', color2: '#ff2000', size: 0.5, life: 1.6, up: 1 }); }
});
const ENEMY_BOSS = new Set(['boss', 'matriarch', 'ogre', 'drake', 'hollowking', 'herald', 'colossus']);
net.on('hurt', (m) => { if (player) player.hurt(m.dmg, m.from >= 0 ? m.from : null, { affix: m.affix, kb: m.kb }); });
net.on('reward', (m) => {
  if (player && !m.big) {
    const p = new THREE.Vector3(m.x, G.zone.groundHeight(m.x, m.z) + 1.5, m.z);
    if (p.distanceTo(player.pos) < 40) { fx.text(p.clone().setY(p.y + 0.6), `+${m.gold}g`, 'gold', 1.1); fx.goldBurst(p); }
    sfx.coin();
  } else if (m.big) { ui.toast(`+${m.gold} gold`, '#ffd34d', `+${m.xp} XP`); sfx.coin(); sfx.coin(); }
});
net.on('loot', (m) => {
  if (!G.zone) return;
  G.loots.set(m.item.id, new LootView(m.item, m.x, m.z, G.zone));
  if (m.item.rarity >= 3) ui.toast(`${RARITIES[m.item.rarity].name} drop!`, RARITIES[m.item.rarity].color, m.item.name);
});
net.on('picked', (m) => {
  const l = G.loots.get(m.id); if (!l) return;
  const R = RARITIES[l.item.rarity], cur = G.prof.char.equipped[l.item.slot];
  ui.toast(l.item.name, R.color, `${R.name}${!cur || l.item.power > cur.power ? ' · ▲ Upgrade! (press I)' : ''}`);
  sfx.loot(l.item.rarity);
  fx.emit({ pos: l.g.position.clone().setY(l.g.position.y + 0.8), count: 25, speed: 3, color: R.color, color2: '#ffffff', size: 0.25, life: 0.6, up: 1 });
  l.dispose(); G.loots.delete(m.id);
});
let lootFullT = 0;
net.on('pickFail', (m) => { const l = G.loots.get(m.id); if (l) l.pending = false; if (lootFullT <= 0) { ui.toast('Your bag is full! Sell items at the Dark World merchant.', '#ff6a5a'); lootFullT = 4; } });
net.on('chestOpened', (m) => { const ch = town.chests.find((c) => c.id === m.id); if (ch) { town.openChest(ch); sfx.loot(2); ui.toast('Ancient chest opened!', '#ffd34d'); fx.goldBurst(new THREE.Vector3(ch.x, town.groundHeight(ch.x, ch.z) + 1, ch.z)); } });
net.on('notice', (m) => ui.toast(m.text, m.color));
net.on('shop', (m) => ui.setShop(m.stock));
net.on('proj', (m) => { if (G.zone) G.projectiles.set(m.id, new ProjView(m, G.zone)); });
net.on('projEnd', (m) => {
  const v = G.projectiles.get(m.id); if (!v) return;
  if (m.hit || v.kind !== 'arrow') fx.emit({ pos: v.pos.clone(), count: 14, speed: 4, color: v.color || '#ffe6a0', color2: '#5a00a0', size: 0.3, life: 0.4 });
  v.dispose(); G.projectiles.delete(m.id);
});
net.on('hazard', (m) => { if (!G.zone) return; const h = { ...m.h }; if (h.kind === 'fire' || h.kind === 'storm') setTimeout(() => decals.add('scorch', h.x, h.z, h.r * (h.kind === 'storm' ? 1.1 : 1.6), h.kind === 'storm' ? '#a0c0ff' : '#ffffff', h.kind === 'storm' ? 10 : 24), (h.delay || 0) * 1000); G.hazards.set(h.id, h); G.hazardViews.set(h.id, new HazardView(h, G.zone)); });
net.on('hazardEnd', (m) => { G.hazards.delete(m.id); const v = G.hazardViews.get(m.id); if (v) { v.dispose(); G.hazardViews.delete(m.id); } });
net.on('slam', (m) => {
  const y = G.zone.groundHeight(m.x, m.z);
  fx.telegraph(new THREE.Vector3(m.x, y, m.z), m.r, m.delay);
  sfx.horn();
  setTimeout(() => {
    if (!G.zone) return;
    const p = new THREE.Vector3(m.x, y, m.z);
    fx.shockwave(p, m.r, '#ff4a20', 0.5); decals.add('crack', m.x, m.z, m.r * 1.2, '#ffffff', 18);
    if (player && p.distanceTo(player.pos) < m.r + 6) { recoil.kick(0.035); rumble(0.7, 0.4, 260); }
    fx.emit({ pos: p.clone().setY(y + 0.3), count: 90, speed: 10, color: '#ffb060', color2: '#ff1000', size: 0.5, life: 0.8, flat: true, drag: 2.5 });
    G.shake = Math.max(G.shake, 0.8); sfx.slam();
  }, m.delay * 1000);
});
net.on('leap', (m) => { const e = G.enemies.get(m.id); if (e) e.startLeap(m.x, m.z, m.delay); fx.telegraph(new THREE.Vector3(m.x, G.zone.groundHeight(m.x, m.z), m.z), 4, m.delay, '#ff6a1a'); sfx.roar(); });
net.on('summon', (m) => { ui.toast('The boss summons its brood!', '#ff7a5a'); sfx.boss(); fx.emit({ pos: new THREE.Vector3(m.x, 1, m.z), count: 80, speed: 7, color: '#ff4020', color2: '#200000', size: 0.5, life: 1, up: 1 }); });
net.on('phase', (m) => { ui.bigBanner(m.enraged ? 'ENRAGED!' : `PHASE ${m.n}`, m.enraged ? 'The boss unleashes its fury' : 'The battle intensifies', 2500); G.shake = 0.8; sfx.roar(); });
net.on('bossIntro', (m) => {
  const e = G.enemies.get(m.id);
  if (!e || !player || e.pos.distanceTo(player.pos) > 45) return;
  const names = { boss: ['THE BONE TYRANT', 'Lord of the Crypts'], matriarch: ['THE ASH MATRIARCH', 'Mother of the Ashlings'], drake: ['THE STORM DRAKE', 'Terror of Stormspire'], herald: ['THE STORM HERALD', 'Bearer of the Storm Crown'], hollowking: ['THE HOLLOW KING', 'Sovereign of the Dark World'] };
  const [n, s] = names[m.type] || [e.def.name.toUpperCase(), ''];
  player.invuln = 3.2;
  cine.play(bossShots(e, n, s), { skippable: false });
  sfx.roar(); setTimeout(() => sfx.boss(), 400);
  G.shake = 0.5;
});
net.on('siege', () => { ui.bigBanner('SIEGE OGRE', 'A battering ram approaches the south gate!', 4000); sfx.roar(); sfx.horn(); });
net.on('goblin', () => { ui.toast('A Treasure Goblin! Catch it before it escapes!', '#ffd34d'); sfx.goblin(); });
net.on('goblinEscape', (m) => { ui.toast('The goblin escaped through a portal…', '#ff9a7a'); fx.emit({ pos: new THREE.Vector3(m.x, 1, m.z), count: 80, speed: 4, color: '#c77dff', color2: '#ffd34d', size: 0.4, life: 1 }); sfx.portal(); });
net.on('cleared', (m) => {
  G.roomLevel = m.level;
  if (dungeon && G.zone === dungeon) dungeon.setCleared();
  ui.bigBanner('DUNGEON CLEARED', `Depth ${m.level} awaits — enemies and loot grow stronger`, 5500);
  sfx.victory(); ui.setDepth(m.level);
});
net.on('roomLevel', (m) => { G.roomLevel = m.level; ui.setDepth(m.level); });
net.on('dstate', (m) => { if (dungeon && G.zone === dungeon) dungeon.setDState(m); });
net.on('lever', (m) => { sfx.lever(m.ok); ui.toast(m.ok ? `${m.by} pulled the ${LEVER_NAMES[m.i]} lever` : `Wrong order! The levers reset and the dead stir…`, m.ok ? '#5eea8a' : '#ff6a5a'); });
net.on('gateOpen', () => { ui.bigBanner('THE GATE OPENS', 'The boss chamber awaits', 3000); sfx.gate(); G.shake = 0.4; });
net.on('shrine', (m) => { const S = SHRINES[m.kind]; ui.toast(`${S.name} activated by ${m.by}`, S.color, S.desc + ' for the whole party'); sfx.shrine(); if (player) fx.emit({ pos: player.pos.clone().setY(player.pos.y + 1), count: 50, speed: 3, color: S.color, color2: '#ffffff', size: 0.3, life: 1, up: 1 }); });
net.on('erupt', (m) => { fx.telegraph(new THREE.Vector3(m.x, G.zone.groundHeight(m.x, m.z), m.z), m.r, m.delay, '#c87a3a'); setTimeout(() => { if (!G.zone) return; const p = new THREE.Vector3(m.x, G.zone.groundHeight(m.x, m.z), m.z); fx.emit({ pos: p, count: 50, speed: 7, color: '#b89070', color2: '#3a2a1a', size: 0.5, life: 0.8, up: 2 }); fx.shockwave(p, m.r, '#c87a3a', 0.35); sfx.slam(); }, m.delay * 1000); });
net.on('heal', (m) => {
  const a = G.enemies.get(m.from), b = G.enemies.get(m.to); if (!a || !b) return;
  const pa = a.pos.clone().setY(a.pos.y + 1.5), pb = b.pos.clone().setY(b.pos.y + b.height * 0.6);
  for (let i = 0; i <= 12; i++) fx.emit({ pos: pa.clone().lerp(pb, i / 12), count: 2, speed: 0.4, color: '#a0ffc0', color2: '#10a040', size: 0.35, life: 0.6 });
  fx.text(pb, `+${m.amt}`, 'heal', 0.8);
});
net.on('boom', (m) => { const p = new THREE.Vector3(m.x, G.zone.groundHeight(m.x, m.z) + 0.5, m.z); decals.add('scorch', m.x, m.z, m.r * 1.3); if (player && p.distanceTo(player.pos) < 8) { recoil.kick(0.03); rumble(0.6, 0.3, 200); } fx.shockwave(p, m.r, '#ff6a1a', 0.4); fx.emit({ pos: p, count: 90, speed: 9, color: '#ffe0a0', color2: '#ff1000', size: 0.55, life: 0.8, up: 1 }); sfx.explode(); G.shake = Math.max(G.shake, 0.4); });
net.on('strafe', (m) => {
  const y = (x, z) => G.zone.groundHeight(x, z);
  const A = new THREE.Vector3(m.ax, y(m.ax, m.az) + 0.06, m.az), B = new THREE.Vector3(m.bx, y(m.bx, m.bz) + 0.06, m.bz);
  const len = A.distanceTo(B), mid = A.clone().lerp(B, 0.5);
  const rect = new THREE.Mesh(new THREE.PlaneGeometry(m.w, len), new THREE.MeshBasicMaterial({ color: '#6ad0ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  rect.rotation.x = -Math.PI / 2; rect.rotation.z = -Math.atan2(m.bx - m.ax, m.bz - m.az); rect.position.copy(mid);
  fx.root.add(rect); sfx.roar();
  const t0 = performance.now();
  const tick = () => {
    const k = (performance.now() - t0) / 1000;
    rect.material.opacity = k < m.delay ? 0.25 + 0.2 * Math.sin(k * 20) : Math.max(0, 0.5 - (k - m.delay) * 0.4);
    if (k > m.delay && k < m.delay + m.dur) { const f = (k - m.delay) / m.dur, p = A.clone().lerp(B, f); fx.emit({ pos: p.setY(p.y + 0.5), count: 10, speed: 5, color: '#e0f6ff', color2: '#2a6aff', size: 0.6, life: 0.6, radius: m.w / 2 }); }
    if (k < m.delay + m.dur + 1) requestAnimationFrame(tick); else { rect.parent?.remove(rect); rect.geometry.dispose(); rect.material.dispose(); }
  };
  tick();
});
net.on('teleport', (m) => { if (!player) return; ui.fade(true); setTimeout(() => { player.teleport(m.x, m.z, G.zone); camRig.snap(player); ui.fade(false); }, 300); });
net.on('arenaShift', (m) => { ui.bigBanner('THE HOLLOW KING SHIFTS THE WORLD', `Phase ${m.phase} — a new arena`, 3000); sfx.portal(); sfx.roar(); });
net.on('event', (m) => { G.event = { ...m, left: null }; ui.toast(`World event: ${EVENTS[m.kind].name}!`, '#ffd34d', EVENTS[m.kind].goal + ' — marked on your minimap'); sfx.horn(); if (G.zone) { const p = new THREE.Vector3(m.x, G.zone.groundHeight(m.x, m.z), m.z); if (m.kind === 'meteor') fxPlay('meteor', { x: m.x, z: m.z, r: 4, delay: 3 }); else { fx.shockwave(p, 4, '#c77dff', 1); fx.beam(p, '#c77dff', 20, 40); } } });
net.on('eventLeft', (m) => { if (G.event) G.event.left = m.left; });
net.on('eventDone', (m) => { G.event = null; ui.bigBanner(m.ok ? 'EVENT COMPLETE' : 'EVENT FAILED', m.ok ? 'The region is safer — rewards granted' : 'The threat faded away…', 3000); if (m.ok) sfx.victory(); });
net.on('questDone', (m) => {
  const Q = QUESTS[m.i]; sfx.levelUp();
  const show = () => ui.npcDialog(Q.act === 2 ? 'Scout Ilsa' : 'Captain Bryn', Q.done, () => ui.bigBanner(Q.act === 2 ? 'ACT II · QUEST COMPLETE' : 'QUEST COMPLETE', Q.title, 3000));
  if (Q.kind === 'drake') act2Cutscene('herald', show); else if (Q.kind === 'herald') setTimeout(show, 9000); else if (cine.active) afterCine.push(show); else show();
});
net.on('dialog', (m) => { const Q = QUESTS[m.i]; if (m.i === ACT1_END) { act2Cutscene('intro', () => ui.npcDialog(m.who, Q.intro)); return; } if (m.i === 0) ui.npcDialog(m.who, Q.intro); else if (!Q) ui.npcDialog(m.who, 'The Peaks await, hero. Emberhold owes you its life.'); else ui.npcDialog(m.who, `${Q.title}: ${Q.goal}. Don't keep the dark waiting.`); });
net.on('gem', (m) => { ui.toast(`Gem found: ${gemName(m.k)}`, GEMS[parseGem(m.k).type].color, 'Socket it at the Blacksmith'); sfx.loot(2); });
net.on('riftProgress', (m) => { if (G.rift) G.rift.p = m.p; });
net.on('guardian', () => { if (G.rift) { G.rift.p = 1; G.rift.guardian = true; } ui.bigBanner('THE GUARDIAN AWAKENS', 'The rift collapses around its master', 3000); sfx.roar(); });
net.on('riftDone', (m) => {
  if (G.rift) G.rift.done = true;
  if (dungeon && G.zone === dungeon) { dungeon.exitPortal.position.set(m.x, 0, m.z); dungeon.interactables[1].x = m.x; dungeon.interactables[1].z = m.z; dungeon.setCleared(); }
  const mm = Math.floor(m.time / 60), ss = String(Math.floor(m.time % 60)).padStart(2, '0');
  ui.bigBanner(m.ok ? 'RIFT CONQUERED' : 'RIFT CLOSED', m.ok ? `${mm}:${ss} — keystone +${m.bump}. Your name joins the Hall of Embers.` : `${mm}:${ss} — too slow for a keystone upgrade`, 6000);
  sfx.victory();
});
net.on('leaderboard', (m) => ui.renderBoard(m));
let lastPgToast = 0;
net.on('paragonUp', (m) => { if (performance.now() - lastPgToast < 1500) return; lastPgToast = performance.now(); ui.toast(`Paragon point earned! (${m.pts})`, '#ffd98a', 'Spend it in the Talents panel (K)'); sfx.levelUp(); });
net.on('structs', applyStructs);
net.on('defense', (m) => applyDefense(m, false));
net.on('wave', (m) => { if (G.zone === town) { ui.bigBanner(`WAVE ${m.wave}`, m.wave === 5 ? 'The final wave — the siege begins!' : 'Defend the Ember Heart!', 3000); sfx.horn(); } });
net.on('coreHit', (m) => { G.defense.coreHp = m.hp; });
net.on('fx', (m) => { if (m.by !== G.myId) fxPlay(m.kind, m); });
net.on('emote', (m) => { if (m.id !== G.myId) G.remotes.get(m.id)?.showEmote(m.kind); });
net.on('readyCheck', (m) => { ui.readyCheck(m); sfx.bell(); });
net.on('readyCancel', (m) => { ui.closeDialog(); ui.toast(m.text, '#ff9a7a'); traveling = false; });
net.on('readyUpdate', () => sfx.pop());
net.on('readyGo', () => { ui.closeDialog(); ui.toast('The party descends!', '#5eea8a'); });
net.on('tradeInvite', (m) => { ui.tradeInvite(m.from, m.name); sfx.pop(); });
net.on('tradeState', (m) => ui.tradeState(m));
net.on('tradeClosed', (m) => { ui.tradeClosed(m.text); if (/complete/i.test(m.text)) sfx.buy(); });
net.on('plevel', (m) => { const r = G.remotes.get(m.id); if (r && m.id !== G.myId) fx.levelUp(r.pos.clone()); });
net.on('chat', (m) => ui.chat(m.from, m.text, m.color));
net.on('error', (m) => { ui.lobbyMsg(m.text); if (G.inGame) ui.bigBanner('DISCONNECTED', m.text, 1e9); });
net.on('close', () => { if (G.inGame) { ui.bigBanner('DISCONNECTED', 'Lost connection to the server — refresh to rejoin', 1e9); G.inGame = false; } });

document.getElementById('playBtn').onclick = async () => {
  sfx.init(); applySettings();
  const v = lobby.values();
  ui.lobbyMsg('Connecting…');
  document.getElementById('playBtn').disabled = true;
  try {
    await net.connect();
    net.send({ t: 'hello', token: getToken(), name: v.name, color: v.color, room: v.room, cls: v.cls, public: document.getElementById('publicParty').checked });
  } catch (e) {
    ui.lobbyMsg(e.message + ' Start it with: npm start');
    document.getElementById('playBtn').disabled = false;
  }
};

// ---------- per-frame gameplay glue ----------
let wheelHeld = false;
function handleInput() {
  for (const code of input.pressed) if (ui.dialogKey(code)) return;
  if (ui.chatting || cine.active) return;
  const b = input.bindings;
  if ((input.hit(b.chat)) && !G.uiOpen) { ui.openChat(); return; }
  if (input.actHit('inventory') || input.hit('Tab')) ui.togglePanel('inventory');
  if (input.actHit('talents')) { ui._atTrainer = false; ui.togglePanel('talents'); }
  if (input.actHit('help')) ui.togglePanel('help');
  if (input.actHit('quests')) ui.togglePanel('quests');
  if (input.hit('Escape') || input.pad.pressed.has('menu')) {
    if (G.emoteWheel) ui.closeWheel();
    else if (G.uiOpen) ui.closeAll();
    else if (G.buildMode) G.buildMode = false;
    else if (G.lock) G.lock = null;
    else ui.openPanel('settings');
  }
  if (G.uiOpen) return;
  if (input.actHit('build')) {
    if (G.zone === town) { G.buildMode = !G.buildMode; if (G.buildMode) ui.toast('Build: 1-5 choose · click place · aim at a structure to upgrade (U) / repair (R)', '#5ab0ff'); }
    else ui.toast('You can only build in Emberhold.', '#ff6a5a');
  }
  if (G.buildMode) for (const [k, S] of Object.entries(STRUCTURES)) if (input.hit('Digit' + S.key)) ui.selectedBuild = k;
  if (input.actHit('lockon') || input.click(1)) {
    if (G.lock) G.lock = null;
    else { G.lock = player.aimTarget(camRig.yaw, 30) || [...G.enemies.values()].filter((e) => !e.dead && e.pos.distanceTo(player.pos) < 25).sort((a, c) => a.pos.distanceTo(player.pos) - c.pos.distanceTo(player.pos))[0] || null; if (G.lock) sfx.click(); }
  }
  if (G.lock && (G.lock.dead || G.lock.pos.distanceTo(player.pos) > 34)) G.lock = null;
  // emote wheel (hold)
  if (input.act('emote') && !wheelHeld) { wheelHeld = true; ui.openWheel(); }
  if (wheelHeld) {
    ui.updateWheel(input.dx, input.dy, input.pad.moveX, input.pad.moveY);
    if (!input.act('emote')) {
      wheelHeld = false;
      const k = ui.closeWheel();
      if (k) { player.emote = k; player.emoteT = 0; player.emoteDur = 3; net.send({ t: 'emote', kind: k }); sfx.pop(); showOwnEmote(k); }
    }
  }
}
const ownBubble = document.createElement('div'); ownBubble.className = 'emotebubble'; ownBubble.style.display = 'none'; document.getElementById('labels').appendChild(ownBubble);
function showOwnEmote(k) { ownBubble.textContent = EMOTES[k]; ownBubble.style.display = ''; clearTimeout(ownBubble._t); ownBubble._t = setTimeout(() => (ownBubble.style.display = 'none'), 3000); }

function interactables() {
  const list = [...(G.zone.interactables || [])];
  for (const r of G.remotes.values()) if (!r.p.dead) list.push({ x: r.pos.x, z: r.pos.z, r: 3, label: () => `Trade with ${r.p.name}`, action: () => net.send({ t: 'tradeReq', to: r.id }) });
  if (G.zone === town && player && !fishing.active && nearLake(player.pos.x, player.pos.z)) list.push({ x: player.pos.x, z: player.pos.z, r: 1, label: () => (G.defense.phase === 'day' ? 'Fish in the lake' : null), action: () => fishing.start(player) });
  return list;
}
function nearestInteractable() {
  let best = null, bd = 1e9;
  for (const it of interactables()) {
    const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z);
    if (d < it.r && d < bd) { const label = it.label(); if (label) { bd = d; best = { it, label }; } }
  }
  return best;
}

const snap = (v) => Math.round((v - 1) / 2) * 2 + 1;
function updateBuild() {
  const show = G.buildMode && G.zone === town && !player.dead && !G.uiOpen;
  if (G.buildTarget) G.buildTarget.highlight = false;
  G.buildTarget = null;
  if (!show) { if (ghost) { ghost.parent?.remove(ghost); ghost = null; } return; }
  const kind = ui.selectedBuild, S = STRUCTURES[kind];
  const fwdX = -Math.sin(camRig.yaw), fwdZ = -Math.cos(camRig.yaw);
  let x = player.pos.x + fwdX * 4.5, z = player.pos.z + fwdZ * 4.5;
  // aiming at an existing structure → upgrade / repair mode
  let tgt = null, td = 1.8;
  for (const v of G.structures.values()) { const d = Math.hypot(v.s.x - x, v.s.z - z); if (d < td) { td = d; tgt = v; } }
  if (tgt) {
    G.buildTarget = tgt; tgt.highlight = true;
    if (ghost) ghost.visible = false;
    if (input.actHit('upgrade')) net.send({ t: 'upgrade', id: tgt.s.id });
    if (input.actHit('potion')) net.send({ t: 'repair', id: tgt.s.id });
    return;
  }
  if (!ghost || ghostKind !== kind) { if (ghost) ghost.parent?.remove(ghost); ghost = buildStructure(kind, true); ghostKind = kind; entityRoot.add(ghost); }
  ghost.visible = true;
  if (S.snap) { x = snap(x); z = snap(z); } else { x = Math.round(x * 2) / 2; z = Math.round(z * 2) / 2; }
  ghost.position.set(x, town.groundHeight(x, z), z);
  ghost.rotation.y = S.snap ? 0 : Math.atan2(-x, -z);
  const r = Math.hypot(x, z), gold = G.prof.gold;
  const blocked = r < TOWN.core.r + 2.5 || r > TOWN.wallR + 28 || [TOWN.dungeonPortal, TOWN.darkPortal].some((p) => Math.hypot(p.x - x, p.z - z) < 4.5);
  const ok = !blocked && gold >= S.cost;
  ghost.traverse((o) => { if (o.isMesh) o.material.color.set(ok ? '#5eea8a' : '#ff5a4a'); });
  if (input.click(0)) {
    if (blocked) ui.toast('Cannot build there.', '#ff6a5a');
    else if (gold < S.cost) ui.toast(`Need ${S.cost} gold for a ${S.name}.`, '#ff6a5a');
    else net.send({ t: 'build', kind, x, z });
  }
}

function updateLoot(dt) {
  lootFullT -= dt;
  for (const l of G.loots.values()) {
    l.update(dt, camera);
    if (player.dead || l.pending) continue;
    if (Math.hypot(l.g.position.x - player.pos.x, l.g.position.z - player.pos.z) < 1.8) { l.pending = true; net.send({ t: 'pickup', id: l.item.id }); setTimeout(() => (l.pending = false), 1500); }
  }
}

function laneThreat() {
  const out = [0, 0, 0];
  if (G.zone !== town || G.defense.phase === 'day') return out;
  for (const e of G.enemies.values()) {
    if (e.dead) continue;
    const r = Math.hypot(e.pos.x, e.pos.z); if (r < 30) continue;
    const a = Math.atan2(e.pos.z, e.pos.x);
    TOWN.lanes.forEach((l, i) => { if (Math.abs(((a - l + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.6) out[i]++; });
  }
  return out;
}

let sendT = 0, last = performance.now(), musicT = 0, ftEma = 16, dynT = 0, perfOn = false, perfT = 0, netIn = 0;
const perfEl = document.getElementById('perf');
addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); perfOn = !perfOn; perfEl.classList.toggle('hidden', !perfOn); } });
net.on('ents', () => netIn++); net.on('players', () => netIn++);
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  const realDt = Math.min(0.05, rawDt); last = now;
  ftEma += (Math.min(rawDt, 0.1) * 1000 - ftEma) * 0.05;
  dynT += realDt;
  if (settings.dynres && G.inGame && dynT > 1.2) {
    dynT = 0;
    const was = dynScale;
    if (ftEma > 19 && dynScale > 0.55) dynScale = Math.max(0.5, dynScale - 0.1);
    else if (ftEma < 13 && dynScale < 1) dynScale = Math.min(1, dynScale + 0.05);
    if (was !== dynScale) resize();
  }
  if (perfOn && (perfT -= realDt) <= 0) {
    perfT = 0.5; const ri = renderer.info;
    perfEl.textContent = `FPS ${Math.round(1000 / ftEma)}  ${ftEma.toFixed(1)} ms\nres ${(renderer.getPixelRatio()).toFixed(2)}x${settings.dynres ? ' (dyn ' + dynScale.toFixed(2) + ')' : ''}  ${settings.quality}\ndraw calls ${ri.render.calls}  tris ${(ri.render.triangles / 1000).toFixed(0)}k\ngeo ${ri.memory.geometries}  tex ${ri.memory.textures}\nenemies ${G.enemies.size}  players ${G.remotes.size + 1}\nnet msgs/s ${netIn * 2}  zone ${G.zoneKey}`;
    netIn = 0;
  }
  let dt = realDt;
  if (G.slowmo > 0) { G.slowmo -= realDt; dt *= 0.3; }
  document.getElementById('slowmo').style.opacity = G.slowmo > 0 ? 1 : 0;
  if (G.hitstop > 0) { G.hitstop -= realDt; dt *= 0.1; }
  G.time += dt;
  const zone = G.zone;
  input.pollGamepad(realDt);
  input.wantLock = G.inGame && !G.uiOpen && !ui.chatting && !cine.active;
  if (G.inGame && player && zone) {
    handleInput();
    player.update(dt, input, camRig, zone);
    if (!cine.update(realDt)) camRig.update(realDt, input, player, zone);
    G.camYaw = camRig.yaw;
    const near = !player.dead && !G.uiOpen && !G.buildTarget ? nearestInteractable() : null;
    ui.prompt(near && !cine.active ? near.label : null);
    if (near && input.actHit('interact') && !ui.chatting && !cine.active) near.it.action();
    updateBuild();
    for (const [id, e] of G.enemies) if (!e.update(dt, zone, camera)) { e.dispose(); G.enemies.delete(id); }
    for (const r of G.remotes.values()) r.update(dt, camera);
    for (const a of G.allies.values()) a.update(dt, camera, zone);
    decals.update(dt);
    G.clock = performance.now() / 1000 - clockStart; G.hour = hourAt(G.clock);
    weather.update(dt, zone, camera);
    zone.wildlife?.update(dt, G.time, player ? player.pos : camera.position);
    if (zone === town && town.folk) town.folk.update(dt, player ? player.pos : camera.position, camera);
    if (player) fishing.update(dt, input);
    { const hh = Math.floor(G.hour), mm = Math.floor((G.hour % 1) * 60), W = weatherFx(G.weather), outdoors = zone.type === 'region' || zone.type === 'dark' || zone === town;
      const txt = outdoors ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${G.hour >= 20 || G.hour < 6 ? '☾' : '☀'}${zone.type !== 'town' && G.weather !== 'clear' ? ` · ${W.icon} ${W.name}<br><small>${W.desc}</small>` : ''}` : '';
      if (txt !== weatherChip._t) { weatherChip.innerHTML = txt; weatherChip._t = txt; } }
    if (player && !G.cinematic) footsteps.update(player, zone);
    for (const p of G.projectiles.values()) p.update(dt);
    for (const s of G.structures.values()) s.update(dt, camera);
    for (const h of G.hazardViews.values()) h.update(dt);
    updateLoot(dt);
    zone.update(dt, G.time, player.pos);
    G.laneThreat = laneThreat();
    for (const [id, t] of killed) if (G.time - t > 10) killed.delete(id);
    if (ownBubble.style.display !== 'none') { const p = player.pos.clone(); p.y += 3.3; const v = p.project(camera); ownBubble.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; ownBubble.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px'; }
    sendT -= realDt;
    if (sendT <= 0) {
      sendT = 1 / 15;
      net.send({ t: 'state', mount: !!player.mounted, x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2), ry: +(player.ry + (player.kit.whirlT > 0 ? 0 : 0)).toFixed(2), anim: player.anim, hp: Math.ceil(player.hp), maxHp: player.stats.maxHp, dead: player.dead, gear: gearOf(player.char), style: player.rank, spirit: player.kit.spirits.length, emote: player.emote, block: player.blocking });
    }
    musicT -= realDt;
    if (musicT <= 0) { musicT = 0.5; sfx.music(musicFor()); }
    ui.updateHUD();
    ui.updateMarks(camera);
    ui.drawMinimap(zone, player, camRig.yaw);
  } else {
    const t = now / 1000, a = t * 0.05 + 0.8;
    camera.position.set(Math.cos(a) * 46, 20 + Math.sin(t * 0.2) * 3, Math.sin(a) * 46);
    camera.lookAt(0, 4, 0);
    town.update(dt, G.time, new THREE.Vector3(0, 0, 0));
    lobby.update(realDt);
  }
  fx.update(dt, camera);
  renderer.info.reset();
  composer.render();
  input.endFrame();
}
requestAnimationFrame(frame);

window.__emberfall = { G, town, cine, settings };
