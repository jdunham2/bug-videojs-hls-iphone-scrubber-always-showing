import * as THREE from 'three';
import { heightAt, HALF, volcanicAt, blockedAt, swampAt, frostFrom } from './terrain.js';
import { mergeParts, mtx, rand, pick, angleLerp, lumpify } from './util.js';
import { clamp, lerp } from './noise.js';

const SPH = new THREE.SphereGeometry(1, 14, 10);
const CONE = new THREE.ConeGeometry(1, 1, 8);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);

const E = (rx, ry, rz, color, x = 0, y = 0, z = 0, ax = 0, ay = 0, az = 0) => ({ geo: SPH, color, matrix: mtx(x, y, z, ax, ay, az, rx, ry, rz) });
const K = (r, h, color, x = 0, y = 0, z = 0, ax = 0, ay = 0, az = 0) => ({ geo: CONE, color, matrix: mtx(x, y, z, ax, ay, az, r, h, r) });
const Cy = (r, h, color, x = 0, y = 0, z = 0, ax = 0, ay = 0, az = 0) => ({ geo: CYL, color, matrix: mtx(x, y, z, ax, ay, az, r, h, r) });

function meshOf(parts, mat) {
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------------- Species definitions ----------------
export const SPECIES = {
  pudgewing: {
    name: 'Pudgewing', diet: 'herb', temper: 'skittish', hp: 40, dmg: 2, walk: 1.6, run: 6.5, torpor: 30,
    tameFood: 'berries', tameBase: 5, tameLvl: 0.05, rideable: false, radius: 0.6, reach: 1.0, hitR: 0.8,
    drops: { meat: 2, hide: 1, fiber: 1 }, aggro: 0, lvl: [1, 15], count: 12, zone: (h) => h > 1.5 && h < 14,
  },
  trikeros: {
    name: 'Trikeros', diet: 'herb', temper: 'neutral', hp: 320, dmg: 26, walk: 2.6, run: 7.5, torpor: 240,
    tameFood: 'berries', tameBase: 12, tameLvl: 0.35, rideable: true, radius: 2.0, reach: 4.2, hitR: 2.6,
    drops: { meat: 6, hide: 5 }, aggro: 0, lvl: [1, 30], count: 12, herd: 3, zone: (h) => h > 4 && h < 26,
  },
  talonrunner: {
    name: 'Talonrunner', diet: 'carn', temper: 'aggressive', hp: 130, dmg: 7, walk: 3, run: 11.5, torpor: 120,
    tameFood: 'meat', tameBase: 6, tameLvl: 0.15, rideable: true, radius: 0.9, reach: 2.4, hitR: 1.4,
    drops: { meat: 3, hide: 3 }, aggro: 26, lvl: [1, 30], count: 9, herd: 3, zone: (h) => h > 6 && h < 34, far: 140,
  },
  thunderneck: {
    name: 'Thunderneck', diet: 'herb', temper: 'neutral', hp: 2600, dmg: 60, walk: 2.2, run: 3.5, torpor: Infinity,
    tameFood: null, rideable: false, radius: 4.5, reach: 7, hitR: 5.5,
    drops: { meat: 14, hide: 10 }, aggro: 0, lvl: [10, 40], count: 4, zone: (h) => h > 3 && h < 20, far: 90, wade: true,
  },
  ironhide: {
    name: 'Ironhide', diet: 'herb', temper: 'neutral', hp: 520, dmg: 30, walk: 1.8, run: 4.5, torpor: 320,
    tameFood: 'berries', tameBase: 14, tameLvl: 0.35, rideable: true, radius: 1.9, reach: 4.0, hitR: 2.3, armor: 0.45,
    drops: { meat: 6, hide: 6, stone: 4 }, aggro: 0, lvl: [1, 30], count: 5, zone: (h) => h > 5 && h < 40,
  },
  spinesail: {
    name: 'Spinesail', diet: 'carn', temper: 'aggressive', hp: 760, dmg: 36, walk: 2.8, run: 9, torpor: 520,
    tameFood: 'meat', tameBase: 12, tameLvl: 0.3, rideable: true, radius: 2.0, reach: 4.6, hitR: 2.6,
    drops: { meat: 10, hide: 6 }, aggro: 32, lvl: [8, 35], count: 3, zone: (h) => h > 0.8 && h < 5, far: 160, wade: true,
  },
  crestcaller: {
    name: 'Crestcaller', diet: 'herb', temper: 'skittish', hp: 200, dmg: 8, walk: 2.4, run: 10.5, torpor: 160,
    tameFood: 'berries', tameBase: 9, tameLvl: 0.25, rideable: true, radius: 1.3, reach: 2.6, hitR: 1.9,
    drops: { meat: 4, hide: 3 }, aggro: 0, lvl: [1, 30], count: 8, herd: 4, zone: (h) => h > 3 && h < 24,
  },
  dashbeak: {
    name: 'Dashbeak', diet: 'carn', temper: 'aggressive', hp: 35, dmg: 3, walk: 2.5, run: 9.5, torpor: 30,
    tameFood: 'meat', tameBase: 3, tameLvl: 0.05, rideable: false, radius: 0.4, reach: 1.0, hitR: 0.6,
    drops: { meat: 1, hide: 1 }, aggro: 14, lvl: [1, 20], count: 8, herd: 4, zone: (h) => h > 3 && h < 30, far: 80,
  },
  domehead: {
    name: 'Domehead', diet: 'herb', temper: 'neutral', hp: 180, dmg: 18, walk: 2.2, run: 9, torpor: 140,
    tameFood: 'berries', tameBase: 8, tameLvl: 0.2, rideable: false, radius: 0.9, reach: 2.2, hitR: 1.3,
    drops: { meat: 3, hide: 2 }, aggro: 0, lvl: [1, 30], count: 5, herd: 2, zone: (h) => h > 12 && h < 45,
  },
  galewing: {
    name: 'Galewing', diet: 'carn', temper: 'skittish', hp: 170, dmg: 10, walk: 1.8, run: 4.5, fly: 21, torpor: 110,
    tameFood: 'meat', tameBase: 7, tameLvl: 0.2, rideable: true, radius: 1.0, reach: 2.6, hitR: 1.7, flyer: true,
    drops: { meat: 3, hide: 2 }, aggro: 0, lvl: [1, 30], count: 6, zone: (h) => h > 2 && h < 45,
  },
  thunderwing: {
    name: 'Thunderwing', diet: 'carn', temper: 'aggressive', hp: 620, dmg: 26, walk: 1.6, run: 4, fly: 17, torpor: 420,
    tameFood: 'meat', tameBase: 13, tameLvl: 0.3, rideable: true, radius: 1.8, reach: 4.8, hitR: 2.8, flyer: true,
    drops: { meat: 8, hide: 6 }, aggro: 45, lvl: [10, 40], count: 2, zone: (h, x, z) => z < -60 && h > 20, far: 200,
  },
  glimmerfin: {
    name: 'Glimmerfin', diet: 'herb', temper: 'skittish', hp: 18, dmg: 0, walk: 2, run: 7, swim: 4, torpor: 12,
    tameFood: null, rideable: false, radius: 0.3, reach: 0.5, hitR: 0.45, swimmer: true,
    drops: { meat: 1 }, aggro: 0, lvl: [1, 10], count: 18, herd: 6, zone: (h) => h < -1.8 && h > -11,
  },
  deepjaw: {
    name: 'Deepjaw', diet: 'carn', temper: 'aggressive', hp: 950, dmg: 22, walk: 4, run: 11, swim: 9, torpor: 600,
    tameFood: 'meat', tameBase: 14, tameLvl: 0.3, rideable: true, radius: 2.2, reach: 4.2, hitR: 2.6, swimmer: true,
    drops: { meat: 12, hide: 6 }, aggro: 32, lvl: [10, 40], count: 3, zone: (h) => h < -8, far: 120,
  },
  cinderback: {
    name: 'Cinderback', diet: 'carn', temper: 'aggressive', hp: 680, dmg: 26, walk: 2.8, run: 8.5, torpor: 460,
    tameFood: 'meat', tameBase: 12, tameLvl: 0.3, rideable: true, radius: 1.7, reach: 3.8, hitR: 2.2, glow: [1, 0.35, 0.05], fireproof: true,
    drops: { meat: 7, hide: 5, obsidian: 3 }, aggro: 28, lvl: [12, 40], count: 4, zone: (h, x, z) => volcanicAt(x, z) > 0.55 && h > 6, far: 120,
  },
  duskraptor: {
    name: 'Duskraptor', diet: 'carn', temper: 'aggressive', hp: 170, dmg: 9, walk: 3, run: 10.5, torpor: 140,
    tameFood: 'meat', tameBase: 7, tameLvl: 0.18, rideable: true, radius: 0.9, reach: 2.4, hitR: 1.4, glow: [0.2, 0.6, 1],
    drops: { meat: 3, hide: 3, crystal: 1 }, aggro: 22, lvl: [8, 35], count: 0, zone: () => false,
  },
  bogmaw: {
    name: 'Bogmaw', diet: 'carn', temper: 'aggressive', hp: 460, dmg: 24, walk: 1.6, run: 8, torpor: 320,
    tameFood: 'meat', tameBase: 10, tameLvl: 0.25, rideable: true, radius: 1.4, reach: 3.2, hitR: 1.9, wade: true,
    drops: { meat: 6, hide: 6 }, aggro: 15, lvl: [5, 35], count: 6, zone: (h, x, z) => swampAt(x, z) > 0.55 && h > -1.5 && h < 2,
  },
  reedhorn: {
    name: 'Reedhorn', diet: 'herb', temper: 'neutral', hp: 360, dmg: 16, walk: 2.4, run: 8.5, torpor: 260,
    tameFood: 'berries', tameBase: 11, tameLvl: 0.3, rideable: true, radius: 1.7, reach: 3.2, hitR: 2.2, wade: true,
    drops: { meat: 7, hide: 4 }, aggro: 0, lvl: [1, 30], count: 10, herd: 4, zone: (h, x, z) => swampAt(x, z) > 0.35 && h > -0.5 && h < 4,
  },
  frosthorn: {
    name: 'Frosthorn', diet: 'herb', temper: 'neutral', hp: 420, dmg: 28, walk: 2.2, run: 7, torpor: 300,
    tameFood: 'berries', tameBase: 12, tameLvl: 0.32, rideable: true, radius: 2.0, reach: 4.0, hitR: 2.6, coldproof: true,
    drops: { meat: 6, pelt: 4, hide: 3 }, aggro: 0, lvl: [5, 35], count: 8, herd: 3, zone: (h, x, z) => frostFrom(h, x, z) > 0.5 && h < 80,
  },
  rimeclaw: {
    name: 'Rimeclaw', diet: 'carn', temper: 'aggressive', hp: 160, dmg: 10, walk: 3, run: 12, torpor: 130,
    tameFood: 'meat', tameBase: 7, tameLvl: 0.16, rideable: true, radius: 0.9, reach: 2.4, hitR: 1.4, coldproof: true,
    drops: { meat: 3, pelt: 2 }, aggro: 26, lvl: [5, 35], count: 9, herd: 3, zone: (h, x, z) => frostFrom(h, x, z) > 0.5 && h < 85, far: 120,
  },
  plateback: {
    name: 'Plateback', diet: 'herb', temper: 'neutral', hp: 540, dmg: 30, walk: 2, run: 6, torpor: 360,
    tameFood: 'berries', tameBase: 13, tameLvl: 0.32, rideable: true, radius: 1.9, reach: 4.2, hitR: 2.4,
    drops: { meat: 7, hide: 5 }, aggro: 0, lvl: [1, 30], count: 8, herd: 2, zone: (h) => h > 6 && h < 28,
  },
  hornjaw: {
    name: 'Hornjaw', diet: 'carn', temper: 'aggressive', hp: 380, dmg: 18, walk: 3, run: 12.5, torpor: 260,
    tameFood: 'meat', tameBase: 9, tameLvl: 0.22, rideable: true, radius: 1.3, reach: 3.0, hitR: 1.9,
    drops: { meat: 5, hide: 4 }, aggro: 30, lvl: [5, 35], count: 4, zone: (h) => h > 4 && h < 22, far: 130,
  },
  scythehand: {
    name: 'Scythehand', diet: 'herb', temper: 'neutral', hp: 720, dmg: 34, walk: 2, run: 6.5, torpor: 480,
    tameFood: 'berries', tameBase: 14, tameLvl: 0.35, rideable: true, radius: 1.6, reach: 4.4, hitR: 2.5,
    drops: { meat: 8, hide: 5 }, aggro: 0, lvl: [5, 35], count: 4, zone: (h) => h > 8 && h < 30,
  },
  skyhorn: {
    name: 'Skyhorn', diet: 'carn', temper: 'neutral', hp: 320, dmg: 14, walk: 2, run: 5, fly: 27, torpor: 210,
    tameFood: 'meat', tameBase: 9, tameLvl: 0.22, rideable: true, radius: 1.3, reach: 3.2, hitR: 2.3, flyer: true,
    drops: { meat: 4, hide: 3 }, aggro: 0, lvl: [5, 35], count: 4, zone: (h) => h > 15 && h < 60,
  },
  dashstrider: {
    name: 'Dashstrider', diet: 'herb', temper: 'skittish', hp: 190, dmg: 8, walk: 3, run: 15.5, torpor: 150,
    tameFood: 'berries', tameBase: 8, tameLvl: 0.22, rideable: true, radius: 1.0, reach: 2.2, hitR: 1.6,
    drops: { meat: 3, hide: 2 }, aggro: 0, lvl: [1, 30], count: 8, herd: 4, zone: (h) => h > 3 && h < 18,
  },
  frillspitter: {
    name: 'Frillspitter', diet: 'carn', temper: 'aggressive', hp: 150, dmg: 10, walk: 2.6, run: 9, torpor: 120, spit: true,
    tameFood: 'meat', tameBase: 6, tameLvl: 0.15, rideable: false, radius: 0.8, reach: 2.0, hitR: 1.2,
    drops: { meat: 2, hide: 2 }, aggro: 22, lvl: [3, 30], count: 6, herd: 2, zone: (h) => h > 6 && h < 28, far: 110,
  },
  nightstalker: {
    name: 'Nightstalker', diet: 'carn', temper: 'aggressive', hp: 640, dmg: 30, walk: 3, run: 11, torpor: 440, nocturnal: true, glow: [0.6, 0.9, 0.2],
    tameFood: 'meat', tameBase: 12, tameLvl: 0.3, rideable: true, radius: 1.6, reach: 3.6, hitR: 2.2,
    drops: { meat: 8, hide: 6 }, aggro: 36, lvl: [10, 40], count: 3, zone: (h) => h > 5 && h < 30, far: 150,
  },
  longfin: {
    name: 'Longfin', diet: 'carn', temper: 'skittish', hp: 520, dmg: 12, walk: 3, run: 9, swim: 8, torpor: 340,
    tameFood: 'meat', tameBase: 10, tameLvl: 0.25, rideable: true, radius: 1.8, reach: 3, hitR: 2.4, swimmer: true,
    drops: { meat: 8, hide: 5 }, aggro: 0, lvl: [1, 30], count: 5, zone: (h) => h < -3 && h > -14,
  },
  quillback: {
    name: 'Quillback', diet: 'herb', temper: 'neutral', hp: 480, dmg: 26, walk: 2, run: 6, torpor: 340, thorns: 0.25,
    tameFood: 'berries', tameBase: 12, tameLvl: 0.3, rideable: true, radius: 1.8, reach: 4, hitR: 2.4,
    drops: { meat: 6, hide: 5 }, aggro: 0, lvl: [1, 30], count: 6, herd: 2, zone: (h) => h > 5 && h < 26,
  },
  eggthief: {
    name: 'Eggthief', diet: 'herb', temper: 'thief', hp: 70, dmg: 0, walk: 3, run: 12.5, torpor: 50, thief: true,
    tameFood: 'berries', tameBase: 4, tameLvl: 0.1, rideable: false, radius: 0.5, reach: 1.4, hitR: 0.8,
    drops: { meat: 1, hide: 1 }, aggro: 16, lvl: [1, 20], count: 8, herd: 2, zone: (h) => h > 3 && h < 25, far: 60,
  },
  bloodclaw: {
    name: 'Bloodclaw', diet: 'carn', temper: 'aggressive', hp: 320, dmg: 14, walk: 3, run: 12, torpor: 220, bleed: true,
    tameFood: 'meat', tameBase: 9, tameLvl: 0.22, rideable: true, radius: 1.1, reach: 2.8, hitR: 1.7,
    drops: { meat: 4, hide: 4 }, aggro: 28, lvl: [8, 35], count: 6, herd: 2, zone: (h) => h > 8 && h < 32, far: 140,
  },
  skyreach: {
    name: 'Skyreach', diet: 'herb', temper: 'neutral', hp: 3200, dmg: 55, walk: 2.4, run: 4.5, torpor: 2200,
    tameFood: 'berries', tameBase: 30, tameLvl: 0.6, rideable: true, radius: 4.2, reach: 7, hitR: 5.5, wade: true,
    drops: { meat: 16, hide: 12 }, aggro: 0, lvl: [10, 40], count: 3, zone: (h) => h > 3 && h < 18, far: 100,
  },
  glowtail: {
    name: 'Glowtail', diet: 'herb', temper: 'skittish', hp: 60, dmg: 2, walk: 2, run: 8, torpor: 40, glow: [0.2, 0.9, 1], lightPet: true,
    tameFood: 'berries', tameBase: 4, tameLvl: 0.08, rideable: false, radius: 0.45, reach: 1, hitR: 0.8,
    drops: { meat: 1, crystal: 1 }, aggro: 0, lvl: [1, 20], count: 8, herd: 3, zone: (h) => h > 5 && h < 28,
  },
  divebeak: {
    name: 'Divebeak', diet: 'carn', temper: 'skittish', hp: 90, dmg: 6, walk: 1.6, run: 4, fly: 18, torpor: 70, flyer: true, gatherer: true,
    tameFood: 'meat', tameBase: 5, tameLvl: 0.12, rideable: false, radius: 0.7, reach: 1.6, hitR: 1.2,
    drops: { meat: 2, hide: 1 }, aggro: 0, lvl: [1, 25], count: 6, zone: (h) => h > 1 && h < 8,
  },
  shieldhorn: {
    name: 'Shieldhorn', diet: 'herb', temper: 'neutral', hp: 460, dmg: 24, walk: 2.4, run: 9, torpor: 320, charge: true,
    tameFood: 'berries', tameBase: 12, tameLvl: 0.3, rideable: true, radius: 1.9, reach: 3.8, hitR: 2.4,
    drops: { meat: 6, hide: 5 }, aggro: 0, lvl: [1, 30], count: 8, herd: 3, zone: (h) => h > 4 && h < 22,
  },
  shellback: {
    name: 'Shellback', diet: 'herb', temper: 'neutral', hp: 900, dmg: 18, walk: 1.2, run: 2.4, torpor: 600, shell: true, armor: 0.3, wade: true,
    tameFood: 'berries', tameBase: 14, tameLvl: 0.3, rideable: true, radius: 1.9, reach: 3, hitR: 2.3,
    drops: { meat: 8, hide: 10 }, aggro: 0, lvl: [1, 35], count: 5, zone: (h) => h > 0.8 && h < 3.5,
  },
  leafshade: {
    name: 'Leafshade', diet: 'carn', temper: 'aggressive', hp: 300, dmg: 20, walk: 2.6, run: 11, torpor: 220, camo: true,
    tameFood: 'meat', tameBase: 9, tameLvl: 0.22, rideable: true, radius: 1.1, reach: 2.8, hitR: 1.7,
    drops: { meat: 4, hide: 4 }, aggro: 10, lvl: [5, 35], count: 6, zone: (h) => h > 6 && h < 26, far: 120,
  },
  voltfin: {
    name: 'Voltfin', diet: 'carn', temper: 'aggressive', hp: 150, dmg: 9, walk: 3, run: 9, swim: 8, torpor: 110, swimmer: true, shock: true, glow: [1, 0.9, 0.2],
    tameFood: 'meat', tameBase: 6, tameLvl: 0.15, rideable: false, radius: 0.7, reach: 1.8, hitR: 1.1,
    drops: { meat: 2, crystal: 1 }, aggro: 18, lvl: [3, 30], count: 6, herd: 2, zone: (h) => h < -2.5 && h > -12,
  },
  mossback: {
    name: 'Mossback', diet: 'herb', temper: 'neutral', hp: 780, dmg: 20, walk: 1.6, run: 4.5, torpor: 520, healer: true, glow: [0.25, 0.8, 0.2],
    tameFood: 'berries', tameBase: 14, tameLvl: 0.32, rideable: true, radius: 2.0, reach: 3.8, hitR: 2.5,
    drops: { meat: 8, hide: 5, herb: 4 }, aggro: 0, lvl: [5, 35], count: 4, zone: (h) => h > 3 && h < 20,
  },
  sandmaw: {
    name: 'Sandmaw', diet: 'carn', temper: 'aggressive', hp: 360, dmg: 20, walk: 2, run: 8, torpor: 260, burrow: true,
    tameFood: 'meat', tameBase: 10, tameLvl: 0.25, rideable: true, radius: 1.3, reach: 3, hitR: 1.8,
    drops: { meat: 5, hide: 5 }, aggro: 22, lvl: [5, 35], count: 5, zone: (h) => h > 1 && h < 5, far: 120,
  },
  howler: {
    name: 'Howler', diet: 'carn', temper: 'aggressive', hp: 210, dmg: 11, walk: 3, run: 11.5, torpor: 160, howl: true,
    tameFood: 'meat', tameBase: 8, tameLvl: 0.2, rideable: true, radius: 1.0, reach: 2.6, hitR: 1.5,
    drops: { meat: 3, pelt: 1, hide: 2 }, aggro: 26, lvl: [5, 35], count: 8, herd: 4, zone: (h) => h > 8 && h < 30, far: 130,
  },
  gorgonax: {
    name: 'Gorgonax', diet: 'carn', temper: 'aggressive', hp: 1100, dmg: 48, walk: 3.2, run: 10, torpor: 700,
    tameFood: 'meat', tameBase: 14, tameLvl: 0.3, rideable: true, radius: 2.6, reach: 5.5, hitR: 3.2,
    drops: { meat: 12, hide: 8 }, aggro: 45, lvl: [15, 45], count: 2, zone: (h, x, z) => z < -90 && h > 10 && h < 45, far: 250,
  },
};

export const BOSS_TYRANT = { kind: 'tyrant', species: 'gorgonax', name: 'The Primal Tyrant', hp: 16000, dmg: 70, scale: 2.1, minions: ['talonrunner', 4, 30], phases: [0.5], abilities: ['stomp'] };

const PREY = {
  talonrunner: ['pudgewing', 'dashbeak', 'crestcaller'],
  bogmaw: ['reedhorn', 'pudgewing', 'dashbeak'],
  rimeclaw: ['frosthorn', 'pudgewing'],
  hornjaw: ['pudgewing', 'crestcaller', 'reedhorn', 'dashbeak', 'dashstrider'],
  howler: ['dashstrider', 'pudgewing', 'crestcaller', 'glowtail'],
  sandmaw: ['pudgewing', 'divebeak', 'dashstrider'],
  voltfin: ['glimmerfin'],
  leafshade: ['dashstrider', 'pudgewing', 'glowtail', 'eggthief'],
  bloodclaw: ['dashstrider', 'pudgewing', 'eggthief', 'crestcaller'],
  nightstalker: ['dashstrider', 'crestcaller', 'trikeros', 'plateback', 'reedhorn'],
  frillspitter: ['pudgewing', 'dashbeak'],
  dashbeak: ['pudgewing'],
  thunderwing: ['pudgewing', 'dashbeak', 'crestcaller', 'galewing'],
  deepjaw: ['glimmerfin'],
  spinesail: ['pudgewing', 'crestcaller', 'dashbeak', 'trikeros'],
  gorgonax: ['pudgewing', 'trikeros', 'talonrunner', 'crestcaller', 'domehead', 'ironhide'],
};

// ---------------- Model builders ----------------
function buildQuadTrikeros(mat, col) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 2.0; root.add(body);
  body.add(meshOf([
    E(1.35, 1.25, 2.3, base, 0, 0, 0),
    E(1.15, 0.8, 1.9, belly, 0, -0.55, 0.1),
    E(1.2, 1.15, 1.2, base, 0, 0.1, -1.4),
    ...[0, 1, 2, 3, 4].map((i) => K(0.18, 0.5, accent, 0, 1.15 - Math.abs(i - 2) * 0.05, 1.3 - i * 0.65)),
  ], mat));
  const legs = [];
  const legDef = [[-0.95, 1.35, 0], [0.95, 1.35, Math.PI], [-0.95, -1.5, Math.PI], [0.95, -1.5, 0]];
  for (const [x, z, ph] of legDef) {
    const g = new THREE.Group(); g.position.set(x, -0.4, z); body.add(g);
    g.add(meshOf([Cy(0.42, 1.0, base, 0, -0.35, 0), Cy(0.34, 1.0, base, 0, -1.1, 0), Cy(0.4, 0.25, horn, 0, -1.55, 0.05)], mat));
    legs.push({ g, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.25, 2.1); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.1, 0.9); neck.add(head);
  head.add(meshOf([
    E(0.75, 0.7, 1.1, base, 0, 0, 0.3),
    E(0.55, 0.45, 0.6, belly, 0, -0.35, 0.9),
    K(0.3, 0.7, horn, 0, -0.05, 1.5, Math.PI / 2, 0, 0),           // beak
    K(0.16, 1.6, horn, -0.45, 0.75, 0.4, 0.9, 0, 0),               // brow horns
    K(0.16, 1.6, horn, 0.45, 0.75, 0.4, 0.9, 0, 0),
    K(0.12, 0.5, horn, 0, 0.35, 1.2, 0.6, 0, 0),                   // nose horn
    E(1.9, 1.5, 0.18, accent, 0, 0.75, -0.55, -0.45, 0, 0),         // frill
    E(1.7, 1.3, 0.2, base, 0, 0.7, -0.5, -0.45, 0, 0),
    E(0.12, 0.12, 0.12, 0x111111, -0.55, 0.25, 0.75), E(0.12, 0.12, 0.12, 0x111111, 0.55, 0.25, 0.75),
  ], mat));
  const tail = []; let parent = body; let z = -2.1;
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group(); t.position.set(0, i === 0 ? 0.1 : 0, i === 0 ? z : -1.1); parent.add(t);
    const r = 0.7 * (1 - i * 0.22);
    t.add(meshOf([E(r, r * 0.9, 0.8, base, 0, -0.05 * i, -0.5)], mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs, neck, head, tail, hipH: 2.0, lie: 1.3, quad: true };
}

function buildBiped(mat, col, s, opts) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = opts.hip * s; root.add(body);
  const bl = opts.bodyLen * s;
  body.add(meshOf([
    E(0.55 * s * opts.girth, 0.6 * s * opts.girth, bl, base, 0, 0, 0, -0.08, 0, 0),
    E(0.45 * s * opts.girth, 0.4 * s * opts.girth, bl * 0.85, belly, 0, -0.25 * s, 0.1 * s),
    ...Array.from({ length: opts.stripes }, (_, i) => E(0.57 * s * opts.girth, 0.15 * s, 0.12 * s, accent, 0, 0.12 * s, bl * 0.7 - i * bl * 0.3, -0.08, 0, 0)),
    // dorsal sail: a membrane braced by spines
    ...(opts.sail ? [
      E(0.035 * s, 0.85 * s, bl * 0.85, accent, 0, 0.75 * s, 0),
      ...Array.from({ length: 7 }, (_, i) => Cy(0.03 * s, (1.5 - Math.abs(i - 3) * 0.28) * s, horn, 0, 0.5 * s + (0.75 - Math.abs(i - 3) * 0.14) * s * 0.5, bl * 0.75 - i * bl * 0.25)),
    ] : []),
    // back plates of armoured bipeds
    ...(opts.knobs ? Array.from({ length: 5 }, (_, i) => K(0.09 * s, 0.22 * s, horn, 0, 0.55 * s * opts.girth, bl * 0.6 - i * bl * 0.3)) : []),
  ], mat));
  // arms
  for (const x of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(x * 0.4 * s * opts.girth, -0.2 * s, bl * 0.75); body.add(a);
    a.add(meshOf([Cy(0.08 * s * opts.arm, 0.55 * s * opts.arm, base, 0, -0.25 * s * opts.arm, 0.1 * s, 0.5, 0, 0), K(0.05 * s, 0.25 * s, horn, 0, -0.55 * s * opts.arm, 0.3 * s, 2.2, 0, 0),
      ...(opts.claws ? [0, 1, 2].map((k) => K(0.04 * s, 0.9 * s, horn, (k - 1) * 0.07 * s, -0.75 * s * opts.arm, 0.55 * s, 2.0, 0, (k - 1) * 0.15)) : [])], mat));
    a.rotation.x = 0.4;
  }
  const legs = [];
  for (const [x, ph] of [[-1, 0], [1, Math.PI]]) {
    const g = new THREE.Group(); g.position.set(x * 0.4 * s * opts.girth, -0.1 * s, -0.1 * s); body.add(g);
    const th = opts.hip * 0.55 * s;
    g.add(meshOf([E(0.3 * s * opts.girth, th * 0.6, 0.38 * s * opts.girth, base, 0, -th * 0.4, 0.05 * s)], mat));
    const knee = new THREE.Group(); knee.position.set(0, -th * 0.85, 0.1 * s); g.add(knee);
    const sh = opts.hip * 0.6 * s;
    knee.add(meshOf([
      Cy(0.11 * s * opts.girth, sh, base, 0, -sh / 2, -0.15 * s, -0.35, 0, 0),
      E(0.2 * s, 0.07 * s, 0.35 * s, horn, 0, -sh * 0.98, 0.05 * s),
      K(0.05 * s, 0.3 * s, horn, 0, -sh * 0.85, 0.35 * s, 1.6, 0, 0),
    ], mat));
    legs.push({ g, knee, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.2 * s, bl * 0.9); body.add(neck);
  neck.add(meshOf([Cy(0.28 * s * opts.girth * opts.neckW, 0.8 * s, base, 0, 0.25 * s, 0.25 * s, 0.9, 0, 0)], mat));
  const head = new THREE.Group(); head.position.set(0, 0.45 * s, 0.7 * s); neck.add(head);
  const hl = opts.headLen * s;
  head.add(meshOf([
    E(0.32 * s * opts.headW, 0.3 * s * opts.headW, hl, base, 0, 0, hl * 0.6),
    E(0.22 * s * opts.headW, 0.2 * s * opts.headW, hl * 0.7, base, 0, -0.02 * s, hl * 1.2),
    E(0.045 * s, 0.035 * s, 0.045 * s, 0xd8a020, -0.25 * s * opts.headW, 0.1 * s, hl * 0.45),
    E(0.045 * s, 0.035 * s, 0.045 * s, 0xd8a020, 0.25 * s * opts.headW, 0.1 * s, hl * 0.45),
    E(0.02 * s, 0.03 * s, 0.02 * s, 0x080808, -0.29 * s * opts.headW, 0.1 * s, hl * 0.47),
    E(0.02 * s, 0.03 * s, 0.02 * s, 0x080808, 0.29 * s * opts.headW, 0.1 * s, hl * 0.47),
    E(0.1 * s * opts.headW, 0.06 * s, 0.12 * s, accent, -0.2 * s * opts.headW, 0.2 * s, hl * 0.4),
    E(0.1 * s * opts.headW, 0.06 * s, 0.12 * s, accent, 0.2 * s * opts.headW, 0.2 * s, hl * 0.4),
    E(0.12 * s, 0.05 * s, hl * 0.6, accent, 0, 0.27 * s * opts.headW, hl * 0.4),
    ...(opts.crest ? [K(0.08 * s, 0.4 * s, accent, 0, 0.35 * s, hl * 0.2, -0.6, 0, 0)] : []),
    ...(opts.frill ? [E(0.04 * s, 0.42 * s, 0.38 * s, accent, -0.38 * s, 0.05 * s, hl * 0.1, 0, 0.5, 0.4), E(0.04 * s, 0.42 * s, 0.38 * s, accent, 0.38 * s, 0.05 * s, hl * 0.1, 0, -0.5, -0.4), K(0.05 * s, 0.35 * s, horn, -0.12 * s, 0.32 * s, hl * 0.5, -0.4, 0, 0.2), K(0.05 * s, 0.35 * s, horn, 0.12 * s, 0.32 * s, hl * 0.5, -0.4, 0, -0.2)] : []),
    ...(opts.horns ? [K(0.09 * s, 0.35 * s, horn, -0.2 * s * opts.headW, 0.32 * s, hl * 0.45, -0.2, 0, 0.5), K(0.09 * s, 0.35 * s, horn, 0.2 * s * opts.headW, 0.32 * s, hl * 0.45, -0.2, 0, -0.5)] : []),
    // long crocodile-like snout
    ...(opts.snout ? [E(0.13 * s, 0.11 * s, hl * 0.9, base, 0, -0.04 * s, hl * 1.9), E(0.16 * s, 0.1 * s, 0.14 * s, accent, 0, 0.0, hl * 2.65)] : []),
    // hollow tube crest sweeping back from the head
    ...(opts.tubeCrest ? [Cy(0.075 * s, 1.15 * s, accent, 0, 0.42 * s, -hl * 0.15, -1.05, 0, 0), E(0.09 * s, 0.09 * s, 0.09 * s, accent, 0, 0.66 * s, -hl * 0.55)] : []),
    // thick bony dome ringed with knobs
    ...(opts.dome ? [
      E(0.27 * s * opts.headW, 0.22 * s, 0.28 * s, accent, 0, 0.24 * s, hl * 0.4),
      ...Array.from({ length: 7 }, (_, i) => { const a = (i / 6) * Math.PI; return K(0.035 * s, 0.08 * s, horn, Math.cos(a) * 0.27 * s * opts.headW, 0.12 * s + Math.sin(a) * 0.05 * s, hl * 0.1, -0.4, 0, (a - Math.PI / 2) * -1); }),
    ] : []),
    ...(opts.beak ? [K(0.12 * s * opts.headW, 0.3 * s, horn, 0, -0.04 * s, hl * 1.6, Math.PI / 2, 0, 0)] : []),
  ], mat));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.12 * s, hl * 0.15); head.add(jaw);
  jaw.add(meshOf([
    E(0.26 * s * opts.headW, 0.12 * s, hl * 0.8, belly, 0, -0.06 * s, hl * 0.55),
    ...(opts.beak ? [] : Array.from({ length: opts.snout ? 12 : 6 }, (_, i) => K(0.025 * s, 0.1 * s, 0xf4eedb, (i % 2 ? 1 : -1) * 0.18 * s * opts.headW * (opts.snout && i > 5 ? 0.6 : 1), 0.05 * s, hl * (0.4 + i * 0.13), Math.PI))),
    ...(opts.snout ? [E(0.11 * s, 0.07 * s, hl * 0.9, belly, 0, -0.06 * s, hl * 1.75)] : []),
  ], mat));
  const tail = []; let parent = body;
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Group(); t.position.set(0, i === 0 ? 0.05 * s : 0, i === 0 ? -bl * 0.85 : -opts.tailSeg * s); parent.add(t);
    const r = 0.42 * s * opts.girth * (1 - i * 0.18);
    t.add(meshOf([E(r, r * 0.9, opts.tailSeg * s * 0.6, i % 2 ? accent : base, 0, 0, -opts.tailSeg * s * 0.5, 0.06, 0, 0)], mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs, neck, head, jaw, tail, hipH: opts.hip * s, lie: 0.55 * s * opts.girth, quad: false };
}

function buildIronhide(mat, col) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 1.35; root.add(body);
  const plates = [];
  for (let i = 0; i < 6; i++) for (const x of [-1, 0, 1]) {
    const z = 1.6 - i * 0.62;
    plates.push(K(0.2 - Math.abs(x) * 0.04, 0.32, i % 2 ? accent : horn, x * 0.6, 0.82 - Math.abs(x) * 0.18, z, 0, 0, -x * 0.5));
  }
  for (let i = 0; i < 5; i++) for (const x of [-1, 1]) plates.push(K(0.16, 0.7, horn, x * 1.55, 0.05, 1.3 - i * 0.65, 0, 0, -x * Math.PI / 2));
  body.add(meshOf([E(1.6, 0.85, 2.2, base, 0, 0, 0), E(1.35, 0.5, 1.9, belly, 0, -0.42, 0), E(1.62, 0.3, 2.1, accent, 0, 0.45, 0), ...plates], mat));
  const legs = [];
  for (const [x, z, ph] of [[-1.05, 1.3, 0], [1.05, 1.3, Math.PI], [-1.05, -1.35, Math.PI], [1.05, -1.35, 0]]) {
    const g = new THREE.Group(); g.position.set(x, -0.45, z); body.add(g);
    g.add(meshOf([Cy(0.36, 0.9, base, 0, -0.35, 0), Cy(0.4, 0.2, horn, 0, -0.85, 0.05)], mat));
    legs.push({ g, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, -0.05, 2.0); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, -0.05, 0.6); neck.add(head);
  head.add(meshOf([E(0.62, 0.45, 0.75, base, 0, 0, 0.2), E(0.64, 0.12, 0.5, accent, 0, 0.32, 0.1),
    K(0.12, 0.45, horn, -0.55, 0.25, -0.2, -1.6, 0, 0.6), K(0.12, 0.45, horn, 0.55, 0.25, -0.2, -1.6, 0, -0.6),
    K(0.25, 0.35, horn, 0, -0.08, 0.95, Math.PI / 2, 0, 0),
    E(0.07, 0.07, 0.07, 0x111111, -0.45, 0.1, 0.55), E(0.07, 0.07, 0.07, 0x111111, 0.45, 0.1, 0.55)], mat));
  const tail = []; let parent = body;
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Group(); t.position.set(0, 0, i === 0 ? -2.0 : -0.85); parent.add(t);
    const r = 0.6 * (1 - i * 0.17);
    const parts = [E(r, r * 0.75, 0.6, base, 0, 0, -0.45), K(0.08, 0.3, horn, -r, 0, -0.4, 0, 0, Math.PI / 2), K(0.08, 0.3, horn, r, 0, -0.4, 0, 0, -Math.PI / 2)];
    if (i === 4) parts.push(E(0.55, 0.4, 0.5, horn, 0, 0, -0.95), E(0.4, 0.42, 0.35, accent, 0, 0.05, -0.95));
    t.add(meshOf(parts, mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs, neck, head, tail, hipH: 1.35, lie: 1.0, quad: true };
}

// Pterosaur: two-segment membrane wings that flap in flight and fold on the ground.
function wingParts(s, side, col) {
  const membrane = (len, w0, w1, z0) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, z0, 0, 0, z0 - w0, len, 0, z0 - w1 * 0.4, 0, 0, z0, len, 0, z0 - w1 * 0.4, len, 0, z0 + 0.12], 3));
    g.computeVertexNormals();
    return g;
  };
  const m = (x) => mtx(0, 0, 0, 0, 0, 0, side, 1, 1).multiply(x || new THREE.Matrix4());
  const inner = [
    { geo: membrane(1.5 * s, 0.95 * s, 0.75 * s, 0.25 * s), color: col.accent, matrix: m() },
    { geo: CYL, color: col.base, matrix: m(mtx(0.75 * s, 0.02, 0.25 * s, 0, 0, Math.PI / 2, 0.06 * s, 1.5 * s, 0.06 * s)) },
  ];
  const outer = [
    { geo: membrane(1.7 * s, 0.75 * s, 0.1 * s, 0.37 * s), color: col.accent, matrix: m() },
    { geo: CYL, color: col.base, matrix: m(mtx(0.85 * s, 0.02, 0.37 * s, 0, 0, Math.PI / 2, 0.04 * s, 1.7 * s, 0.04 * s)) },
    { geo: CONE, color: col.horn, matrix: m(mtx(0.05 * s, 0.05 * s, 0.42 * s, Math.PI / 2, 0, 0, 0.04 * s, 0.18 * s, 0.04 * s)) },
  ];
  return { inner, outer };
}

function buildFlyer(mat, col, s, big) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.95 * s; root.add(body);
  body.add(meshOf([E(0.32 * s, 0.3 * s, 0.75 * s, base, 0, 0, 0), E(0.26 * s, 0.22 * s, 0.6 * s, belly, 0, -0.1 * s, 0.05 * s),
    E(0.2 * s, 0.12 * s, 0.4 * s, accent, 0, 0.22 * s, 0.1 * s)], mat));
  const wings = [];
  for (const side of [1, -1]) {
    const g = new THREE.Group(); g.position.set(side * 0.25 * s, 0.12 * s, 0.25 * s); body.add(g);
    const parts = wingParts(s, side, col);
    g.add(meshOf(parts.inner, mat));
    const outer = new THREE.Group(); outer.position.set(side * 1.5 * s, 0, 0); g.add(outer);
    outer.add(meshOf(parts.outer, mat));
    wings.push({ g, outer, side });
  }
  const legs = [];
  for (const [x, ph] of [[-0.15, 0], [0.15, Math.PI]]) {
    const g = new THREE.Group(); g.position.set(x * s, -0.2 * s, -0.25 * s); body.add(g);
    g.add(meshOf([Cy(0.05 * s, 0.4 * s, base, 0, -0.2 * s, 0)], mat));
    const knee = new THREE.Group(); knee.position.set(0, -0.4 * s, 0); g.add(knee);
    knee.add(meshOf([Cy(0.035 * s, 0.35 * s, base, 0, -0.17 * s, 0), E(0.08 * s, 0.03 * s, 0.12 * s, horn, 0, -0.36 * s, 0.04 * s)], mat));
    legs.push({ g, knee, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.12 * s, 0.65 * s); body.add(neck);
  neck.add(meshOf([Cy(0.1 * s, 0.6 * s, base, 0, 0.2 * s, 0.15 * s, 0.7, 0, 0)], mat));
  const head = new THREE.Group(); head.position.set(0, 0.42 * s, 0.38 * s); neck.add(head);
  head.add(meshOf([
    E(0.16 * s, 0.18 * s, 0.3 * s, base, 0, 0, 0.05 * s),
    K(0.09 * s, 1.0 * s, horn, 0, 0.0, 0.62 * s, Math.PI / 2, 0, 0),
    K(big ? 0.1 * s : 0.08 * s, big ? 0.6 * s : 1.0 * s, accent, 0, 0.12 * s, -0.4 * s, -Math.PI / 2 - 0.35, 0, 0),
    E(0.035 * s, 0.035 * s, 0.035 * s, 0x111111, -0.13 * s, 0.06 * s, 0.12 * s), E(0.035 * s, 0.035 * s, 0.035 * s, 0x111111, 0.13 * s, 0.06 * s, 0.12 * s),
  ], mat));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.06 * s, 0.1 * s); head.add(jaw);
  jaw.add(meshOf([K(0.06 * s, 0.85 * s, horn, 0, 0, 0.45 * s, Math.PI / 2, 0, 0)], mat));
  const t = new THREE.Group(); t.position.set(0, 0, -0.7 * s); body.add(t);
  t.add(meshOf([E(0.1 * s, 0.08 * s, 0.35 * s, base, 0, 0, -0.25 * s)], mat));
  return { root, body, legs, neck, head, jaw, tail: [t], wings, hipH: 0.95 * s, lie: 0.35 * s, quad: false };
}

function buildFish(mat, col) {
  const { base, belly, accent } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.3; root.add(body);
  body.add(meshOf([E(0.12, 0.17, 0.4, base, 0, 0, 0), E(0.1, 0.1, 0.32, belly, 0, -0.06, 0.02),
    K(0.04, 0.22, accent, 0, 0.18, -0.02, -0.4, 0, 0), E(0.03, 0.03, 0.03, 0x111111, -0.09, 0.05, 0.28), E(0.03, 0.03, 0.03, 0x111111, 0.09, 0.05, 0.28)], mat));
  const t = new THREE.Group(); t.position.set(0, 0, -0.36); body.add(t);
  t.add(meshOf([E(0.02, 0.17, 0.14, accent, 0, 0, -0.1)], mat));
  const neck = new THREE.Group(); body.add(neck);
  const head = new THREE.Group(); neck.add(head);
  return { root, body, legs: [], neck, head, tail: [t], hipH: 0.3, lie: 0.15, quad: false, swim: true };
}

function buildDeepjaw(mat, col) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.6; root.add(body);
  body.add(meshOf([E(0.95, 0.85, 2.4, base, 0, 0, 0), E(0.8, 0.5, 2.1, belly, 0, -0.4, 0),
    ...[0, 1, 2, 3, 4].map((i) => E(0.08, 0.2, 0.3, accent, 0, 0.82, 1.4 - i * 0.7))], mat));
  const legs = [];
  for (const [x, z, ph] of [[-0.9, 1.2, 0], [0.9, 1.2, Math.PI], [-0.8, -1.3, Math.PI], [0.8, -1.3, 0]]) {
    const g = new THREE.Group(); g.position.set(x, -0.35, z); body.add(g);
    g.add(meshOf([E(0.55, 0.08, 0.3, base, Math.sign(x) * 0.5, -0.05, -0.1, 0, Math.sign(x) * 0.3, Math.sign(x) * -0.3)], mat));
    legs.push({ g, ph, flipper: Math.sign(x) });
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.05, 2.2); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.05, 0.4); neck.add(head);
  head.add(meshOf([E(0.6, 0.45, 0.9, base, 0, 0.05, 0.6), E(0.4, 0.28, 0.8, base, 0, 0.05, 1.4),
    E(0.08, 0.08, 0.08, 0xd8a020, -0.45, 0.25, 0.75), E(0.08, 0.08, 0.08, 0xd8a020, 0.45, 0.25, 0.75),
    ...Array.from({ length: 10 }, (_, i) => K(0.04, 0.16, 0xf4eedb, (i % 2 ? 1 : -1) * 0.3, -0.18, 0.5 + i * 0.13, Math.PI))], mat));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.15, 0.3); head.add(jaw);
  jaw.add(meshOf([E(0.5, 0.18, 1.1, belly, 0, -0.05, 0.8), ...Array.from({ length: 8 }, (_, i) => K(0.035, 0.14, 0xf4eedb, (i % 2 ? 1 : -1) * 0.26, 0.08, 0.4 + i * 0.14))], mat));
  const tail = []; let parent = body;
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Group(); t.position.set(0, 0, i === 0 ? -2.3 : -1.0); parent.add(t);
    const r = 0.75 * (1 - i * 0.14);
    const parts = [E(r, r * 0.85, 0.7, base, 0, 0, -0.5)];
    if (i === 5) parts.push(E(0.06, 0.9, 0.5, accent, 0, 0.3, -0.9, 0.4, 0, 0));
    t.add(meshOf(parts, mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs, neck, head, jaw, tail, hipH: 0.6, lie: 0.8, quad: true, swim: true };
}

function buildBogmaw(mat, col) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.55; root.add(body);
  body.add(meshOf([E(0.85, 0.45, 1.9, base, 0, 0, 0), E(0.7, 0.25, 1.7, belly, 0, -0.22, 0),
    ...Array.from({ length: 9 }, (_, i) => E(0.12, 0.1, 0.16, accent, (i % 2 ? 1 : -1) * 0.3, 0.42, 1.4 - i * 0.35))], mat));
  const legs = [];
  for (const [x, z, ph] of [[-0.75, 1.1, 0], [0.75, 1.1, Math.PI], [-0.75, -1.1, Math.PI], [0.75, -1.1, 0]]) {
    const g = new THREE.Group(); g.position.set(x, -0.15, z); body.add(g);
    g.add(meshOf([Cy(0.16, 0.6, base, Math.sign(x) * 0.2, -0.2, 0, 0, 0, Math.sign(x) * 0.7), E(0.2, 0.06, 0.26, horn, Math.sign(x) * 0.42, -0.45, 0.08)], mat));
    legs.push({ g, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.05, 1.8); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.02, 0.2); neck.add(head);
  head.add(meshOf([E(0.42, 0.26, 0.55, base, 0, 0.05, 0.3), E(0.26, 0.16, 0.9, base, 0, 0.02, 1.2),
    E(0.07, 0.07, 0.07, 0xd8c040, -0.28, 0.24, 0.35), E(0.07, 0.07, 0.07, 0xd8c040, 0.28, 0.24, 0.35),
    ...Array.from({ length: 10 }, (_, i) => K(0.03, 0.12, 0xf0ead8, (i % 2 ? 1 : -1) * 0.2, -0.1, 0.6 + i * 0.12, Math.PI))], mat));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.1, 0.25); head.add(jaw);
  jaw.add(meshOf([E(0.24, 0.1, 0.95, belly, 0, -0.03, 0.9)], mat));
  const tail = []; let parent = body;
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Group(); t.position.set(0, 0, i === 0 ? -1.8 : -0.75); parent.add(t);
    const r = 0.5 * (1 - i * 0.14);
    t.add(meshOf([E(r * 0.9, r * 0.6, 0.55, base, 0, 0, -0.4), E(0.05, 0.12, 0.3, accent, 0, r * 0.55, -0.4)], mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs, neck, head, jaw, tail, hipH: 0.55, lie: 0.5, quad: true };
}

function buildReedhorn(mat, col) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 1.9; root.add(body);
  body.add(meshOf([E(1.1, 1.15, 2.2, base, 0, 0, 0), E(0.95, 0.75, 1.9, belly, 0, -0.5, 0.1),
    ...Array.from({ length: 5 }, (_, i) => E(1.12, 0.12, 0.18, accent, 0, 0.55, 1.2 - i * 0.55))], mat));
  const legs = [];
  for (const [x, z, ph, len] of [[-0.75, 1.3, 0, 1.3], [0.75, 1.3, Math.PI, 1.3], [-0.8, -1.2, Math.PI, 1.9], [0.8, -1.2, 0, 1.9]]) {
    const g = new THREE.Group(); g.position.set(x, -0.5, z); body.add(g);
    g.add(meshOf([Cy(len > 1.5 ? 0.42 : 0.24, len, base, 0, -len / 2 + 0.2, 0), E(0.3, 0.1, 0.36, horn, 0, -len + 0.25, 0.08)], mat));
    legs.push({ g, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.5, 2.0); body.add(neck);
  neck.add(meshOf([Cy(0.42, 1.4, base, 0, 0.45, 0.35, 0.75, 0, 0)], mat));
  const head = new THREE.Group(); head.position.set(0, 1.0, 0.9); neck.add(head);
  head.add(meshOf([E(0.42, 0.45, 0.65, base, 0, 0, 0.2), E(0.38, 0.12, 0.6, horn, 0, -0.18, 0.85),          // flat duck bill
    K(0.12, 0.9, accent, 0, 0.5, -0.1, -0.5, 0, 0), E(0.07, 0.07, 0.07, 0x111111, -0.36, 0.12, 0.35), E(0.07, 0.07, 0.07, 0x111111, 0.36, 0.12, 0.35)], mat));
  const tail = []; let parent = body;
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Group(); t.position.set(0, i === 0 ? 0.2 : 0, i === 0 ? -2.0 : -1.0); parent.add(t);
    const r = 0.65 * (1 - i * 0.17);
    t.add(meshOf([E(r * 0.8, r, 0.75, base, 0, 0, -0.5)], mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs, neck, head, tail, hipH: 1.9, lie: 1.1, quad: true };
}

function buildPlateback(mat, col, quills = false) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 1.9; root.add(body);
  const plates = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8, h = 0.5 + Math.sin(t * Math.PI) * 0.6;
    for (const x of [-1, 1]) plates.push(quills
      ? K(0.07, 0.9 + h * 0.6, i % 2 ? accent : horn, x * (0.5 + h * 0.3), 0.9 + h * 0.2, 1.6 - t * 3.4, -0.35, 0, -x * 0.7)
      : E(0.06, h, 0.32, i % 2 ? accent : horn, x * 0.14, 1.0 + h * 0.6 - 0.25 + Math.sin(t * Math.PI) * 0.25, 1.6 - t * 3.4 + (x > 0 ? 0.18 : 0), 0, 0, x * 0.12));
  }
  body.add(meshOf([E(1.1, 1.15, 2.2, base, 0, 0.1, 0), E(0.95, 0.7, 1.9, belly, 0, -0.5, 0.1), ...plates], mat));
  const legs = [];
  for (const [x, z, ph, len] of [[-0.75, 1.3, 0, 1.3], [0.75, 1.3, Math.PI, 1.3], [-0.8, -1.2, Math.PI, 1.8], [0.8, -1.2, 0, 1.8]]) {
    const g = new THREE.Group(); g.position.set(x, -0.5, z); body.add(g);
    g.add(meshOf([Cy(len > 1.5 ? 0.42 : 0.3, len, base, 0, -len / 2 + 0.2, 0), E(0.34, 0.1, 0.4, horn, 0, -len + 0.25, 0.06)], mat));
    legs.push({ g, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, -0.3, 2.0); body.add(neck);
  neck.add(meshOf([Cy(0.32, 0.9, base, 0, -0.1, 0.35, 1.2, 0, 0)], mat));
  const head = new THREE.Group(); head.position.set(0, -0.35, 0.85); neck.add(head);
  head.add(meshOf([E(0.3, 0.28, 0.55, base, 0, 0, 0.2), E(0.06, 0.06, 0.06, 0x111111, -0.25, 0.1, 0.35), E(0.06, 0.06, 0.06, 0x111111, 0.25, 0.1, 0.35), K(0.12, 0.3, horn, 0, -0.05, 0.75, Math.PI / 2, 0, 0)], mat));
  const tail = []; let parent = body;
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Group(); t.position.set(0, i === 0 ? 0.25 : 0, i === 0 ? -2.0 : -0.95); parent.add(t);
    const r = 0.6 * (1 - i * 0.16);
    const parts = [E(r * 0.85, r, 0.7, base, 0, 0, -0.5)];
    if (i === 4) for (const [x, y] of [[-1, 1], [1, 1], [-1, -0.2], [1, -0.2]]) parts.push(K(0.08, 0.9, horn, x * 0.3, y * 0.2 + 0.1, -0.6, 0, 0, -x * (Math.PI / 2 - 0.4)));
    t.add(meshOf(parts, mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs, neck, head, tail, hipH: 1.9, lie: 1.1, quad: true };
}

function buildLongfin(mat, col) {
  const { base, belly, accent } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.6; root.add(body);
  body.add(meshOf([E(1.1, 0.75, 1.9, base, 0, 0, 0), E(0.95, 0.45, 1.7, belly, 0, -0.35, 0), ...[0, 1, 2, 3].map((i) => E(0.5, 0.1, 0.3, accent, 0, 0.7, 1 - i * 0.6))], mat));
  const legs = [];
  for (const [x, z, ph] of [[-1, 0.9, 0], [1, 0.9, Math.PI], [-0.9, -1.0, Math.PI], [0.9, -1.0, 0]]) {
    const g = new THREE.Group(); g.position.set(x, -0.2, z); body.add(g);
    g.add(meshOf([E(0.9, 0.08, 0.35, base, Math.sign(x) * 0.8, -0.05, -0.15, 0, Math.sign(x) * 0.35, Math.sign(x) * -0.2)], mat));
    legs.push({ g, ph, flipper: Math.sign(x) });
  }
  // long neck reaching forward and up
  const neck = new THREE.Group(); neck.position.set(0, 0.25, 1.7); body.add(neck);
  const nparts = [];
  for (let i = 0; i < 7; i++) nparts.push(E(0.32 - i * 0.025, 0.32 - i * 0.025, 0.5, base, 0, i * 0.32, 0.3 + i * 0.42, -0.6, 0, 0));
  neck.add(meshOf(nparts, mat));
  const head = new THREE.Group(); head.position.set(0, 2.3, 3.2); neck.add(head);
  head.add(meshOf([E(0.24, 0.2, 0.42, base, 0, 0, 0.2), E(0.14, 0.1, 0.32, belly, 0, -0.08, 0.5), E(0.05, 0.05, 0.05, 0x111111, -0.18, 0.08, 0.3), E(0.05, 0.05, 0.05, 0x111111, 0.18, 0.08, 0.3)], mat));
  const tail = []; let parent = body;
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group(); t.position.set(0, 0, i === 0 ? -1.8 : -0.7); parent.add(t);
    const r = 0.5 * (1 - i * 0.2);
    t.add(meshOf([E(r, r * 0.7, 0.5, base, 0, 0, -0.4)], mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs, neck, head, tail, hipH: 0.6, lie: 0.8, quad: true, swim: true };
}

function buildShellback(mat, col) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.9; root.add(body);
  const scutes = [];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + i; scutes.push(E(0.45, 0.12, 0.45, accent, Math.cos(a) * (0.5 + i * 0.35), 1.05 - i * 0.25, Math.sin(a) * (0.6 + i * 0.4), 0.2 * Math.sin(a), 0, -0.2 * Math.cos(a))); }
  body.add(meshOf([E(1.7, 1.1, 2.0, horn, 0, 0.2, 0), E(1.6, 0.35, 1.9, belly, 0, -0.45, 0), E(1.75, 0.25, 2.05, base, 0, -0.15, 0), ...scutes], mat));
  const legs = [];
  for (const [x, z, ph] of [[-1.2, 1.1, 0], [1.2, 1.1, Math.PI], [-1.2, -1.1, Math.PI], [1.2, -1.1, 0]]) {
    const g = new THREE.Group(); g.position.set(x, -0.35, z); body.add(g);
    g.add(meshOf([Cy(0.32, 0.8, base, 0, -0.3, 0), E(0.38, 0.12, 0.42, base, 0, -0.7, 0.08)], mat));
    legs.push({ g, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, -0.05, 1.8); body.add(neck);
  neck.add(meshOf([Cy(0.3, 0.8, base, 0, 0, 0.3, 1.3, 0, 0)], mat));
  const head = new THREE.Group(); head.position.set(0, 0.1, 0.75); neck.add(head);
  head.add(meshOf([E(0.38, 0.32, 0.5, base, 0, 0, 0.15), K(0.18, 0.3, horn, 0, -0.05, 0.62, Math.PI / 2, 0, 0), E(0.06, 0.06, 0.06, 0x111111, -0.3, 0.12, 0.3), E(0.06, 0.06, 0.06, 0x111111, 0.3, 0.12, 0.3)], mat));
  const t = new THREE.Group(); t.position.set(0, -0.1, -1.9); body.add(t);
  t.add(meshOf([K(0.25, 0.7, base, 0, 0, -0.3, -Math.PI / 2, 0, 0)], mat));
  return { root, body, legs, neck, head, tail: [t], hipH: 0.9, lie: 1.0, quad: true };
}

function buildGlowtail(mat, col) {
  const { base, belly, accent } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.32; root.add(body);
  body.add(meshOf([E(0.22, 0.18, 0.45, base, 0, 0, 0), E(0.18, 0.1, 0.38, belly, 0, -0.08, 0.02), ...[0, 1, 2, 3].map((i) => E(0.06, 0.06, 0.06, accent, 0, 0.17, 0.3 - i * 0.2))], mat));
  const legs = [];
  for (const [x, z, ph] of [[-0.18, 0.25, 0], [0.18, 0.25, Math.PI], [-0.18, -0.22, Math.PI], [0.18, -0.22, 0]]) {
    const g = new THREE.Group(); g.position.set(x, -0.1, z); body.add(g);
    g.add(meshOf([Cy(0.04, 0.24, base, 0, -0.1, 0)], mat)); legs.push({ g, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.05, 0.42); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.04, 0.1); neck.add(head);
  head.add(meshOf([E(0.13, 0.11, 0.2, base, 0, 0, 0.05), E(0.04, 0.04, 0.04, 0x111111, -0.1, 0.05, 0.1), E(0.04, 0.04, 0.04, 0x111111, 0.1, 0.05, 0.1)], mat));
  const tail = []; let parent = body;
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group(); t.position.set(0, 0, i === 0 ? -0.42 : -0.2); parent.add(t);
    t.add(meshOf([E(0.08 * (1 - i * 0.15), 0.07, 0.14, i === 3 ? accent : base, 0, 0, -0.1), ...(i === 3 ? [E(0.12, 0.12, 0.12, accent, 0, 0, -0.22)] : [])], mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs, neck, head, tail, hipH: 0.32, lie: 0.2, quad: true };
}

function buildEel(mat, col) {
  const { base, belly, accent } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.4; root.add(body);
  body.add(meshOf([E(0.28, 0.32, 0.7, base, 0, 0, 0), E(0.2, 0.18, 0.6, belly, 0, -0.12, 0.05), E(0.04, 0.3, 0.5, accent, 0, 0.32, 0)], mat));
  const neck = new THREE.Group(); neck.position.set(0, 0, 0.6); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0, 0.1); neck.add(head);
  head.add(meshOf([E(0.24, 0.22, 0.38, base, 0, 0, 0.2), E(0.05, 0.05, 0.05, 0xffee66, -0.18, 0.1, 0.32), E(0.05, 0.05, 0.05, 0xffee66, 0.18, 0.1, 0.32)], mat));
  const tail = []; let parent = body;
  for (let i = 0; i < 7; i++) {
    const t = new THREE.Group(); t.position.set(0, 0, i === 0 ? -0.6 : -0.42); parent.add(t);
    const r = 0.26 * (1 - i * 0.11);
    t.add(meshOf([E(r, r * 1.1, 0.3, i % 2 ? accent : base, 0, 0, -0.2), E(0.03, r * 1.3, 0.25, accent, 0, r * 0.9, -0.2)], mat));
    tail.push(t); parent = t;
  }
  return { root, body, legs: [], neck, head, tail, hipH: 0.4, lie: 0.3, quad: false, swim: true };
}

function buildSauropod(mat, col) {
  const { base, belly, accent } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 5.2; root.add(body);
  body.add(meshOf([E(2.6, 2.4, 4.6, base, 0, 0, 0), E(2.2, 1.6, 4.0, belly, 0, -1.2, 0),
    ...[0, 1, 2, 3, 4, 5].map((i) => E(0.5, 0.25, 0.4, accent, 0, 2.3, 3 - i * 1.2))], mat));
  const legs = [];
  for (const [x, z, ph] of [[-1.7, 2.6, 0], [1.7, 2.6, Math.PI], [-1.7, -2.6, Math.PI], [1.7, -2.6, 0]]) {
    const g = new THREE.Group(); g.position.set(x, -1.2, z); body.add(g);
    g.add(meshOf([Cy(0.9, 4.3, base, 0, -2.0, 0), Cy(1.05, 0.5, 0x5a5048, 0, -4.0, 0)], mat));
    legs.push({ g, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, 1.0, 4.0); body.add(neck);
  const segs = []; let p = neck;
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Group(); s.position.set(0, i === 0 ? 0 : 2.0, i === 0 ? 0 : 0.2); p.add(s);
    const r = 1.2 - i * 0.16;
    s.add(meshOf([E(r, 1.35, r, base, 0, 1.0, 0.1), Cy(r * 0.88, 2.3, base, 0, 1.1, 0.05), E(r * 0.8, 1.25, r * 0.6, belly, 0, 1.0, r * 0.42)], mat));
    s.rotation.x = i === 0 ? 0 : -0.12;
    segs.push(s); p = s;
  }
  neck.rotation.x = 0.95;
  const head = new THREE.Group(); head.position.set(0, 2.2, 0.3); p.add(head);
  head.add(meshOf([E(0.6, 0.55, 1.1, base, 0, 0, 0.5), E(0.1, 0.1, 0.1, 0x111111, -0.5, 0.2, 0.6), E(0.1, 0.1, 0.1, 0x111111, 0.5, 0.2, 0.6)], mat));
  head.rotation.x = 0.7;
  const tail = []; let parent = body;
  for (let i = 0; i < 7; i++) {
    const t = new THREE.Group(); t.position.set(0, 0, i === 0 ? -4.2 : -1.9); parent.add(t);
    const r = 1.6 * (1 - i * 0.13);
    t.add(meshOf([E(r, r * 0.9, 1.4, base, 0, 0, -1.0, 0.07, 0, 0)], mat));
    tail.push(t); parent = t;
  }
  tail[0].rotation.x = 0.15;
  return { root, body, legs, neck, neckSegs: segs, head, tail, hipH: 5.2, lie: 2.4, quad: true };
}

function buildPudge(mat, col) {
  const { base, belly, accent, horn } = col;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.55; root.add(body);
  body.add(meshOf([E(0.42, 0.42, 0.5, base, 0, 0.1, 0), E(0.33, 0.3, 0.38, belly, 0, -0.02, 0.15),
    E(0.12, 0.25, 0.3, accent, -0.38, 0.12, -0.05, 0, 0, 0.3), E(0.12, 0.25, 0.3, accent, 0.38, 0.12, -0.05, 0, 0, -0.3),
    K(0.15, 0.3, accent, 0, 0.2, -0.55, -2.2, 0, 0)], mat));
  const legs = [];
  for (const [x, ph] of [[-0.15, 0], [0.15, Math.PI]]) {
    const g = new THREE.Group(); g.position.set(x, -0.2, 0); body.add(g);
    g.add(meshOf([Cy(0.04, 0.35, horn, 0, -0.17, 0), E(0.09, 0.03, 0.12, horn, 0, -0.35, 0.05)], mat));
    legs.push({ g, ph });
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.35, 0.3); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.15, 0.05); neck.add(head);
  head.add(meshOf([E(0.2, 0.2, 0.22, base, 0, 0, 0), K(0.09, 0.32, horn, 0, -0.03, 0.3, Math.PI / 2 + 0.3, 0, 0),
    E(0.04, 0.04, 0.04, 0x111111, -0.15, 0.06, 0.1), E(0.04, 0.04, 0.04, 0x111111, 0.15, 0.06, 0.1)], mat));
  return { root, body, legs, neck, head, tail: [], hipH: 0.55, lie: 0.4, quad: false, hop: true };
}

const PALETTES = {
  pudgewing: [{ base: 0x8a7a6a, belly: 0xd9cbb0, accent: 0x5f4f3f, horn: 0xe2b347 }, { base: 0x9b8f86, belly: 0xeee2c8, accent: 0x6d625a, horn: 0xd99a33 }],
  trikeros: [{ base: 0x6d7a4a, belly: 0xb7a77a, accent: 0xb5502d, horn: 0xe8dcc0 }, { base: 0x7a6a52, belly: 0xc2b08a, accent: 0x3b6e8a, horn: 0xe8dcc0 }, { base: 0x5a6a5f, belly: 0xa8a890, accent: 0xc28a2a, horn: 0xefe4cc }],
  talonrunner: [{ base: 0x4e5b3a, belly: 0xb8b090, accent: 0x2a2a22, horn: 0x2b2620 }, { base: 0x8a5a36, belly: 0xd8c09a, accent: 0x3a2516, horn: 0x2b2620 }, { base: 0x3e5a6a, belly: 0xb0b8b0, accent: 0xd06030, horn: 0x2b2620 }],
  thunderneck: [{ base: 0x7d7468, belly: 0xb4a994, accent: 0x5a4d40 }, { base: 0x6a7a6a, belly: 0xa6b0a0, accent: 0x445244 }],
  ironhide: [{ base: 0x6a6450, belly: 0xa89c7a, accent: 0x4a4436, horn: 0xd8cdb0 }, { base: 0x5a5e52, belly: 0x9aa08a, accent: 0x8a5a2a, horn: 0xe0d6bc }],
  spinesail: [{ base: 0x4a5a52, belly: 0xb0aa90, accent: 0xb84a2a, horn: 0x2a2620 }, { base: 0x5a4e3e, belly: 0xc0ae8a, accent: 0x2a6a8a, horn: 0x2a2620 }],
  crestcaller: [{ base: 0x6a7a3a, belly: 0xd0c49a, accent: 0xd88a2a, horn: 0x3a3226 }, { base: 0x5a6a7a, belly: 0xc8c8b8, accent: 0xb83a4a, horn: 0x3a3226 }, { base: 0x8a6a4a, belly: 0xe0cca8, accent: 0x3a7a5a, horn: 0x3a3226 }],
  dashbeak: [{ base: 0x6a8a4a, belly: 0xd8d0a8, accent: 0x3a4a2a, horn: 0x2a2620 }, { base: 0x9a7a4a, belly: 0xe0d0b0, accent: 0x5a3a1a, horn: 0x2a2620 }],
  domehead: [{ base: 0x7a6a5a, belly: 0xc8b89a, accent: 0x5a8aa8, horn: 0xe8dcc0 }, { base: 0x6a7a5a, belly: 0xc0c09a, accent: 0xa8603a, horn: 0xe8dcc0 }],
  galewing: [{ base: 0x7a6a5a, belly: 0xd8ccb0, accent: 0x8a4a3a, horn: 0xe0b860 }, { base: 0x5a6a7a, belly: 0xd0d4d0, accent: 0x3a5a8a, horn: 0xe0b860 }, { base: 0x6a5a4a, belly: 0xe0d0b0, accent: 0xb0782a, horn: 0xd8c08a }],
  thunderwing: [{ base: 0x3e3a36, belly: 0x9a9086, accent: 0x6a2a2a, horn: 0xc8b48a }, { base: 0x3a4248, belly: 0x9aa0a4, accent: 0x2a4a6a, horn: 0xc8b48a }],
  glimmerfin: [{ base: 0x8ab0c8, belly: 0xe8eef0, accent: 0x3a7ab0 }, { base: 0xe0a040, belly: 0xf0e0c0, accent: 0xc05a2a }, { base: 0x7ac0a0, belly: 0xe0f0e8, accent: 0x2a8a6a }],
  deepjaw: [{ base: 0x2e4a5a, belly: 0xb8c4c4, accent: 0x1a2a34, horn: 0xe0e0d0 }, { base: 0x3a4a42, belly: 0xc0c4b0, accent: 0x5a2a2a, horn: 0xe0e0d0 }],
  cinderback: [{ base: 0x24201e, belly: 0x4a3a32, accent: 0xff6a1a, horn: 0x110e0c }, { base: 0x2e2622, belly: 0x5a4034, accent: 0xffa030, horn: 0x110e0c }],
  duskraptor: [{ base: 0x1e2430, belly: 0x5a6070, accent: 0x3ab0ff, horn: 0x101418 }, { base: 0x262030, belly: 0x605a70, accent: 0x9a6aff, horn: 0x101418 }],
  bogmaw: [{ base: 0x3a4a2a, belly: 0x9a9a6a, accent: 0x2a3420, horn: 0x2a2620 }, { base: 0x4a4a32, belly: 0xa8a070, accent: 0x5a3a20, horn: 0x2a2620 }],
  reedhorn: [{ base: 0x6a7a4a, belly: 0xc8c090, accent: 0xb85a2a, horn: 0xd8c8a0 }, { base: 0x7a6a50, belly: 0xd0c098, accent: 0x3a6a8a, horn: 0xd8c8a0 }],
  frosthorn: [{ base: 0x8a7a68, belly: 0xd8d0c0, accent: 0x5a4a3a, horn: 0xf0ecdf }, { base: 0x6a5a4a, belly: 0xc8beb0, accent: 0x3a5a7a, horn: 0xf0ecdf }],
  rimeclaw: [{ base: 0xd8e0e8, belly: 0xf4f6f8, accent: 0x5a7aa8, horn: 0x2a3038 }, { base: 0xc0ccd8, belly: 0xeef2f6, accent: 0x8a6ab0, horn: 0x2a3038 }],
  plateback: [{ base: 0x6a7a4a, belly: 0xc0b890, accent: 0xb84a2a, horn: 0xe8c86a }, { base: 0x5a6a6a, belly: 0xb8b8a8, accent: 0x3a7aa8, horn: 0xe8d8a0 }],
  hornjaw: [{ base: 0x8a3a2a, belly: 0xd0b090, accent: 0x2a1a14, horn: 0x1e1a16 }, { base: 0x5a4a3a, belly: 0xc8b090, accent: 0xa82a1a, horn: 0x1e1a16 }],
  scythehand: [{ base: 0x6a5a3a, belly: 0xd8c8a0, accent: 0x3a6a3a, horn: 0x2a2620 }, { base: 0x7a6a5a, belly: 0xe0d0b8, accent: 0xa8502a, horn: 0x2a2620 }],
  skyhorn: [{ base: 0x3a4a6a, belly: 0xd8dce0, accent: 0xe8702a, horn: 0xf0d050 }, { base: 0x5a3a5a, belly: 0xe0d0d8, accent: 0x3ac8a8, horn: 0xf0d050 }],
  dashstrider: [{ base: 0x9a8a6a, belly: 0xe8dcc0, accent: 0x5a7a3a, horn: 0xd8a040 }, { base: 0x7a8a9a, belly: 0xe0e4e8, accent: 0xc0602a, horn: 0xd8a040 }],
  frillspitter: [{ base: 0x4a7a4a, belly: 0xc8d0a0, accent: 0xe8c02a, horn: 0x2a2620 }, { base: 0x5a6a3a, belly: 0xd0c8a0, accent: 0xd8402a, horn: 0x2a2620 }],
  nightstalker: [{ base: 0x1c1e24, belly: 0x3a3c44, accent: 0x5a2a6a, horn: 0x0e0e10 }, { base: 0x22201c, belly: 0x44403a, accent: 0x2a5a3a, horn: 0x0e0e10 }],
  longfin: [{ base: 0x3a5a6a, belly: 0xc8d4d8, accent: 0x2a3a4a }, { base: 0x4a6a5a, belly: 0xd0d8c8, accent: 0x6a4a2a }],
  quillback: [{ base: 0x7a6a4a, belly: 0xc8b890, accent: 0x2a2a20, horn: 0xe8dcc0 }, { base: 0x5a6a5a, belly: 0xb8c0b0, accent: 0x8a3a2a, horn: 0xe8dcc0 }],
  eggthief: [{ base: 0x5a6aa8, belly: 0xe0d8c8, accent: 0xe8a02a, horn: 0x3a3226 }, { base: 0x8a5a8a, belly: 0xe8d8e0, accent: 0x3ac8a8, horn: 0x3a3226 }],
  bloodclaw: [{ base: 0x6a1e1a, belly: 0xc8a890, accent: 0x1e0e0c, horn: 0x161210 }, { base: 0x4a3a30, belly: 0xc0a888, accent: 0x8a1a14, horn: 0x161210 }],
  skyreach: [{ base: 0x8a8070, belly: 0xc8bea8, accent: 0x6a5040 }, { base: 0x6a7a80, belly: 0xb8c4c8, accent: 0x3a5a6a }],
  glowtail: [{ base: 0x2a4a5a, belly: 0x8ac8d8, accent: 0x6af0ff }, { base: 0x3a3a5a, belly: 0xb0a8e0, accent: 0xb88aff }],
  divebeak: [{ base: 0xe8eaec, belly: 0xf8f8f8, accent: 0x2a3a4a, horn: 0xe8a02a }, { base: 0x9aa8b4, belly: 0xe8ecf0, accent: 0x1a2a3a, horn: 0xe8a02a }],
  shieldhorn: [{ base: 0x8a6a4a, belly: 0xd0b890, accent: 0x5a3a2a, horn: 0xe8dcc0 }, { base: 0x6a6a5a, belly: 0xc0c0a8, accent: 0x2a5a7a, horn: 0xe8dcc0 }],
  shellback: [{ base: 0x5a6a4a, belly: 0xc8c090, accent: 0x6a5a3a, horn: 0x7a6a4a }, { base: 0x4a5a5a, belly: 0xb8c0b0, accent: 0x3a4a3a, horn: 0x5a6a5a }],
  leafshade: [{ base: 0x3e5a2a, belly: 0x8aa060, accent: 0x2a3a1a, horn: 0x1e2a14 }, { base: 0x4a5a30, belly: 0x9aa870, accent: 0x6a4a1a, horn: 0x1e2a14 }],
  voltfin: [{ base: 0x1e2a3a, belly: 0x8aa0b0, accent: 0xffd83a }, { base: 0x2a1e3a, belly: 0xa090b8, accent: 0x6af0ff }],
  mossback: [{ base: 0x5a6a3a, belly: 0xb8b890, accent: 0x6ad84a, horn: 0x4a5a2a }, { base: 0x4a5a40, belly: 0xa8b098, accent: 0x9ae86a, horn: 0x3a4a2a }],
  sandmaw: [{ base: 0xc8a870, belly: 0xe8d8b0, accent: 0x8a6a3a, horn: 0x3a2a1a }, { base: 0xb0905a, belly: 0xe0d0a8, accent: 0x5a4a2a, horn: 0x3a2a1a }],
  howler: [{ base: 0x6a6a70, belly: 0xc8c8c8, accent: 0x2a2a30, horn: 0x1a1a1e }, { base: 0x7a6250, belly: 0xd0c0b0, accent: 0x3a2a20, horn: 0x1a1a1e }],
  gorgonax: [{ base: 0x5a4a3a, belly: 0xb09a7a, accent: 0x8a2a1a, horn: 0x1e1a16 }, { base: 0x4a5246, belly: 0xa8a28a, accent: 0x2a2620, horn: 0x1e1a16 }],
};

function buildModel(species, mat) {
  const col = pick(PALETTES[species]);
  switch (species) {
    case 'pudgewing': return buildPudge(mat, col);
    case 'trikeros': return buildQuadTrikeros(mat, col);
    case 'thunderneck': return buildSauropod(mat, col);
    case 'talonrunner': return buildBiped(mat, col, 1.0, { hip: 1.15, bodyLen: 0.95, girth: 0.85, arm: 1.2, headLen: 0.5, headW: 0.8, tailSeg: 0.55, stripes: 4, crest: true, neckW: 0.9 });
    case 'ironhide': return buildIronhide(mat, col);
    case 'voltfin': return buildEel(mat, col);
    case 'mossback': { const m = buildPlateback(mat, col, false); m.body.add(meshOf([0, 1, 2, 3, 4, 5].map((i) => ({ geo: lumpify(new THREE.IcosahedronGeometry(1, 1), 0.3), color: i % 2 ? col.accent : col.horn, jitter: 0.2, matrix: mtx((i % 3 - 1) * 0.6, 1.0 + (i % 2) * 0.2, 1.2 - Math.floor(i / 2) * 1.0, 0, 0, 0, 0.6, 0.35, 0.6) })), mat)); return m; }
    case 'sandmaw': return buildBogmaw(mat, col);
    case 'howler': return buildBiped(mat, col, 1.1, { hip: 1.25, bodyLen: 1.0, girth: 0.85, arm: 0.9, headLen: 0.6, headW: 0.85, tailSeg: 0.6, stripes: 3, crest: true, neckW: 0.9 });
    case 'glowtail': return buildGlowtail(mat, col);
    case 'divebeak': return buildFlyer(mat, col, 0.75, false);
    case 'shieldhorn': { const m = buildQuadTrikeros(mat, col); m.head.add(meshOf([E(0.75, 0.55, 0.22, col.horn, 0, 0.35, 1.3, -0.3, 0, 0)], mat)); return m; }
    case 'shellback': return buildShellback(mat, col);
    case 'leafshade': return buildBiped(mat, col, 1.35, { hip: 1.15, bodyLen: 1.0, girth: 0.9, arm: 1.0, headLen: 0.55, headW: 0.85, tailSeg: 0.6, stripes: 6, frill: true, neckW: 0.95 });
    case 'quillback': return buildPlateback(mat, col, true);
    case 'eggthief': return buildBiped(mat, col, 0.72, { hip: 1.2, bodyLen: 0.85, girth: 0.8, arm: 1.3, headLen: 0.4, headW: 0.8, tailSeg: 0.55, stripes: 2, beak: true, crest: true, neckW: 0.8 });
    case 'bloodclaw': return buildBiped(mat, col, 1.45, { hip: 1.2, bodyLen: 1.0, girth: 0.9, arm: 1.3, headLen: 0.55, headW: 0.85, tailSeg: 0.65, stripes: 5, crest: true, claws: true, neckW: 0.95 });
    case 'skyreach': { const m = buildSauropod(mat, col); m.neck.rotation.x = 0.35; return m; }
    case 'dashstrider': return buildBiped(mat, col, 1.15, { hip: 1.65, bodyLen: 0.85, girth: 0.7, arm: 1.1, headLen: 0.35, headW: 0.7, tailSeg: 0.6, stripes: 2, beak: true, neckW: 0.7 });
    case 'frillspitter': return buildBiped(mat, col, 1.0, { hip: 1.15, bodyLen: 0.9, girth: 0.8, arm: 1.0, headLen: 0.5, headW: 0.8, tailSeg: 0.55, stripes: 4, frill: true, neckW: 0.85 });
    case 'nightstalker': return buildBiped(mat, col, 2.0, { hip: 1.45, bodyLen: 1.15, girth: 1.15, arm: 0.7, headLen: 0.7, headW: 1.15, tailSeg: 0.7, stripes: 3, horns: true, neckW: 1.2 });
    case 'longfin': return buildLongfin(mat, col);
    case 'plateback': return buildPlateback(mat, col);
    case 'hornjaw': return buildBiped(mat, col, 1.6, { hip: 1.35, bodyLen: 1.05, girth: 1.0, arm: 0.45, headLen: 0.55, headW: 1.0, tailSeg: 0.65, stripes: 3, horns: true, neckW: 1.1 });
    case 'scythehand': return buildBiped(mat, col, 1.9, { hip: 1.6, bodyLen: 1.0, girth: 1.3, arm: 1.6, headLen: 0.4, headW: 0.7, tailSeg: 0.5, stripes: 0, beak: true, claws: true, neckW: 0.8 });
    case 'skyhorn': return buildFlyer(mat, col, 1.45, true);
    case 'bogmaw': return buildBogmaw(mat, col);
    case 'reedhorn': return buildReedhorn(mat, col);
    case 'frosthorn': { const m = buildQuadTrikeros(mat, col); m.body.add(meshOf([E(1.45, 1.2, 2.1, col.base, 0, 0.25, -0.1), E(1.3, 1.0, 1.0, col.base, 0, 0.3, 1.4)].map((p) => ({ ...p, geo: lumpify(new THREE.IcosahedronGeometry(1, 2), 0.25), jitter: 0.2 })), mat)); return m; }
    case 'rimeclaw': return buildBiped(mat, col, 1.05, { hip: 1.2, bodyLen: 0.95, girth: 0.85, arm: 1.2, headLen: 0.55, headW: 0.8, tailSeg: 0.6, stripes: 4, crest: true, neckW: 0.9 });
    case 'cinderback': return buildBiped(mat, col, 1.9, { hip: 1.35, bodyLen: 1.15, girth: 1.2, arm: 0.8, headLen: 0.6, headW: 1.15, tailSeg: 0.65, stripes: 6, crest: false, knobs: true, neckW: 1.2 });
    case 'duskraptor': return buildBiped(mat, col, 1.05, { hip: 1.15, bodyLen: 0.95, girth: 0.8, arm: 1.3, headLen: 0.55, headW: 0.8, tailSeg: 0.6, stripes: 3, crest: true, neckW: 0.9 });
    case 'glimmerfin': return buildFish(mat, col);
    case 'deepjaw': return buildDeepjaw(mat, col);
    case 'galewing': return buildFlyer(mat, col, 1.0, false);
    case 'thunderwing': return buildFlyer(mat, col, 1.8, true);
    case 'spinesail': return buildBiped(mat, col, 2.1, { hip: 1.45, bodyLen: 1.35, girth: 1.0, arm: 1.0, headLen: 0.6, headW: 0.85, tailSeg: 0.8, stripes: 0, sail: true, snout: true, neckW: 1.0 });
    case 'crestcaller': return buildBiped(mat, col, 1.7, { hip: 1.3, bodyLen: 1.0, girth: 1.0, arm: 1.1, headLen: 0.45, headW: 0.8, tailSeg: 0.6, stripes: 3, tubeCrest: true, beak: true, neckW: 0.85 });
    case 'dashbeak': return buildBiped(mat, col, 0.42, { hip: 1.2, bodyLen: 0.9, girth: 0.8, arm: 1.0, headLen: 0.55, headW: 0.8, tailSeg: 0.6, stripes: 3, crest: true, neckW: 0.9 });
    case 'domehead': return buildBiped(mat, col, 1.15, { hip: 1.2, bodyLen: 1.0, girth: 1.1, arm: 0.7, headLen: 0.45, headW: 0.95, tailSeg: 0.6, stripes: 2, dome: true, beak: true, knobs: true, neckW: 1.1 });
    case 'gorgonax': return buildBiped(mat, col, 2.6, { hip: 1.5, bodyLen: 1.2, girth: 1.25, arm: 0.6, headLen: 0.75, headW: 1.3, tailSeg: 0.75, stripes: 5, crest: false, neckW: 1.3 });
  }
}

// ---------------- Creature ----------------
let NEXT_ID = 1;
export class Creature {
  constructor(species, pos, level) {
    this.id = NEXT_ID++;
    this.species = species;
    this.def = SPECIES[species];
    this.level = level;
    const L = 1 + level * 0.05;
    this.maxHp = Math.round(this.def.hp * L);
    this.hp = this.maxHp;
    this.dmg = this.def.dmg * (1 + level * 0.03);
    this.maxTorpor = this.def.torpor * (1 + level * 0.06);
    this.torpor = 0;
    this.tame = 0;
    this.tamed = false;
    this.saddled = false;
    this.follow = true;
    this.name = this.def.name;
    this.state = 'wander';
    this.timer = rand(0, 4);
    this.target = null;
    this.threat = null;
    this.goal = new THREE.Vector3().copy(pos);
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.phase = Math.random() * 10;
    this.attackCd = 0;
    this.attackAnim = 0;
    this.hitFlash = 0;
    this.lieT = 0;
    this.carcass = 0;
    this.despawn = 0;
    this.graze = 0;
    this.roarCd = rand(5, 20);
    this.scanCd = Math.random();
    this.lastFeed = 0;

    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, side: SPECIES[species].flyer ? THREE.DoubleSide : THREE.FrontSide });
    this.model = buildModel(species, this.mat);
    this.obj = this.model.root;
    const s = species === 'pudgewing' ? 1 : 0.85 + level / 120;
    this.scale = s;
    this.obj.scale.setScalar(s);
    this.obj.position.copy(pos);
  }

  get radius() { return this.def.radius * this.scale; }
  get hitR() { return this.def.hitR * this.scale; }
  get alive() { return this.state !== 'dead'; }
  get ko() { return this.state === 'ko'; }
  get center() {
    const c = this._c || (this._c = new THREE.Vector3());
    const lie = this.lieT * this.lieT * (3 - 2 * this.lieT);
    const h = this.model.hipH * this.scale;
    // when lying on its side the body swings out along the creature's local -X axis
    const off = -h * Math.sin(lie * Math.PI / 2);
    return c.set(this.pos.x + Math.cos(this.yaw) * off, this.pos.y + lerp(h, this.model.lie * this.scale, lie), this.pos.z - Math.sin(this.yaw) * off);
  }
  get label() { return this.boss ? `${this.name} · Lv ${this.level}` : `${this.tamed ? this.name : (this.alpha ? 'Alpha ' : '') + this.def.name} · Lv ${this.level}`; }

  tameCost() { return this.def.tameBase + this.level * this.def.tameLvl; }
}

// ---------------- Manager ----------------
export class CreatureManager {
  constructor(scene, world, hooks) {
    this.scene = scene;
    this.world = world;
    this.hooks = hooks;
    this.list = [];
    this.flyers = [];
    this.respawnCd = 20;
  }

  randomSpot(def, avoid, minDist = 0) {
    for (let i = 0; i < 400; i++) {
      const x = (Math.random() - 0.5) * HALF * 1.7, z = (Math.random() - 0.5) * HALF * 1.7;
      const h = heightAt(x, z);
      if (!def.zone(h, x, z)) continue;
      if (!def.fireproof && !def.swimmer && !def.flyer && volcanicAt(x, z) > 0.4) continue;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < Math.max(minDist, def.far || 0)) continue;
      return new THREE.Vector3(x, h, z);
    }
    return null;
  }

  spawn(species, pos, level) {
    const def = SPECIES[species];
    const lv = level ?? Math.floor(rand(def.lvl[0], def.lvl[1] + 1));
    const c = new Creature(species, pos, lv);
    if (def.swimmer) { const h = heightAt(pos.x, pos.z); c.pos.y = Math.min(-0.8, h + 1 + Math.random() * Math.max(0, -h - 2.5)); c.home = c.pos.clone(); c.vy = 0; }
    if (def.flyer) { c.flying = true; c.home = pos.clone(); c.pos.y += rand(25, 50); c.vy = 0; c.landT = rand(30, 80); c.perchT = rand(15, 30); }
    this.scene.add(c.obj);
    this.list.push(c);
    return c;
  }

  // Alphas: rare, glowing, much tougher variants that drop trophies. Cannot be tamed.
  makeAlpha(c) {
    if (['pudgewing', 'dashbeak', 'galewing'].includes(c.species)) return c;
    c.alpha = true;
    c.level = Math.min(c.level + 15, 60);
    c.maxHp = Math.round(c.def.hp * (1 + c.level * 0.05) * 2.5); c.hp = c.maxHp;
    c.dmg = c.def.dmg * (1 + c.level * 0.03) * 1.6;
    c.maxTorpor = c.def.torpor * (1 + c.level * 0.06) * 2;
    c.scale *= 1.25; c.obj.scale.setScalar(c.scale);
    return c;
  }

  // Bosses: an oversized alpha of a species with boss stats and ability timers.
  // cfg: { species, name, hp, dmg, scale, minions: [species, n, level], phases: [0.5], abilities: [...] }
  spawnBoss(pos, cfg = BOSS_TYRANT) {
    const c = this.spawn(cfg.species, pos, 60);
    this.makeAlpha(c);
    c.boss = true; c.bossKind = cfg.kind;
    c.name = cfg.name;
    c.maxHp = cfg.hp; c.hp = c.maxHp;
    c.dmg = cfg.dmg;
    c.maxTorpor = Infinity;
    c.scale = cfg.scale; c.obj.scale.setScalar(c.scale);
    c.cfg = cfg;
    if (cfg.tint) c.mat.color.set(cfg.tint);
    c.cd = {}; for (const a of cfg.abilities) c.cd[a] = 5 + Math.random() * 3;
    c.phasesLeft = [...(cfg.phases || [0.5])];
    c.home = pos.clone();
    c.flying = false;
    c.state = 'wander'; c.timer = 0.5;
    return c;
  }

  updateBoss(c, dt, player) {
    if (!c.alive || c.state === 'ko') return;
    const cfg = c.cfg || BOSS_TYRANT;
    c.timer = Math.max(c.timer, 5);       // never gives up the fight
    const d = Math.hypot(player.pos.x - c.pos.x, player.pos.z - c.pos.z);
    const engaged = player.alive && d < (cfg.arena || 80);
    if (engaged && c.state !== 'chase' && !c.def.swimmer) { c.state = 'chase'; c.target = player.mount || 'player'; }
    for (const a of cfg.abilities) {
      c.cd[a] = (c.cd[a] ?? 5) - dt;
      if (c.cd[a] > 0 || !engaged) continue;
      if (a === 'stomp' && d < 16) { c.cd[a] = 7 + Math.random() * 3; c.roarT = 0.8; this.hooks.stomp?.(c, d); }
      if (a === 'eruption') { c.cd[a] = 8 + Math.random() * 3; c.roarT = 0.8; this.hooks.eruption?.(c); }
      if (a === 'whirlpool') { c.cd[a] = 13; this.hooks.whirlpool?.(c); }
      if (a === 'shriek') { c.cd[a] = 15; c.roarT = 1.2; this.hooks.shriek?.(c); }
      if (a === 'howl') { c.cd[a] = 14; c.roarT = 1.2; this.howl(c, player.mount || 'player'); this.hooks.bossHowl?.(c); }
      if (a === 'shadow' && d < 22) { c.cd[a] = 10; c.roarT = 1; this.hooks.shadow?.(c, d); }
      if (a === 'roots') { c.cd[a] = 7.5; this.hooks.roots?.(c); }
      if (a === 'lightning') { c.cd[a] = 6 + Math.random() * 2; this.hooks.lightning?.(c); }
      if (a === 'gust' && d < 35) { c.cd[a] = 11; this.hooks.gust?.(c, d); }
      if (a === 'spitvolley' && d < 30) { c.cd[a] = 6.5; c.attackAnim = 1; this.hooks.spitVolley?.(c); }
      if (a === 'icespikes') { c.cd[a] = 8 + Math.random() * 3; c.roarT = 0.8; this.hooks.icespikes?.(c); }
      if (a === 'blizzard') { c.cd[a] = 18; c.roarT = 1.2; this.hooks.blizzard?.(c); }
      if (a === 'poison') { c.cd[a] = 9 + Math.random() * 3; this.hooks.poison?.(c); }
      if (a === 'quake' && d < 40) { c.cd[a] = 12; c.roarT = 1; this.hooks.quake?.(c, d); }
      if (a === 'submerge' && !(c.hiddenT > 0)) { c.cd[a] = 14; c.hiddenT = 1.8; c.obj.visible = false; this.hooks.submerge?.(c); }
      if (a === 'pounce' && d > 7 && d < 28) { c.cd[a] = 7; c.pounceT = 0.7; c.pounceHit = false; c.yaw = Math.atan2(player.pos.x - c.pos.x, player.pos.z - c.pos.z); this.hooks.pounce?.(c); }
    }
    // vanish beneath the surface, then burst out next to the player
    if (c.hiddenT > 0) {
      c.hiddenT -= dt;
      c.obj.visible = false;
      if (c.hiddenT <= 0) {
        const a = Math.random() * Math.PI * 2;
        const nx = player.pos.x + Math.cos(a) * 9, nz = player.pos.z + Math.sin(a) * 9;
        if (!blockedAt(nx, nz) && heightAt(nx, nz) > -3) { c.pos.set(nx, heightAt(nx, nz), nz); }
        c.obj.visible = true;
        c.yaw = Math.atan2(player.pos.x - c.pos.x, player.pos.z - c.pos.z);
        c.pounceT = 0.6; c.pounceHit = false;
        this.hooks.pounce?.(c);
      }
    }
    // leap toward the player
    if (c.pounceT > 0) {
      c.pounceT -= dt;
      const nx = c.pos.x + Math.sin(c.yaw) * 26 * dt, nz = c.pos.z + Math.cos(c.yaw) * 26 * dt;
      if (!blockedAt(nx, nz)) { c.pos.x = nx; c.pos.z = nz; c.pos.y = heightAt(nx, nz); }
      c.attackAnim = 1;
      if (!c.pounceHit && Math.hypot(player.pos.x - c.pos.x, player.pos.z - c.pos.z) < 4.5) { c.pounceHit = true; this.hooks.hitPlayer?.(c.dmg * 0.8, c); }
    }
    // reinforcement phases
    while (c.phasesLeft.length && c.hp < c.maxHp * c.phasesLeft[0]) {
      c.phasesLeft.shift();
      this.hooks.bossPhase?.(c);
      const [sp, n, lv] = cfg.minionsList ? cfg.minionsList[(cfg.phases.length - c.phasesLeft.length - 1) % cfg.minionsList.length] : cfg.minions;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = c.pos.clone().add(new THREE.Vector3(Math.cos(a) * 10, 0, Math.sin(a) * 10));
        if (blockedAt(p.x, p.z)) p.copy(c.pos);
        p.y = c.def.swimmer ? c.pos.y : heightAt(p.x, p.z);
        const m = this.spawn(sp, p, lv);
        m.flying = false;
        if (c.cave) { m.cave = c.cave; m.home = c.home.clone(); m.homeR = 8; }
        if (m.def.swimmer) { m.home = c.home.clone(); m.pos.y = c.pos.y; }
        m.state = 'chase'; m.target = player.mount || 'player'; m.timer = 60;
      }
    }
    // leash to the arena
    if (!c.def.swimmer && c.pos.distanceTo(c.home) > (cfg.leash || 70)) { c.state = 'wander'; c.target = null; c.goal.copy(c.home); c.timer = 3; }
  }

  populate(avoid) {
    for (const [sp, def] of Object.entries(SPECIES)) {
      let n = 0;
      const want = Math.max(1, Math.round(def.count * (this.density || 1)));
      while (n < want) {
        const p = this.randomSpot(def, avoid, 60);
        if (!p) break;
        const herd = def.herd ? Math.min(def.herd, want - n) : 1;
        for (let k = 0; k < herd; k++) {
          const q = p.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6)));
          q.y = heightAt(q.x, q.z);
          if (q.y < 0.8 && !def.wade) q.copy(p);
          const c = this.spawn(sp, q);
          if (k > 0) c.leader = this.list[this.list.length - 1 - k];
          n++;
        }
      }
    }
    const pool = this.list.filter((c) => !['pudgewing', 'dashbeak', 'galewing', 'thunderneck'].includes(c.species));
    for (let i = 0; i < 7 && pool.length; i++) this.makeAlpha(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    // Starter-friendly creatures near the beach so the first minutes have life.
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Vector3(avoid.x + rand(-30, 30), 0, avoid.z - rand(15, 50));
      p.y = heightAt(p.x, p.z);
      if (p.y > 1) this.spawn('pudgewing', p, Math.floor(rand(1, 6)));
    }
    const tp = new THREE.Vector3(avoid.x + 40, 0, avoid.z - 70); tp.y = heightAt(tp.x, tp.z);
    if (tp.y > 2) { this.spawn('trikeros', tp, 4); }

    // Ambient flyers circling the mountain
    // decorative fliers replaced by real, tameable pterosaurs
  }

  makeFlyer() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const g = new THREE.Group();
    g.add(meshOf([E(0.4, 0.35, 1.2, 0x6a4a3a), E(0.25, 0.22, 0.6, 0x6a4a3a, 0, 0.1, 1.3), K(0.12, 1.2, 0xc9a050, 0, 0.1, 2.1, Math.PI / 2, 0, 0), K(0.08, 0.9, 0x9a3a2a, 0, 0.5, 1.0, -0.8, 0, 0)], mat));
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.6, 0, 0, -0.6, 4.5, 0, -0.2, 0, 0, 0.6, 4.5, 0, -0.2, 3.2, 0, 0.6], 3));
    wingGeo.computeVertexNormals();
    const wm = new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.9, side: THREE.DoubleSide });
    const wl = new THREE.Mesh(wingGeo, wm), wr = new THREE.Mesh(wingGeo, wm);
    wr.scale.x = -1;
    g.add(wl, wr);
    g.traverse((o) => { o.castShadow = true; });
    this.scene.add(g);
    return { g, wl, wr, a: Math.random() * 6.28, r: rand(40, 160), h: rand(70, 120), sp: rand(0.08, 0.16) * (Math.random() < 0.5 ? -1 : 1), cx: -40 + rand(-60, 60), cz: -200 + rand(-60, 60), ph: Math.random() * 6 };
  }

  // Raycast against creature hit spheres.
  pick(origin, dir, maxDist, includeDead = true) {
    let best = null, bestT = maxDist;
    const v = new THREE.Vector3();
    for (const c of this.list) {
      if (!includeDead && !c.alive) continue;
      if (c.riddenBy) continue;
      const ctr = c.center;
      const r = c.hitR;
      const pts = [ctr];
      // second sphere toward the head for long creatures
      if (c.species !== 'pudgewing' && c.alive && !c.ko) pts.push(v.clone().set(Math.sin(c.yaw), 0, Math.cos(c.yaw)).multiplyScalar(r * 0.9).add(ctr));
      for (const p of pts) {
        v.subVectors(p, origin);
        const t = v.dot(dir);
        if (t < 0) continue;
        const d2 = v.lengthSq() - t * t;
        if (d2 < r * r) {
          const th = t - Math.sqrt(r * r - d2);
          if (th < bestT) { bestT = Math.max(th, 0); best = c; }
        }
      }
    }
    return best ? { creature: best, dist: bestT } : null;
  }

  damage(c, amount, torpor, attacker) {
    if (!c.alive) return;
    if (c.hiddenT > 0) return; // submerged bosses can't be hit
    if (c.shellT > 0) { this.hooks.shellBlock?.(c); return; }
    if (c.def.shell && !c.tamed && c.hp - amount < c.maxHp * 0.4 && !(c.shellCd > 0)) { c.shellT = 6; c.shellCd = 30; c.speed = 0; this.hooks.notify?.(`The ${c.def.name} retreats into its shell!`); }
    c.hp -= amount * (1 - (c.def.armor || 0));
    c.hitFlash = 0.18;
    if (torpor && c.def.torpor !== Infinity) c.torpor += torpor;
    if (c.hp <= 0 && c.boss && c.cfg?.revive && !c.revived) { c.revived = true; c.hp = c.maxHp * 0.5; this.hooks.revive?.(c); return; }
    if (c.hp <= 0) { this.kill(c, attacker); return; }
    if (c.state !== 'ko' && c.torpor >= c.maxTorpor) { this.knockOut(c); return; }
    if (c.state === 'ko' || c.riddenBy) return;
    // reactions
    if (c.tamed) {
      if (attacker && attacker !== 'player') { c.target = attacker; c.state = 'chase'; }
      return;
    }
    const t = c.def.temper;
    if (t === 'skittish' || c.species === 'pudgewing' || c.def.thief) { c.state = 'flee'; c.threat = attacker; c.timer = 6; }
    else { c.state = 'chase'; c.target = attacker; c.timer = 25; this.hooks.roar?.(c); }
    // herd-mates join in
    for (const o of this.list) {
      if (o !== c && o.species === c.species && !o.tamed && o.alive && o.state !== 'ko' && o.pos.distanceTo(c.pos) < 30 && t !== 'skittish') {
        o.state = 'chase'; o.target = attacker; o.timer = 20;
      }
    }
  }

  knockOut(c) {
    c.state = 'ko';
    c.torpor = c.maxTorpor;
    c.target = null;
    c.speed = 0;
    this.hooks.notify?.(`${c.label} is unconscious!`, 'ko');
    this.hooks.ko?.(c);
  }

  kill(c, attacker) {
    c.state = 'dead';
    c.hp = 0;
    c.carcass = 6 + c.scale * 4;
    c.despawn = 150;
    c.target = null;
    if (c.riddenBy) this.hooks.dismount?.();
    this.hooks.died?.(c, attacker);
  }

  playerEntity(player) {
    return player.mount ? player.mount : 'player';
  }

  targetPos(t, player) {
    if (t === 'player') return player.pos;
    return t.pos;
  }

  targetValid(t, player) {
    if (!t) return false;
    if (t === 'player') return player.alive;
    return t.alive && t.state !== 'ko';
  }

  findTarget(c, player) {
    const d = c.def;
    let best = null, bestD = c.boss ? 90 : c.alpha ? Math.max(d.aggro, 22) * 1.2 : d.aggro;
    const pd = player.alive ? c.pos.distanceTo(player.pos) : Infinity;
    const reachable = !c.def.swimmer || (player.pos.y < 0.4 && heightAt(player.pos.x, player.pos.z) < -0.8);
    if (reachable && pd < bestD * (player.crouch ? 0.6 : 1)) { best = this.playerEntity(player); bestD = pd; }
    for (const o of this.list) {
      if (o === c || !o.alive || o.ko) continue;
      const preyOk = (PREY[c.species] || []).includes(o.species) && o.level <= c.level + 10;
      if (!o.tamed && !preyOk) continue;
      if (o.tamed && o.riddenBy) continue;
      if (!!c.def.swimmer !== !!o.def.swimmer && !o.flying) continue; // sea hunters stay in the sea, land hunters on land
      const dd = c.pos.distanceTo(o.pos) * (o.tamed ? 1 : 1.4);
      if (dd < bestD) { best = o; bestD = dd; }
    }
    return best;
  }

  update(dt, player, time) {
    // far-away wild creatures think less often (their elapsed time is caught up in one step)
    this.frame = (this.frame || 0) + 1;
    for (const c of this.list) {
      const far = !c.tamed && !c.boss && !c.riddenBy && c.state !== 'chase' && Math.abs(c.pos.x - player.pos.x) + Math.abs(c.pos.z - player.pos.z) > 280;
      if (far) {
        c.lodDt = (c.lodDt || 0) + dt;
        if ((this.frame + c.id) % 4 !== 0) continue;
        this.updateOne(c, Math.min(c.lodDt, 0.25), player, time);
        c.lodDt = 0;
      } else { if (c.lodDt) c.lodDt = 0; this.updateOne(c, dt, player, time); }
    }

    // remove despawned carcasses
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      if (c.state === 'dead') {
        c.despawn -= dt;
        if (c.despawn <= 0 || c.carcass <= 0) {
          this.scene.remove(c.obj);
          c.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
          c.mat.dispose();
          this.list.splice(i, 1);
        }
      }
    }

    // keep populations topped up
    this.respawnCd -= dt;
    if (this.respawnCd <= 0) {
      this.respawnCd = 30;
      for (const [sp, def] of Object.entries(SPECIES)) {
        const wild = this.list.filter((c) => c.species === sp && !c.tamed && c.alive && !c.cave).length;
        if (wild < Math.round(def.count * (this.density || 1))) {
          const p = this.randomSpot(def, player.pos, 140);
          if (p) { const c = this.spawn(sp, p); if (Math.random() < 0.08) this.makeAlpha(c); }
        }
      }
    }

    for (const f of this.flyers) {
      f.a += f.sp * dt;
      f.ph += dt * 3;
      const x = f.cx + Math.cos(f.a) * f.r, z = f.cz + Math.sin(f.a) * f.r;
      f.g.position.set(x, f.h + Math.sin(f.ph * 0.3) * 4, z);
      f.g.rotation.y = -f.a + (f.sp > 0 ? Math.PI : 0);
      f.g.rotation.z = (f.sp > 0 ? -1 : 1) * 0.25;
      const flap = Math.sin(f.ph) * 0.5 * (0.6 + 0.4 * Math.sin(f.ph * 0.13));
      f.wl.rotation.z = flap; f.wr.rotation.z = -flap;
    }
  }

  moveToward(c, target, spd, dt) {
    const dx = target.x - c.pos.x, dz = target.z - c.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) { c.speed = lerp(c.speed, 0, dt * 4); return d; }
    const desiredYaw = Math.atan2(dx, dz);
    const turnRate = c.radius > 3 ? 1.2 : c.radius > 1.5 ? 2.2 : 5;
    c.yaw = angleLerp(c.yaw, desiredYaw, Math.min(1, dt * turnRate));
    c.speed = lerp(c.speed, spd, Math.min(1, dt * 3));
    return d;
  }

  updateOne(c, dt, player, time) {
    const d = c.def;
    const m = c.model;
    c.hitFlash = Math.max(0, c.hitFlash - dt);
    const glow = c.alpha ? 0.28 + Math.sin(performance.now() / 300 + c.id) * 0.18 : 0;
    const sg = d.glow ? 0.14 + Math.sin(performance.now() / 500 + c.id) * 0.06 : 0;
    c.mat.emissive.setRGB(c.hitFlash * 4 + glow + (d.glow ? d.glow[0] * sg : 0), glow * 0.12 + (d.glow ? d.glow[1] * sg : 0), d.glow ? d.glow[2] * sg : 0);
    if (c.boss) this.updateBoss(c, dt, player);
    else if (d.burrow && !c.tamed) this.burrowTick(c, dt, player);
    if (c.buffT > 0) c.buffT -= dt;
    // healing aura: wild Mossbacks mend their neighbours; a tamed one heals your tames and you
    if (d.healer && c.alive && c.state !== 'ko') {
      c.healT = (c.healT || 0) - dt;
      if (c.healT <= 0) {
        c.healT = 2;
        for (const o of this.list) if (o.alive && o !== c && o.tamed === c.tamed && o.pos.distanceTo(c.pos) < 16) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.03);
        if (c.tamed) this.hooks.healPlayer?.(c);
      }
    }
    if (c.shellCd > 0) c.shellCd -= dt;
    if (c.shellT > 0) { c.shellT -= dt; c.speed = 0; c.goal.copy(c.pos); c.model.neck.scale.setScalar(0.3); for (const L of c.model.legs) L.g.scale.setScalar(0.5); if (c.shellT <= 0) { c.model.neck.scale.setScalar(1); for (const L of c.model.legs) L.g.scale.setScalar(1); } }
    if (c.poisonT > 0 && c.alive) {
      c.poisonT -= dt;
      c.hp -= c.poisonDps * dt;
      c.mat.emissive.setRGB(0.05, 0.35 + Math.sin(performance.now() / 120) * 0.15, 0.02);
      if (c.hp <= 0) { if (c.boss && c.cfg?.revive && !c.revived) { c.revived = true; c.hp = c.maxHp * 0.5; this.hooks.revive?.(c); } else this.kill(c, 'player'); }
    }
    c.attackCd -= dt; c.attackAnim = Math.max(0, c.attackAnim - dt * 3);
    c.timer -= dt; c.scanCd -= dt;

    const distP = c.pos.distanceTo(player.pos);
    // LOD: cheap update far away
    const far = distP > 260;
    c.obj.visible = distP < (c.radius < 0.5 ? 90 : (this.viewDist || 330));
    if (c.hiddenT > 0) c.obj.visible = false;
    if (d.camo && !c.tamed && c.state !== 'chase' && c.state !== 'ko' && c.alive && distP > 13) c.obj.visible = false;

    if (c.riddenBy) return; // driven + animated by Game.updateMount

    if (c.state === 'dead' || c.state === 'ko') {
      c.speed = 0;
      if (d.swimmer) c.pos.y = lerp(c.pos.y, -0.25, Math.min(1, dt * 0.8));
      if (c.flying) {
        c.vy = (c.vy || 0) - 25 * dt;
        c.pos.y += c.vy * dt;
        const g = Math.max(heightAt(c.pos.x, c.pos.z), -0.3);
        if (c.pos.y <= g) { c.pos.y = g; c.vy = 0; c.flying = false; if (c.pos.distanceTo(player.pos) < 80) this.hooks.thud?.(c); }
      }
      c.lieT = Math.min(1, c.lieT + dt * 1.5);
      if (c.state === 'ko') {
        c.torpor -= (c.maxTorpor / 100) * dt;
        if (c.torpor <= 0) {
          c.torpor = 0; c.tame = Math.max(0, c.tame * 0.5);
          c.state = d.temper === 'skittish' ? 'flee' : 'chase';
          c.target = 'player'; c.threat = 'player'; c.timer = 10;
          this.hooks.notify?.(`${c.label} woke up!`, 'warn');
        }
      }
      this.animate(c, dt);
      return;
    }
    c.lieT = Math.max(0, c.lieT - dt * 1.2);
    if (c.torpor > 0) c.torpor = Math.max(0, c.torpor - dt * c.maxTorpor * 0.03);

    if (d.swimmer) { this.updateSwim(c, dt, player); this.animate(c, dt); return; }
    if (d.flyer) {
      if (c.flying) { this.updateFlight(c, dt, player); this.animate(c, dt); return; }
      const takeOff = c.tamed
        ? c.follow && player.alive && Math.abs(player.pos.x) < 1500 && Math.hypot(player.pos.x - c.pos.x, player.pos.z - c.pos.z) > 40
        : (c.perchT = (c.perchT ?? 20) - dt) <= 0 || c.state === 'flee' || c.state === 'chase';
      if (takeOff) {
        c.flying = true; c.vy = 9; c.landT = rand(40, 90); c.home = c.home || c.pos.clone();
        if (c.state === 'flee') { c.state = 'wander'; }
        this.hooks.flap?.(c);
      }
    }

    let spd = 0;
    const goal = c.goal;

    if (c.tamed) {
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.003 * dt); // slow natural healing
      // assist: attack anything targeting the player
      if (c.scanCd <= 0 && c.species !== 'pudgewing' && c.follow) { // tames on Stay hold position
        c.scanCd = 0.6;
        if (c.state !== 'chase') {
          for (const o of this.list) {
            if (!o.tamed && o.alive && !o.ko && (o.target === 'player' || o.target === c || o.target === player.mount) && o.pos.distanceTo(c.pos) < 30) { c.state = 'chase'; c.target = o; c.timer = 20; break; }
          }
        }
      }
      if (c.state === 'chase' && this.targetValid(c.target, player) && c.target !== 'player' && c.timer > 0) {
        spd = this.chase(c, dt, player);
      } else {
        c.state = 'tamed'; c.target = null;
        if (c.follow) {
          const behind = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(4 + c.radius * 2);
          goal.copy(player.pos).add(behind);
          const dd = Math.hypot(goal.x - c.pos.x, goal.z - c.pos.z);
          if (dd > 2) spd = dd > 18 ? d.run * 1.1 : dd > 8 ? d.run * 0.7 : d.walk;
          if (dd > 120) { c.pos.copy(goal); c.pos.y = heightAt(goal.x, goal.z); }
        } else { goal.copy(c.pos); }
        this.moveToward(c, goal, spd, dt);
      }
    } else if (c.state === 'flee') {
      const tp = c.threat ? this.targetPos(c.threat, player) : player.pos;
      const away = new THREE.Vector3().subVectors(c.pos, tp).setY(0).normalize().multiplyScalar(20);
      goal.copy(c.pos).add(away);
      spd = d.run;
      this.moveToward(c, goal, spd, dt);
      if (c.timer <= 0) { c.state = 'wander'; c.timer = 2; }
    } else if (c.state === 'chase') {
      if (!this.targetValid(c.target, player) || c.timer <= 0 || this.targetPos(c.target, player).distanceTo(c.pos) > Math.max(d.aggro, 30) * 2.5) {
        c.state = 'wander'; c.target = null; c.timer = 3;
      } else {
        // translate 'player' target to mount if riding
        if (c.target === 'player' && player.mount) c.target = player.mount;
        spd = this.chase(c, dt, player);
      }
    } else {
      // wander / graze
      const asleep = d.nocturnal && (this.daylight ?? 0) > 0.45;
      if (asleep) { goal.copy(c.pos); c.timer = Math.max(c.timer, 1); c.lieT = Math.min(0.45, c.lieT + dt * 2); }
      if ((d.temper === 'aggressive' || d.thief || c.alpha) && c.scanCd <= 0 && !far && !asleep && !(d.thief && c.stolen)) {
        c.scanCd = 0.5;
        const t = this.findTarget(c, player);
        if (t) { c.state = 'chase'; c.target = t; c.timer = 25; this.hooks.roar?.(c); if (d.howl) this.howl(c, t); }
      }
      if (d.temper === 'skittish' && distP < 9 && !player.crouch) { c.state = 'flee'; c.threat = 'player'; c.timer = 4; }
      if (c.timer <= 0) {
        if (Math.random() < 0.35) { goal.copy(c.pos); c.graze = rand(2, 5); c.timer = c.graze; }
        else {
          const lead = c.cave && c.home ? c.home : c.leader && c.leader.alive && !c.leader.tamed ? c.leader.pos : c.pos;
          const r = c.cave ? c.homeR || 6 : c.leader ? 10 : 30;
          goal.set(lead.x + rand(-r, r), 0, lead.z + rand(-r, r));
          c.timer = rand(5, 11);
        }
      }
      const dd = Math.hypot(goal.x - c.pos.x, goal.z - c.pos.z);
      spd = dd > 1.5 ? d.walk : 0;
      this.moveToward(c, goal, spd, dt);
      c.roarCd -= dt;
      if (c.roarCd <= 0) { c.roarCd = rand(15, 40); if (distP < 90) this.hooks.call?.(c, distP); }
    }

    // ---- integrate movement ----
    const step = c.speed * dt;
    const nx = c.pos.x + Math.sin(c.yaw) * step, nz = c.pos.z + Math.cos(c.yaw) * step;
    const nh = heightAt(nx, nz);
    const minH = d.wade ? -2.5 : 0.6;
    const inBounds = c.cave || Math.abs(c.pos.x) > 1500 ? !blockedAt(nx, nz) : Math.abs(nx) < HALF * 0.95 && Math.abs(nz) < HALF * 0.95;
    if (nh > minH && inBounds) {
      c.pos.x = nx; c.pos.z = nz;
    } else {
      // blocked by water — turn around
      c.yaw += Math.PI * 0.6 * (Math.random() < 0.5 ? 1 : -1);
      goal.copy(c.pos).add(new THREE.Vector3(Math.sin(c.yaw) * 15, 0, Math.cos(c.yaw) * 15));
      c.speed *= 0.3;
    }
    if (c.radius < 2.5) this.world.collide(c.pos, c.radius * 0.6);
    // separation
    if (!far) for (const o of this.list) {
      if (o === c || o.riddenBy || o.flying || o.def.swimmer) continue;
      const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z;
      const md = (c.radius + o.radius) * 0.8;
      const dd = dx * dx + dz * dz;
      if (dd < md * md && dd > 1e-4) {
        const k = (md - Math.sqrt(dd)) * 0.5 * (o.radius / (c.radius + o.radius)) * 2;
        const inv = 1 / Math.sqrt(dd);
        c.pos.x += dx * inv * k * Math.min(1, dt * 8); c.pos.z += dz * inv * k * Math.min(1, dt * 8);
      }
    }
    c.pos.y = heightAt(c.pos.x, c.pos.z);
    this.animate(c, dt);
  }

  updateFlight(c, dt, player) {
    const d = c.def;
    const ground = Math.max(heightAt(c.pos.x, c.pos.z), 0);
    const fwd = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    let target = c._ft || (c._ft = new THREE.Vector3());
    let spd = d.fly;
    let landing = false;
    c.climbT = Math.max(0, (c.climbT || 0) - dt);

    if (c.tamed) {
      const behind = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(6);
      const fp = c.follow ? player.pos.clone().add(behind) : c.pos.clone();
      const dd = Math.hypot(fp.x - c.pos.x, fp.z - c.pos.z);
      target.set(fp.x, Math.max(heightAt(fp.x, fp.z), 0) + (dd > 25 ? 14 : 0), fp.z);
      spd = dd > 25 ? d.fly : Math.min(d.fly * 0.5, dd + 2);
      landing = dd <= 25;
    } else if (c.state === 'chase' && this.targetValid(c.target, player) && c.timer > 0) {
      const tp = this.targetPos(c.target, player);
      const center = new THREE.Vector3(tp.x, tp.y + (c.target === 'player' ? 1.0 : c.target.model.hipH * c.target.scale), tp.z);
      if (c.climbT > 0) target.copy(c.pos).addScaledVector(fwd, 30).setY(ground + 30);
      else target.copy(center);
      spd = d.fly * 1.25;
      const reach = d.reach * c.scale + (c.target === 'player' ? 0.6 : c.target.radius);
      if (c.climbT <= 0 && c.pos.distanceTo(center) < reach && c.attackCd <= 0) {
        c.attackCd = 2.2; c.attackAnim = 1; c.climbT = 2.8;
        if (c.target === 'player') this.hooks.hitPlayer?.(c.dmg, c);
        else this.damage(c.target, c.dmg, 0, c);
        this.hooks.bite?.(c);
      }
      if (!c.target || this.targetPos(c.target, player).distanceTo(c.pos) > 220) { c.state = 'wander'; c.target = null; }
    } else {
      if (c.state === 'chase') { c.state = 'wander'; c.target = null; }
      c.landT -= dt;
      if (d.temper === 'aggressive' && c.scanCd <= 0) {
        c.scanCd = 0.7;
        const t = this.findTarget(c, player);
        if (t) { c.state = 'chase'; c.target = t; c.timer = 30; this.hooks.roar?.(c); }
      }
      if (c.landT <= 0) {
        if (!c.landAt) {
          for (let i = 0; i < 20 && !c.landAt; i++) {
            const x = c.home.x + rand(-80, 80), z = c.home.z + rand(-80, 80), h = heightAt(x, z);
            if (h > 1.5) c.landAt = new THREE.Vector3(x, h, z);
          }
          if (!c.landAt) c.landT = 20;
        }
        if (c.landAt) {
          const dd = Math.hypot(c.landAt.x - c.pos.x, c.landAt.z - c.pos.z);
          target.set(c.landAt.x, dd > 20 ? c.landAt.y + 20 : c.landAt.y, c.landAt.z);
          spd = Math.min(d.fly, dd * 0.8 + 3);
          landing = dd < 20;
        }
      } else {
        if (!c.wp || Math.hypot(c.wp.x - c.pos.x, c.wp.z - c.pos.z) < 15) {
          const x = clamp(c.home.x + rand(-140, 140), -HALF * 0.9, HALF * 0.9), z = clamp(c.home.z + rand(-140, 140), -HALF * 0.9, HALF * 0.9);
          c.wp = new THREE.Vector3(x, Math.max(heightAt(x, z), 0) + rand(28, 65), z);
        }
        target.copy(c.wp);
      }
    }

    // steering
    const dx = target.x - c.pos.x, dz = target.z - c.pos.z;
    const prevYaw = c.yaw;
    if (Math.hypot(dx, dz) > 1) c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 1.6));
    c.speed = lerp(c.speed, spd, Math.min(1, dt * 1.2));
    const vyT = clamp((target.y - c.pos.y) * 0.9, -14, 10);
    c.vy = lerp(c.vy || 0, vyT, Math.min(1, dt * 2));
    c.pos.x += Math.sin(c.yaw) * c.speed * dt;
    c.pos.z += Math.cos(c.yaw) * c.speed * dt;
    c.pos.y += c.vy * dt;
    const g2 = Math.max(heightAt(c.pos.x, c.pos.z), 0);
    if (!landing && c.pos.y < g2 + 4) { c.pos.y = lerp(c.pos.y, g2 + 4, Math.min(1, dt * 3)); c.vy = Math.max(c.vy, 0); }
    if (c.pos.y <= g2 + 0.2) {
      c.pos.y = g2;
      if (landing && g2 > 0.5) { c.flying = false; c.vy = 0; c.speed = 0; c.landAt = null; c.perchT = rand(15, 35); c.landT = rand(40, 90); c.state = c.tamed ? 'tamed' : 'wander'; c.timer = 2; c.goal.copy(c.pos); }
    }
    c.flyPitch = -Math.atan2(c.vy, Math.max(4, c.speed)) * 0.8;
    const turn = ((c.yaw - prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    c.bank = lerp(c.bank || 0, clamp(-turn / Math.max(dt, 1e-3) * 0.35, -0.7, 0.7), Math.min(1, dt * 3));
  }

  // Underwater movement: 3D steering inside the water column, never onto land.
  updateSwim(c, dt, player) {
    const d = c.def;
    const seabed = heightAt(c.pos.x, c.pos.z);
    const target = c._st || (c._st = new THREE.Vector3());
    let spd = d.swim;
    if (c.tamed) {
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.003 * dt);
      const fp = player.pos.clone().add(new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(5));
      const inWater = heightAt(fp.x, fp.z) < -1.5;
      if (c.follow && inWater) { target.set(fp.x, Math.min(-1, Math.max(heightAt(fp.x, fp.z) + 1, player.pos.y)), fp.z); spd = Math.min(d.swim * 1.3, c.pos.distanceTo(target) + 1); }
      else { target.copy(c.pos); spd = 0; }
    } else if (c.state === 'chase' && this.targetValid(c.target, player) && c.timer > 0) {
      const tp = this.targetPos(c.target, player);
      target.set(tp.x, Math.min(tp.y + 0.6, -0.4), tp.z);
      spd = d.swim * 1.4;
      const reach = d.reach * c.scale + (c.target === 'player' ? 0.6 : c.target.radius);
      if (c.pos.distanceTo(target) < reach && c.attackCd <= 0) {
        c.attackCd = 1.8; c.attackAnim = 1;
        if (c.target === 'player') this.hooks.hitPlayer?.(c.dmg, c); else this.damage(c.target, c.dmg, 0, c);
        this.hooks.bite?.(c);
      }
      // the bite may have killed the target (which clears it), so re-check before reading it
      if (!c.target) c.state = 'wander';
      else if (c.target === 'player' && (player.pos.y > 0.6 || heightAt(player.pos.x, player.pos.z) > -0.5)) { c.state = 'wander'; c.target = null; }
    } else {
      if (c.state === 'chase') { c.state = 'wander'; c.target = null; }
      if (d.temper === 'aggressive' && c.scanCd <= 0) { c.scanCd = 0.6; const t = this.findTarget(c, player); if (t) { c.state = 'chase'; c.target = t; c.timer = 20; } }
      if (d.temper === 'skittish' && c.pos.distanceTo(player.pos) < 7) { c.state = 'flee'; c.timer = 3; }
      if (c.state === 'flee') {
        const away = new THREE.Vector3().subVectors(c.pos, player.pos).setY(0).normalize().multiplyScalar(12);
        target.copy(c.pos).add(away); spd = d.run; if (c.timer <= 0) c.state = 'wander';
      } else {
        const lead = c.leader && c.leader.alive ? c.leader : null;
        if (lead) { target.copy(lead.pos).add(new THREE.Vector3(Math.sin(c.id) * 1.5, Math.cos(c.id * 1.7) * 0.6, Math.cos(c.id) * 1.5)); spd = Math.min(d.swim * 1.2, c.pos.distanceTo(target) * 1.5); }
        else {
          if (!c.wp || c.pos.distanceTo(c.wp) < 3) {
            for (let i = 0; i < 12; i++) {
              const x = c.home.x + rand(-60, 60), z = c.home.z + rand(-60, 60), h = heightAt(x, z);
              if (h < -1.8) { c.wp = new THREE.Vector3(x, Math.min(-0.8, h + 1 + Math.random() * (-h - 2)), z); break; }
            }
            if (!c.wp) c.wp = c.home.clone();
          }
          target.copy(c.wp);
        }
      }
    }
    const dx = target.x - c.pos.x, dz = target.z - c.pos.z;
    const prevYaw = c.yaw;
    if (Math.hypot(dx, dz) > 0.3) c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 2.5));
    c.speed = lerp(c.speed, spd, Math.min(1, dt * 2));
    c.vy = lerp(c.vy || 0, clamp((target.y - c.pos.y) * 1.2, -4, 4), Math.min(1, dt * 2));
    const nx = c.pos.x + Math.sin(c.yaw) * c.speed * dt, nz = c.pos.z + Math.cos(c.yaw) * c.speed * dt;
    if (heightAt(nx, nz) < -1.2) { c.pos.x = nx; c.pos.z = nz; } else { c.yaw += Math.PI * 0.5; c.wp = null; c.speed *= 0.5; }
    c.pos.y += c.vy * dt;
    const bed = heightAt(c.pos.x, c.pos.z);
    c.pos.y = clamp(c.pos.y, bed + 0.3, -0.35);
    c.flyPitch = -Math.atan2(c.vy, Math.max(2, c.speed)) * 0.6;
    const turn = ((c.yaw - prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    c.bank = lerp(c.bank || 0, clamp(-turn / Math.max(dt, 1e-3) * 0.2, -0.4, 0.4), Math.min(1, dt * 3));
    c.lieT = Math.max(0, c.lieT - dt);
  }

  // A howl rallies every same-species creature nearby and buffs them for a while.
  howl(c, target) {
    let n = 0;
    for (const o of this.list) {
      if (o.species !== c.species || o.tamed || !o.alive || o.ko || o.pos.distanceTo(c.pos) > 60) continue;
      o.buffT = 12; n++;
      if (o !== c) { o.state = 'chase'; o.target = target; o.timer = 25; }
    }
    this.hooks.howl?.(c, n);
  }

  // Burrowers dig under and erupt beside their target.
  burrowTick(c, dt, player) {
    const d = Math.hypot(player.pos.x - c.pos.x, player.pos.z - c.pos.z);
    if (c.state === 'chase' && c.target === 'player' && !(c.hiddenT > 0)) {
      c.burrowCd = (c.burrowCd ?? 4) - dt;
      if (c.burrowCd <= 0 && d > 6 && d < 32) { c.burrowCd = 9; c.hiddenT = 1.4; this.hooks.burrow?.(c); }
    }
    if (c.hiddenT > 0) {
      c.hiddenT -= dt; c.speed = 0;
      if (c.hiddenT <= 0) {
        const a = Math.random() * Math.PI * 2;
        const nx = player.pos.x + Math.cos(a) * 3, nz = player.pos.z + Math.sin(a) * 3;
        if (!blockedAt(nx, nz) && heightAt(nx, nz) > 0) c.pos.set(nx, heightAt(nx, nz), nz);
        c.yaw = Math.atan2(player.pos.x - c.pos.x, player.pos.z - c.pos.z);
        c.attackAnim = 1;
        this.hooks.emerge?.(c);
        if (Math.hypot(player.pos.x - c.pos.x, player.pos.z - c.pos.z) < 4.5 && player.alive) this.hooks.hitPlayer?.(c.dmg * 1.3, c);
      }
    }
  }

  chase(c, dt, player) {
    const d = c.def;
    const tp = this.targetPos(c.target, player);
    const tr = c.target === 'player' ? 0.4 : c.target.radius;
    const dist = Math.hypot(tp.x - c.pos.x, tp.z - c.pos.z);
    const reach = d.reach * c.scale + tr;
    let spd = dist > reach * 0.8 ? d.run * (c.buffT > 0 ? 1.3 : 1) : 0;
    if (c.shellT > 0) return 0;
    if (d.charge) {
      c.chargeCd = (c.chargeCd || 0) - dt;
      if (!(c.chargeT > 0) && c.chargeCd <= 0 && dist > 7 && dist < 24) { c.chargeT = 1.4; c.chargeCd = 6; c.chargeHit = false; this.hooks.roar?.(c); }
      if (c.chargeT > 0) { c.chargeT -= dt; spd = d.run * 2.2; }
    }
    this.moveToward(c, tp, spd, dt);
    if (c.chargeT > 0 && !c.chargeHit && dist < reach + 0.5) {
      c.chargeHit = true; c.chargeT = 0; c.attackCd = 1.5; c.attackAnim = 1;
      if (c.target === 'player') { this.hooks.hitPlayer?.(c.dmg * 1.6, c); this.hooks.knock?.(c, 14); } else this.damage(c.target, c.dmg * 1.6, 0, c);
      return spd;
    }
    // face target when close
    if (dist < reach * 1.2) c.yaw = angleLerp(c.yaw, Math.atan2(tp.x - c.pos.x, tp.z - c.pos.z), Math.min(1, dt * 6));
    // venom spitters attack from range
    if (d.spit && dist > reach * 1.6 && dist < 22 && c.attackCd <= 0) {
      c.attackCd = 2.4; c.attackAnim = 1;
      c.yaw = Math.atan2(tp.x - c.pos.x, tp.z - c.pos.z);
      this.hooks.spit?.(c, tp.clone().add(new THREE.Vector3(0, c.target === 'player' ? 1.2 : c.target.model.hipH * c.target.scale, 0)));
      return spd;
    }
    if (d.thief && dist < reach && c.target === 'player') {
      this.hooks.steal?.(c);
      c.state = 'flee'; c.threat = 'player'; c.timer = 14; c.target = null;
      return spd;
    }
    if (dist < reach && c.attackCd <= 0) {
      c.attackCd = c.species === 'talonrunner' || c.species === 'dashbeak' ? 1.2 : 1.8;
      c.attackAnim = 1;
      const ambush = d.camo && !c.ambushed; c.ambushed = true;
      if (ambush && c.target === 'player') this.hooks.notify?.('Ambush! A Leafshade lunges from the undergrowth!', 'warn');
      const buff = c.buffT > 0 ? 1.4 : 1;
      if (c.target === 'player') this.hooks.hitPlayer?.(c.dmg * (ambush ? 2 : 1) * buff, c);
      else this.damage(c.target, c.dmg * buff, 0, c);
      this.hooks.bite?.(c);
    }
    return spd;
  }

  animate(c, dt) {
    // far-away creatures are hidden: skip the (heightAt-heavy) pose work
    if (!c.obj.visible && !c.riddenBy) { c.obj.position.copy(c.pos); return; }
    const m = c.model, d = c.def;
    const runK = clamp(c.speed / d.run, 0, 1);
    const moving = c.speed > 0.2;
    const freq = (m.quad ? 1.6 : 2.3) / Math.sqrt(c.scale * (c.model.hipH / 1.2));
    c.phase += dt * c.speed * freq;
    const amp = moving ? lerp(0.35, 0.75, runK) : 0;
    for (const L of m.legs) {
      const s = Math.sin(c.phase + L.ph);
      L.g.rotation.x = lerp(L.g.rotation.x, s * amp, Math.min(1, dt * 12));
      if (L.knee) L.knee.rotation.x = lerp(L.knee.rotation.x, Math.max(0, Math.cos(c.phase + L.ph)) * amp * 1.3, Math.min(1, dt * 12));
    }
    const t = performance.now() / 1000 + c.id;
    const breath = Math.sin(t * 1.8) * 0.015;
    m.body.position.y = m.hipH + Math.abs(Math.sin(c.phase)) * 0.06 * amp * m.hipH + breath * m.hipH * 0.3 + (m.hop && moving ? Math.abs(Math.sin(c.phase * 1.0)) * 0.12 : 0);
    m.body.rotation.z = Math.sin(c.phase) * 0.04 * amp;
    for (let i = 0; i < m.tail.length; i++) {
      m.tail[i].rotation.y = Math.sin(t * (moving ? 3 : 1.2) - i * 0.7) * (0.08 + runK * 0.08);
      if (!m.quad || i > 0) m.tail[i].rotation.x = lerp(m.tail[i].rotation.x, (moving ? -0.03 : 0.05) , dt * 3);
    }
    const grazing = c.state === 'wander' && !moving && c.graze > 0;
    const look = grazing ? 0.6 + Math.sin(t * 2) * 0.1 : -0.05 + Math.sin(t * 0.7) * 0.05;
    if (m.neckSegs) {
      m.neck.rotation.x = lerp(m.neck.rotation.x, grazing ? 1.6 : 0.95 + Math.sin(t * 0.4) * 0.08, dt * 0.8);
      m.neck.rotation.y = Math.sin(t * 0.3) * 0.25;
    } else {
      m.neck.rotation.x = lerp(m.neck.rotation.x, look - c.attackAnim * 0.3, dt * 4);
      m.neck.rotation.y = Math.sin(t * 0.5) * 0.12;
    }
    if (m.jaw) m.jaw.rotation.x = Math.max(c.attackAnim * 0.7, (c.state === 'chase' ? 0.15 : 0) + (c.roarT > 0 ? 0.7 : 0));
    if (c.roarT > 0) c.roarT -= dt;
    if (m.head && !m.neckSegs) m.head.rotation.x = c.attackAnim * 0.4;

    // body pitch to terrain
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const L = c.radius * 1.2;
    const hf = heightAt(c.pos.x + fx * L, c.pos.z + fz * L), hb = heightAt(c.pos.x - fx * L, c.pos.z - fz * L);
    const pitch = Math.atan2(hb - hf, L * 2);

    c.obj.position.copy(c.pos);
    const lie = c.lieT * c.lieT * (3 - 2 * c.lieT);
    c.obj.position.y += lie * m.lie * c.scale - lie * m.hipH * c.scale * 0.0;
    c.obj.rotation.set(0, 0, 0);
    c.obj.rotation.order = 'YXZ';
    c.obj.rotation.y = c.yaw;
    c.obj.rotation.x = lerp(pitch, 0, lie) * 0.8;
    c.obj.rotation.z = lie * Math.PI / 2;
    if (m.swim && c.state !== 'ko' && c.state !== 'dead') {
      const k = 0.4 + clamp(c.speed / (d.swim || 4), 0, 1.4);
      c.swimPh = (c.swimPh || 0) + dt * (m.legs.length ? 3 : 9) * k;
      for (let i = 0; i < m.tail.length; i++) m.tail[i].rotation.y = Math.sin(c.swimPh - i * 0.8) * (m.legs.length ? 0.22 : 0.6);
      m.body.rotation.y = Math.sin(c.swimPh) * (m.legs.length ? 0.05 : 0.15);
      for (const L of m.legs) { L.g.rotation.set(Math.sin(c.swimPh + L.ph) * 0.4, 0, L.flipper * Math.sin(c.swimPh * 0.5 + L.ph) * 0.3); }
      m.body.position.y = m.hipH;
      c.obj.rotation.x = c.flyPitch || 0;
      c.obj.rotation.z = c.bank || 0;
    }
    if (m.wings) {
      const glide = c.flying && (c.vy || 0) <= 0.5 && c.speed > d.fly * 0.6;
      if (c.flying && c.state !== 'ko' && c.state !== 'dead') {
        const freq = glide ? 2 : 7, amp = glide ? 0.12 : 0.75;
        c.wingPh = (c.wingPh || 0) + dt * freq;
        for (const w of m.wings) {
          w.g.rotation.set(0, 0, w.side * Math.sin(c.wingPh) * amp);
          w.outer.rotation.set(0, 0, w.side * Math.sin(c.wingPh - 0.7) * amp * 0.6);
        }
        for (const L of m.legs) { L.g.rotation.x = 1.1; if (L.knee) L.knee.rotation.x = 0.3; }
        c.obj.rotation.x = c.flyPitch || 0;
        c.obj.rotation.z = c.bank || 0;
      } else if (c.flying) {
        for (const w of m.wings) { w.g.rotation.set(0, 0, w.side * 0.9); w.outer.rotation.set(0, 0, w.side * 0.6); }
      } else {
        for (const w of m.wings) { w.g.rotation.set(0, w.side * -0.5, w.side * 1.05); w.outer.rotation.set(0, 0, -w.side * 2.5); }
      }
    }
    if (lie > 0) {
      // lower so the body rests on the ground instead of floating at hip height
      c.obj.position.y -= 0; // body already laterally offset by rotation
    }
  }
}
