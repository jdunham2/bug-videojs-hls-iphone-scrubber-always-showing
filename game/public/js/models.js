// Procedural stylized characters, enemies and weapons + a procedural animation system.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RARITIES } from '../shared/items.js';

const geoCache = new Map();
function cg(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
const capsule = (r, l) => cg(`cap${r}_${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
const sphere = (r, w = 16, h = 12) => cg(`sph${r}_${w}`, () => new THREE.SphereGeometry(r, w, h));
const rbox = (w, h, d, r = 0.05) => cg(`rb${w}_${h}_${d}_${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r));
const box = (w, h, d) => cg(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 10) => cg(`c${rt}_${rb}_${h}_${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const cone = (r, h, s = 10) => cg(`co${r}_${h}_${s}`, () => new THREE.ConeGeometry(r, h, s));

export const RARITY_TINT = ['#a4abb5', '#9fc3a8', '#8fb3e6', '#a98cd6', '#f2c063'];
export const RARITY_GLOW = [0, 0.15, 0.6, 1.2, 2.2];

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, emissive: o.emissive || '#000000', emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat, transparent: !!o.transparent });
}

// ---------- WEAPONS ----------
export function buildWeapon(type, rarity = 0) {
  const g = new THREE.Group();
  const col = RARITIES[rarity]?.color || '#ccc';
  const metal = std(RARITY_TINT[rarity] || '#aab', { metal: 0.9, rough: 0.28, emissive: col, ei: RARITY_GLOW[rarity] * 0.35 });
  const edge = std('#ffffff', { metal: 0.5, rough: 0.2, emissive: col, ei: 0.3 + RARITY_GLOW[rarity] });
  const wood = std('#5b3a22', { rough: 0.9 });
  const gold = std('#d7a443', { metal: 1, rough: 0.3 });
  const mats = [metal, edge];
  if (type === 'sword') {
    mesh(cyl(0.032, 0.032, 0.24), wood, 0, 0.02, 0, g);
    mesh(sphere(0.05, 8, 6), gold, 0, -0.12, 0, g);
    mesh(box(0.32, 0.05, 0.07), gold, 0, 0.16, 0, g);
    mesh(box(0.1, 0.84, 0.03), metal, 0, 0.6, 0, g);
    mesh(box(0.025, 0.86, 0.035), edge, 0, 0.6, 0, g);
    const tip = mesh(cone(0.07, 0.2, 4), metal, 0, 1.12, 0, g); tip.rotation.y = Math.PI / 4; tip.scale.z = 0.3;
  } else if (type === 'axe') {
    mesh(cyl(0.035, 0.04, 1.05), wood, 0, 0.35, 0, g);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.12); shape.quadraticCurveTo(0.22, 0.2, 0.36, 0.32); shape.quadraticCurveTo(0.3, 0, 0.36, -0.32); shape.quadraticCurveTo(0.22, -0.2, 0, -0.12); shape.lineTo(0, 0.12);
    const hg = cg('axehead', () => new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 }));
    const head = mesh(hg, metal, 0.02, 0.72, -0.025, g);
    const sp = mesh(cone(0.05, 0.18, 4), edge, -0.1, 0.72, 0, g); sp.rotation.z = Math.PI / 2;
    mesh(box(0.08, 0.12, 0.08), gold, 0, 0.72, 0, g);
    mats.push(head.material);
  } else if (type === 'hammer') {
    mesh(cyl(0.04, 0.045, 1.1), wood, 0, 0.38, 0, g);
    mesh(rbox(0.46, 0.26, 0.26, 0.04), metal, 0, 0.9, 0, g);
    mesh(box(0.48, 0.06, 0.28), edge, 0, 0.9, 0, g);
    const sp = mesh(cone(0.07, 0.22, 4), metal, 0, 1.12, 0, g);
    mesh(box(0.1, 0.1, 0.1), gold, 0, 0.72, 0, g);
    sp.rotation.y = Math.PI / 4;
  } else if (type === 'dagger') {
    mesh(cyl(0.028, 0.028, 0.16), wood, 0, 0, 0, g);
    mesh(box(0.2, 0.04, 0.05), gold, 0, 0.1, 0, g);
    mesh(box(0.07, 0.42, 0.02), metal, 0, 0.32, 0, g);
    mesh(box(0.02, 0.44, 0.03), edge, 0, 0.32, 0, g);
    const tip = mesh(cone(0.05, 0.12, 4), metal, 0, 0.58, 0, g); tip.rotation.y = Math.PI / 4; tip.scale.z = 0.3;
  } else if (type === 'club') {
    const w2 = std('#4b3424', { rough: 1 });
    mesh(cyl(0.12, 0.05, 1.0, 8), w2, 0, 0.45, 0, g);
    for (let i = 0; i < 5; i++) { const s = mesh(cone(0.04, 0.14, 4), std('#aaa', { metal: 0.6 }), Math.cos(i * 1.3) * 0.11, 0.7 + i * 0.05, Math.sin(i * 1.3) * 0.11, g); s.rotation.z = Math.cos(i * 1.3) * -1.4; s.rotation.x = Math.sin(i * 1.3) * 1.4; }
  } else if (type === 'cleaver') {
    mesh(cyl(0.05, 0.05, 0.5), std('#2a1a12'), 0, 0.1, 0, g);
    const red = std('#3a3436', { metal: 0.8, rough: 0.35, emissive: '#ff2a10', ei: 0.4 });
    mesh(box(0.55, 1.5, 0.06), red, 0.12, 1.1, 0, g);
    mesh(box(0.06, 1.5, 0.08), std('#ff6a3a', { emissive: '#ff3a10', ei: 2.5 }), 0.4, 1.1, 0, g);
  } else if (type === 'orb') {
    mesh(cyl(0.025, 0.03, 0.9), wood, 0, 0.2, 0, g);
    mesh(sphere(0.13, 14, 10), std('#ff5cf0', { emissive: '#ff3ad8', ei: 3 }), 0, 0.72, 0, g);
    mesh(new THREE.TorusGeometry(0.17, 0.015, 6, 20), gold, 0, 0.72, 0, g);
  } else if (type === 'claws') {
    for (let i = -1; i <= 1; i++) { const c = mesh(cone(0.025, 0.35, 4), std('#d6d0ff', { emissive: '#8a5cff', ei: 1.5 }), i * 0.05, 0.12, 0.05, g); c.rotation.x = 0.4; }
  }
  g.userData.mats = mats;
  return g;
}

// ---------- HUMANOID RIG ----------
/**
 * o: { skin, cloth, armor, accent, scale, bulk, legs: 'normal'|'robe'|'none', head: 'human'|'skull'|'hood'|'imp',
 *      eyes, horns, wings, tail, crown, weapon, offhand, rarity, cape, bones }
 */
export function buildHumanoid(o = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const S = o.scale || 1; body.scale.setScalar(S);
  const bulk = o.bulk || 1;
  const mats = [];
  const M = (c, opt) => { const m = std(c, opt); mats.push(m); return m; };
  const skin = M(o.skin || '#e2b48f', { rough: 0.8 });
  const cloth = M(o.cloth || '#8a2b2b', { rough: 0.85 });
  const armor = M(o.armor || '#9aa3ad', { metal: 0.85, rough: 0.35 });
  const leather = M(o.leather || '#4b3121', { rough: 0.9 });
  const eyeMat = o.eyes ? M(o.eyes, { emissive: o.eyes, ei: 3 }) : null;
  const P = {};
  const hips = new THREE.Group(); hips.position.y = 0.9; body.add(hips); P.hips = hips;
  const spine = new THREE.Group(); spine.position.y = 0.05; hips.add(spine); P.spine = spine;

  // torso
  if (o.bones) {
    mesh(cyl(0.05, 0.05, 0.7, 6), skin, 0, 0.35, -0.05, spine);
    for (let i = 0; i < 4; i++) { const r = mesh(new THREE.TorusGeometry(0.2 * bulk - i * 0.02, 0.03, 5, 12, Math.PI * 1.4), skin, 0, 0.62 - i * 0.12, 0, spine); r.rotation.set(Math.PI / 2, 0, -Math.PI * 0.2 + Math.PI / 2 + 0.5); r.rotation.z = Math.PI * 0.8; }
    mesh(rbox(0.36 * bulk, 0.14, 0.2, 0.05), skin, 0, 0.02, 0, spine);
  } else {
    P.torso = mesh(rbox(0.62 * bulk, 0.72, 0.38 * Math.min(bulk, 1.3), 0.1), cloth, 0, 0.4, 0, spine);
    P.belt = mesh(box(0.66 * bulk, 0.1, 0.42 * Math.min(bulk, 1.3)), leather, 0, 0.08, 0, spine);
    mesh(box(0.1, 0.08, 0.05), M('#d7a443', { metal: 1, rough: 0.3 }), 0, 0.08, 0.21 * Math.min(bulk, 1.3), spine);
  }
  P.chestPlate = mesh(rbox(0.66 * bulk, 0.5, 0.44 * Math.min(bulk, 1.3), 0.1), armor, 0, 0.52, 0, spine);
  P.chestPlate.visible = !!o.chestPlate;

  // head
  const head = new THREE.Group(); head.position.y = 0.98; spine.add(head); P.head = head;
  if (o.head === 'skull') {
    mesh(sphere(0.21, 12, 10), skin, 0, 0.05, 0, head);
    const jaw = mesh(box(0.22, 0.08, 0.2), skin, 0, -0.12, 0.04, head); jaw.rotation.x = 0.15;
    if (eyeMat) { mesh(sphere(0.045, 8, 6), eyeMat, -0.08, 0.06, 0.17, head); mesh(sphere(0.045, 8, 6), eyeMat, 0.08, 0.06, 0.17, head); }
  } else if (o.head === 'hood') {
    const hood = mesh(cone(0.3, 0.6, 10), cloth, 0, 0.12, -0.02, head);
    mesh(sphere(0.2, 10, 8), M('#050208'), 0, 0.0, 0.06, head);
    if (eyeMat) { mesh(sphere(0.035, 8, 6), eyeMat, -0.07, 0.02, 0.22, head); mesh(sphere(0.035, 8, 6), eyeMat, 0.07, 0.02, 0.22, head); }
    hood.scale.z = 1.1;
  } else {
    mesh(sphere(0.22), skin, 0, 0.04, 0, head);
    if (eyeMat) { mesh(sphere(0.04, 8, 6), eyeMat, -0.08, 0.06, 0.19, head); mesh(sphere(0.04, 8, 6), eyeMat, 0.08, 0.06, 0.19, head); }
    else { const em = M('#1a1a1a'); mesh(sphere(0.03, 6, 6), em, -0.08, 0.06, 0.2, head); mesh(sphere(0.03, 6, 6), em, 0.08, 0.06, 0.2, head); }
    if (o.head === 'imp') {
      mesh(cone(0.08, 0.18, 6), skin, 0, -0.02, 0.22, head).rotation.x = Math.PI / 2;
    } else if (!o.noHair) {
      P.hair = mesh(sphere(0.235, 14, 10), M(o.hair || '#3a2414', { rough: 1 }), 0, 0.09, -0.03, head);
      P.hair.scale.set(1, 0.8, 1);
    }
  }
  if (o.horns) for (const s of [-1, 1]) { const h = mesh(cone(0.06, 0.32, 6), M(o.hornColor || '#2a1a14'), 0.14 * s, 0.24, 0, head); h.rotation.z = -0.5 * s; }
  if (o.crown) {
    const gm = M('#ffcf4d', { metal: 1, rough: 0.25, emissive: '#ff9a20', ei: 1.2 });
    mesh(cyl(0.2, 0.22, 0.08, 10), gm, 0, 0.22, 0, head);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mesh(cone(0.04, 0.16, 4), gm, Math.cos(a) * 0.2, 0.33, Math.sin(a) * 0.2, head); }
  }
  // helmet (toggled by gear)
  P.helm = new THREE.Group(); head.add(P.helm);
  P.helmMat = M('#9aa3ad', { metal: 0.85, rough: 0.3 });
  mesh(sphere(0.25, 16, 12), P.helmMat, 0, 0.09, 0, P.helm).scale.set(1, 0.95, 1.05);
  mesh(box(0.34, 0.05, 0.1), P.helmMat, 0, 0.02, 0.2, P.helm);
  P.crest = mesh(box(0.05, 0.16, 0.42), M('#c22', { emissive: '#f33', ei: 0 }), 0, 0.32, -0.02, P.helm);
  P.helm.visible = false;

  // arms
  const armW = 0.4 * bulk;
  const mkArm = (side) => {
    const a = new THREE.Group(); a.position.set(armW * side, 0.72, 0); spine.add(a);
    mesh(capsule(0.085 * Math.sqrt(bulk), 0.26), o.bones ? skin : cloth, 0, -0.18, 0, a);
    const pd = mesh(sphere(0.15 * Math.sqrt(bulk), 12, 8), armor, 0.03 * side, 0.02, 0, a); pd.scale.set(1.1, 0.75, 1.1);
    pd.visible = !o.bones || o.pauldrons;
    const f = new THREE.Group(); f.position.y = -0.38; a.add(f);
    mesh(capsule(0.075 * Math.sqrt(bulk), 0.22), o.bones ? skin : leather, 0, -0.14, 0, f);
    const hand = new THREE.Group(); hand.position.y = -0.32; f.add(hand);
    mesh(sphere(0.085 * Math.sqrt(bulk), 10, 8), skin, 0, 0, 0, hand);
    return { a, f, hand, pd };
  };
  const L = mkArm(-1), R = mkArm(1);
  P.armL = L.a; P.foreL = L.f; P.handL = L.hand; P.armR = R.a; P.foreR = R.f; P.handR = R.hand;

  // legs
  if (o.legs === 'robe' || o.legs === 'none') {
    const robe = mesh(cyl(0.26 * bulk, o.legs === 'none' ? 0.08 : 0.46 * bulk, o.legs === 'none' ? 1.1 : 0.95, 12), cloth, 0, o.legs === 'none' ? -0.45 : -0.42, 0, hips);
    P.robe = robe;
    if (o.legs === 'none') { robe.scale.z = 0.8; P.trim = mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 16), M(o.eyes || '#a6f', { emissive: o.eyes || '#a6f', ei: 2 }), 0, -0.4, 0, hips); P.trim.rotation.x = Math.PI / 2; }
  } else {
    const mkLeg = (side) => {
      const l = new THREE.Group(); l.position.set(0.16 * bulk * side, 0, 0); hips.add(l);
      mesh(capsule(0.1 * Math.sqrt(bulk), 0.26), o.bones ? skin : leather, 0, -0.2, 0, l);
      const s = new THREE.Group(); s.position.y = -0.43; l.add(s);
      mesh(capsule(0.09 * Math.sqrt(bulk), 0.24), o.bones ? skin : leather, 0, -0.17, 0, s);
      const boot = mesh(rbox(0.17, 0.12, 0.3, 0.04), o.bones ? skin : leather, 0, -0.38, 0.05, s);
      return { l, s, boot };
    };
    const LL = mkLeg(-1), RL = mkLeg(1);
    P.legL = LL.l; P.shinL = LL.s; P.legR = RL.l; P.shinR = RL.s; P.bootL = LL.boot; P.bootR = RL.boot;
  }
  if (o.cape) {
    const capeMat = M(o.cape, { rough: 0.9 }); capeMat.side = THREE.DoubleSide;
    const capePivot = new THREE.Group(); capePivot.position.set(0, 0.74, -0.2 * Math.min(bulk, 1.3)); spine.add(capePivot);
    const cp = mesh(cg('capeGeo', () => { const gg = new THREE.PlaneGeometry(0.62, 1.05, 1, 6); gg.translate(0, -0.52, 0); return gg; }), capeMat, 0, 0, 0, capePivot);
    cp.castShadow = true;
    P.cape = capePivot;
  }
  if (o.wings) {
    const wm = M(o.wingColor || '#3a0d0d', { rough: 0.7 }); wm.side = THREE.DoubleSide;
    for (const s of [-1, 1]) {
      const wp = new THREE.Group(); wp.position.set(0.12 * s, 0.6, -0.2); spine.add(wp);
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0.55 * s, 0.35); shape.lineTo(0.5 * s, -0.05); shape.lineTo(0.35 * s, -0.25); shape.lineTo(0.1 * s, -0.2);
      mesh(new THREE.ShapeGeometry(shape), wm, 0, 0, 0, wp);
      P['wing' + (s < 0 ? 'L' : 'R')] = wp;
    }
  }
  if (o.tail) { const t = mesh(cone(0.05, 0.6, 6), skin, 0, 0.05, -0.32, hips); t.rotation.x = -2.2; P.tail = t; }

  const rig = { root, body, P, mats, opts: o, weapon: null, offhand: null, scale: S };
  if (o.weapon) setWeapon(rig, o.weapon, o.rarity || 0, o.offhand);
  rig.baseEmissive = mats.map((m) => m.emissive.clone());
  return rig;
}

export function setWeapon(rig, type, rarity = 0, offhand) {
  const P = rig.P;
  if (rig.weapon) { P.handR.remove(rig.weapon); rig.weapon = null; }
  if (rig.offhand) { P.handL.remove(rig.offhand); rig.offhand = null; }
  const w = buildWeapon(type, rarity);
  w.rotation.x = Math.PI / 2; w.position.z = 0.02;
  P.handR.add(w); rig.weapon = w;
  if (type === 'dagger' || offhand) {
    const w2 = buildWeapon(offhand || type, rarity);
    w2.rotation.x = Math.PI / 2; P.handL.add(w2); rig.offhand = w2;
  }
}

export function applyGear(rig, gear, color) {
  const P = rig.P;
  if (!rig.gearKey || rig.gearKey.w !== gear.w || rig.gearKey.wr !== gear.wr) setWeapon(rig, gear.w, gear.wr);
  rig.gearKey = { ...gear };
  P.helm.visible = gear.h >= 0;
  if (P.hair) P.hair.visible = gear.h < 0;
  if (gear.h >= 0) {
    P.helmMat.color.set(RARITY_TINT[gear.h]);
    P.crest.visible = gear.h >= 2;
    P.crest.material.color.set(RARITIES[gear.h].color);
    P.crest.material.emissive.set(RARITIES[gear.h].color);
    P.crest.material.emissiveIntensity = RARITY_GLOW[gear.h];
  }
  P.chestPlate.visible = gear.c >= 0;
  if (gear.c >= 0) {
    P.chestPlate.material.color.set(RARITY_TINT[gear.c]);
    P.chestPlate.material.emissive.set(RARITIES[gear.c].color);
    P.chestPlate.material.emissiveIntensity = RARITY_GLOW[gear.c] * 0.12;
  }
  if (P.bootL) {
    const bc = gear.b >= 0 ? RARITY_TINT[gear.b] : '#4b3121';
    P.bootL.material.color.set(bc); P.bootL.material.metalness = gear.b >= 0 ? 0.8 : 0;
  }
  rig.baseEmissive = rig.mats.map((m) => m.emissive.clone());
}

export function buildHero(color) {
  const rig = buildHumanoid({ cloth: color, cape: color, armor: '#9aa3ad', weapon: 'sword', rarity: 0 });
  return rig;
}

export function buildEnemy(type) {
  switch (type) {
    case 'skeleton': return buildHumanoid({ bones: true, skin: '#d8d0bc', head: 'skull', eyes: '#5ff3ff', weapon: 'sword', rarity: 0, armor: '#6b6560' });
    case 'brute': return buildHumanoid({ scale: 1.45, bulk: 1.5, skin: '#6e7a55', cloth: '#3b2a1e', armor: '#5a5048', eyes: '#ffb020', horns: true, hornColor: '#cfc6b0', weapon: 'club', chestPlate: true, noHair: true });
    case 'cultist': return buildHumanoid({ legs: 'robe', head: 'hood', cloth: '#3b1238', eyes: '#ff4ff0', skin: '#8a7a70', weapon: 'orb', armor: '#2a2030' });
    case 'imp': return buildHumanoid({ scale: 0.62, skin: '#c2361f', cloth: '#5a1208', head: 'imp', horns: true, eyes: '#ffe84a', wings: true, tail: true, weapon: 'claws', noHair: true, armor: '#5a1208' });
    case 'wraith': return buildHumanoid({ legs: 'none', head: 'skull', skin: '#bfb6d8', cloth: '#1b1028', eyes: '#b26bff', weapon: 'claws', offhand: 'claws', armor: '#2b1a40', cape: '#120a1e' });
    case 'boss': return buildHumanoid({ scale: 2.5, bulk: 1.35, bones: true, pauldrons: true, skin: '#e3d9c0', head: 'skull', eyes: '#ff3018', crown: true, weapon: 'cleaver', armor: '#3b3233', cape: '#4a0a0a' });
    case 'merchant': return buildHumanoid({ legs: 'robe', head: 'hood', cloth: '#251a3a', eyes: '#9cf', skin: '#7a6a60', armor: '#3a2a50', weapon: 'orb' });
  }
  return buildHumanoid({});
}

// ---------- ANIMATION ----------
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t * t;
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const ATTACK_POSES = [
  // diagonal slash
  { B: { arx: -2.5, arz: -0.5, sy: 0.7, sx: -0.1, fx: -0.6, alx: 0.4 }, C: { arx: 0.5, arz: 0.5, sy: -0.7, sx: 0.25, fx: 0, alx: -0.3 } },
  // horizontal backhand
  { B: { arx: -1.5, arz: 1.3, sy: -1.0, sx: 0, fx: -0.3, alx: -0.5 }, C: { arx: -1.4, arz: -0.9, sy: 1.1, sx: 0.15, fx: 0, alx: 0.4 } },
  // overhead smash
  { B: { arx: -3.1, arz: 0, sy: 0.1, sx: -0.35, fx: -0.4, alx: -3.0 }, C: { arx: -0.1, arz: 0, sy: 0, sx: 0.5, fx: 0, alx: -0.2 } },
];
const NEUTRAL = { arx: 0, arz: 0, sy: 0, sx: 0, fx: 0, alx: 0 };

function poseAt(p, B, C) {
  const out = {};
  for (const k in NEUTRAL) {
    let v;
    if (p < 0.35) v = NEUTRAL[k] + (B[k] - NEUTRAL[k]) * easeOut(p / 0.35);
    else if (p < 0.55) v = B[k] + (C[k] - B[k]) * easeIn((p - 0.35) / 0.2);
    else v = C[k] + (NEUTRAL[k] - C[k]) * easeIO((p - 0.55) / 0.45);
    out[k] = v;
  }
  return out;
}

/** s: { t, move, atk (-1|0..1), combo, slam(-1|0..1), dash, air, dead(0..1), hurt(0..1), float, cast } */
export function animateRig(rig, s) {
  const P = rig.P, t = s.t, mv = Math.min(1, s.move || 0);
  const w = t * (s.float ? 3 : 10.5);
  const floaty = rig.opts.legs === 'none';
  if (P.legL) {
    const sw = Math.sin(w) * 0.85 * mv;
    P.legL.rotation.x = s.air ? -0.6 : sw;
    P.legR.rotation.x = s.air ? 0.3 : -sw;
    P.shinL.rotation.x = s.air ? 1.0 : Math.max(0, Math.sin(w + 1.6)) * 1.1 * mv;
    P.shinR.rotation.x = s.air ? 0.5 : Math.max(0, Math.sin(w + 1.6 + Math.PI)) * 1.1 * mv;
  }
  const baseY = 0.9;
  P.hips.position.y = baseY + (floaty ? 0.35 + Math.sin(t * 2.2) * 0.12 : Math.abs(Math.sin(w)) * 0.06 * mv - (s.air ? 0.05 : 0));
  P.hips.rotation.y = Math.sin(w) * 0.12 * mv;
  let armLx = -(P.legL ? P.legL.rotation.x : Math.sin(t * 2) * 0.2) * 0.8;
  let armRx = -(P.legR ? P.legR.rotation.x : -Math.sin(t * 2) * 0.2) * 0.8;
  let armRz = 0.08, armLz = -0.08, sy = -P.hips.rotation.y, sx = 0.12 * mv + Math.sin(t * 2) * 0.015, fx = -0.25, fLx = -0.25;
  if (floaty) { armLx = -0.9 + Math.sin(t * 3) * 0.2; armRx = -0.9 + Math.cos(t * 3) * 0.2; fx = -0.6; fLx = -0.6; }
  if (s.atk >= 0) {
    const ap = ATTACK_POSES[(s.combo || 0) % 3];
    const q = poseAt(s.atk, ap.B, ap.C);
    armRx = q.arx; armRz = q.arz; sy = q.sy; sx = q.sx; fx = q.fx;
    if ((s.combo || 0) % 3 === 2 || rig.offhand) { armLx = q.alx; }
  }
  if (s.slam >= 0) {
    const p = s.slam;
    const up = p < 0.45 ? easeOut(p / 0.45) : 1 - easeIn(Math.min(1, (p - 0.45) / 0.12));
    armRx = -3.0 * up - 0.2; armLx = -3.0 * up - 0.2; sx = -0.3 * up + (p > 0.5 ? 0.5 * (1 - (p - 0.5) * 2) : 0); fx = -0.3;
  }
  if (s.cast > 0) { armRx = -1.6 * s.cast; armLx = -1.6 * s.cast; fx = -0.2; }
  if (s.dash) { sx = 0.55; armLx = 0.9; armRx = 0.9; }
  if (s.hurt > 0) { sx -= 0.35 * s.hurt; }
  P.armL.rotation.x = armLx; P.armL.rotation.z = armLz - (floaty ? 0.3 : 0);
  P.armR.rotation.x = armRx; P.armR.rotation.z = armRz + (floaty ? 0.3 : 0);
  P.foreR.rotation.x = fx; P.foreL.rotation.x = fLx;
  P.spine.rotation.y = sy; P.spine.rotation.x = sx;
  P.head.rotation.x = -sx * 0.5;
  if (P.cape) P.cape.rotation.x = 0.15 + mv * 0.55 + Math.sin(t * 3.1) * 0.06 + (s.dash ? 0.6 : 0);
  if (P.wingL) { const f = Math.sin(t * 18) * 0.6; P.wingL.rotation.y = 0.4 + f; P.wingR.rotation.y = -0.4 - f; }
  if (P.tail) P.tail.rotation.z = Math.sin(t * 4) * 0.4;
  if (P.robe && rig.opts.legs === 'robe') P.robe.rotation.x = -0.08 * mv;
  // death
  const d = s.dead || 0;
  rig.body.rotation.x = -easeOut(Math.min(1, d * 1.6)) * Math.PI * 0.48;
  rig.body.position.y = -Math.max(0, d - 0.6) * 0.8;
}

export function flashRig(rig, k) {
  for (let i = 0; i < rig.mats.length; i++) {
    const m = rig.mats[i], b = rig.baseEmissive[i];
    m.emissive.setRGB(b.r + k, b.g + k * 0.9, b.b + k * 0.8);
  }
}

export function fadeRig(rig, opacity) {
  for (const m of rig.mats) { m.transparent = opacity < 1; m.opacity = opacity; }
  const walk = (o) => { o.traverse?.((c) => { if (c.material && !rig.mats.includes(c.material)) { c.material.transparent = opacity < 1; c.material.opacity = opacity; } }); };
  if (rig.weapon) walk(rig.weapon);
  if (rig.offhand) walk(rig.offhand);
}
