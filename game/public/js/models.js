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
  } else if (type === 'staff') {
    mesh(cyl(0.035, 0.045, 1.6, 8), wood, 0, 0.35, 0, g);
    const crys = mesh(cg('staffCrystal', () => new THREE.OctahedronGeometry(0.15, 0)), std(col, { emissive: col, ei: 1.5 + RARITY_GLOW[rarity], rough: 0.2 }), 0, 1.32, 0, g);
    crys.scale.y = 1.6;
    for (const s of [-1, 1]) { const prong = mesh(cone(0.03, 0.32, 5), gold, 0.11 * s, 1.18, 0, g); prong.rotation.z = -0.35 * s; }
    mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 14), gold, 0, 1.08, 0, g).rotation.x = Math.PI / 2;
    mats.push(crys.material);
  } else if (type === 'shield') {
    const face = std(g.userData.color || '#5a6a8a', { metal: 0.5, rough: 0.45 });
    mesh(cyl(0.42, 0.42, 0.07, 18), face, 0, 0.05, 0.05, g);
    mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 24), gold, 0, 0.09, 0.05, g).rotation.x = Math.PI / 2;
    mesh(sphere(0.1, 10, 8), gold, 0, 0.1, 0.05, g);
    g.userData.face = face;
  } else if (type === 'lifeorb') {
    mesh(cyl(0.025, 0.03, 0.9), wood, 0, 0.2, 0, g);
    mesh(sphere(0.14, 14, 10), std('#7dffb0', { emissive: '#2aff7a', ei: 3 }), 0, 0.72, 0, g);
    mesh(new THREE.TorusGeometry(0.18, 0.015, 6, 20), gold, 0, 0.72, 0, g);
  } else if (type === 'towershield') {
    const face = std('#4a4038', { metal: 0.6, rough: 0.4 });
    mesh(box(0.85, 1.25, 0.08), face, 0, 0.1, 0.06, g);
    mesh(box(0.12, 1.1, 0.12), gold, 0, 0.1, 0.12, g);
    g.userData.face = face;
  } else if (type === 'ram') {
    mesh(cyl(0.22, 0.26, 2.8, 10), std('#4b3424', { rough: 1 }), 0, 0.6, 0, g);
    mesh(cyl(0.32, 0.3, 0.5, 10), std('#3a3a40', { metal: 0.9, rough: 0.4 }), 0, 2.0, 0, g);
    for (const y of [-0.3, 0.9]) mesh(new THREE.TorusGeometry(0.26, 0.04, 6, 14), std('#3a3a40', { metal: 0.9 }), 0, y, 0, g).rotation.x = Math.PI / 2;
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
  offhand = offhand || rig.opts.offhand || (rig.opts.dual && type !== 'staff' ? type : undefined);
  if (rig.weapon) { P.handR.remove(rig.weapon); rig.weapon = null; }
  if (rig.offhand) { P.handL.remove(rig.offhand); rig.offhand = null; }
  const w = buildWeapon(type, rarity);
  w.rotation.x = Math.PI / 2; w.position.z = 0.02;
  P.handR.add(w); rig.weapon = w;
  if (type === 'dagger' || offhand) {
    const w2 = buildWeapon(offhand || type, rarity);
    w2.rotation.x = Math.PI / 2; P.handL.add(w2); rig.offhand = w2;
    if (offhand === 'shield') { w2.position.set(-0.06, -0.05, 0); if (rig.opts.shieldColor) w2.userData.face.color.set(rig.opts.shieldColor); }
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

export function buildHero(color, cls = 'warden') {
  if (cls === 'emberblade') {
    const rig = buildHumanoid({ cloth: '#2a2024', leather: '#3a2618', cape: color, armor: '#6a5a50', weapon: 'dagger', dual: true, hair: '#c23a1a' });
    const scarf = mesh(new THREE.TorusGeometry(0.2, 0.07, 6, 14), std(color, { rough: 0.9 }), 0, 0.78, 0, rig.P.spine); scarf.rotation.x = Math.PI / 2;
    rig.mats.push(scarf.material);
    const mask = mesh(box(0.34, 0.1, 0.1), std('#1a1214', { rough: 0.8 }), 0, -0.03, 0.17, rig.P.head); rig.mats.push(mask.material);
    rig.baseEmissive = rig.mats.map((m) => m.emissive.clone());
    return rig;
  }
  if (cls === 'hexcaller') {
    const rig = buildHumanoid({ legs: 'robe', cloth: '#2a1f4a', cape: color, armor: '#4a3a6a', weapon: 'staff', noHair: true });
    const hatMat = std('#241a40', { rough: 0.9 }); rig.mats.push(hatMat);
    const brim = mesh(cyl(0.42, 0.42, 0.04, 16), hatMat, 0, 0.17, 0, rig.P.head);
    const tip = mesh(cone(0.24, 0.62, 12), hatMat, 0, 0.5, -0.04, rig.P.head); tip.rotation.x = -0.18;
    const band = mesh(cyl(0.25, 0.25, 0.07, 14), std(color, { emissive: color, ei: 0.6 }), 0, 0.22, 0, rig.P.head); rig.mats.push(band.material);
    rig.P.hat = [brim, tip, band];
    rig.baseEmissive = rig.mats.map((m) => m.emissive.clone());
    return rig;
  }
  return buildHumanoid({ cloth: color, cape: color, armor: '#9aa3ad', weapon: 'sword', rarity: 0, offhand: 'shield', shieldColor: color, chestPlate: true });
}

export function buildEnemy(type) {
  switch (type) {
    case 'skeleton': return buildHumanoid({ bones: true, skin: '#d8d0bc', head: 'skull', eyes: '#5ff3ff', weapon: 'sword', rarity: 0, armor: '#6b6560' });
    case 'brute': return buildHumanoid({ scale: 1.45, bulk: 1.5, skin: '#6e7a55', cloth: '#3b2a1e', armor: '#5a5048', eyes: '#ffb020', horns: true, hornColor: '#cfc6b0', weapon: 'club', chestPlate: true, noHair: true });
    case 'cultist': return buildHumanoid({ legs: 'robe', head: 'hood', cloth: '#3b1238', eyes: '#ff4ff0', skin: '#8a7a70', weapon: 'orb', armor: '#2a2030' });
    case 'imp': return buildHumanoid({ scale: 0.62, skin: '#c2361f', cloth: '#5a1208', head: 'imp', horns: true, eyes: '#ffe84a', wings: true, tail: true, weapon: 'claws', noHair: true, armor: '#5a1208' });
    case 'wraith': return buildHumanoid({ legs: 'none', head: 'skull', skin: '#bfb6d8', cloth: '#1b1028', eyes: '#b26bff', weapon: 'claws', offhand: 'claws', armor: '#2b1a40', cape: '#120a1e' });
    case 'boss': return buildHumanoid({ scale: 2.5, bulk: 1.35, bones: true, pauldrons: true, skin: '#e3d9c0', head: 'skull', eyes: '#ff3018', crown: true, weapon: 'cleaver', armor: '#3b3233', cape: '#4a0a0a' });
    case 'goblin': {
      const rig = buildHumanoid({ scale: 0.72, skin: '#6aa83a', cloth: '#5a3a1a', head: 'imp', eyes: '#ffe84a', noHair: true, weapon: 'dagger', armor: '#5a3a1a' });
      const sackMat = std('#8a6a3a', { rough: 1 }), goldMat = std('#ffd34d', { metal: 1, rough: 0.25, emissive: '#ff9a20', ei: 0.8 });
      const sack = mesh(sphere(0.42, 12, 10), sackMat, 0, 0.55, -0.38, rig.P.spine); sack.scale.set(1, 1.15, 0.9);
      for (let i = 0; i < 5; i++) mesh(cyl(0.07, 0.07, 0.03, 10), goldMat, Math.cos(i * 1.3) * 0.15, 0.98, -0.38 + Math.sin(i * 1.3) * 0.12, rig.P.spine);
      for (const s of [-1, 1]) { const ear = mesh(cone(0.07, 0.3, 5), rig.mats[0], 0.24 * s, 0.1, 0, rig.P.head); ear.rotation.z = -1.3 * s; }
      rig.mats.push(sackMat, goldMat); rig.baseEmissive = rig.mats.map((m) => m.emissive.clone());
      return rig;
    }
    case 'ogre': return buildHumanoid({ scale: 2.3, bulk: 1.8, skin: '#7f8a62', cloth: '#3b2a1e', armor: '#4a4448', eyes: '#ff5a1a', horns: true, hornColor: '#d8cfb8', weapon: 'ram', chestPlate: true, noHair: true, pauldrons: true });
    case 'spiderling': return buildSpider({ scale: 0.55, body: '#2a1416', mark: '#ff6a1a' });
    case 'matriarch': return buildSpider({ scale: 2.2, body: '#1e1012', mark: '#ff3a10', crown: true });
    case 'shieldbearer': { const r = buildHumanoid({ bulk: 1.2, cloth: '#3a3530', armor: '#6a6560', skin: '#d8d0bc', bones: true, head: 'skull', eyes: '#ffb020', weapon: 'sword', offhand: 'towershield', chestPlate: true, pauldrons: true }); r.P.helm.visible = true; return r; }
    case 'healer': return buildHumanoid({ legs: 'robe', head: 'hood', cloth: '#1a3a2a', eyes: '#5effa0', skin: '#8a7a70', weapon: 'lifeorb', armor: '#2a4a3a' });
    case 'bomber': {
      const rig = buildHumanoid({ scale: 0.66, skin: '#8a3a1a', cloth: '#3a1a0a', head: 'imp', horns: true, eyes: '#ffe84a', tail: true, weapon: 'claws', noHair: true, armor: '#3a1a0a' });
      const bm = std('#2a1a1a', { emissive: '#ff3a10', ei: 1.5 }); rig.mats.push(bm);
      const bomb = mesh(sphere(0.38, 14, 10), bm, 0, 0.55, -0.34, rig.P.spine); rig.P.bomb = bomb;
      mesh(cyl(0.03, 0.03, 0.25, 5), std('#c8b080'), 0, 0.98, -0.34, rig.P.spine);
      rig.baseEmissive = rig.mats.map((x) => x.emissive.clone());
      return rig;
    }
    case 'burrower': return buildWorm();
    case 'drake': return buildDrake();
    case 'hollowking': return buildHumanoid({ scale: 2.3, bulk: 1.3, legs: 'none', head: 'skull', skin: '#c8bce0', cloth: '#14081e', eyes: '#c86bff', crown: true, weapon: 'claws', offhand: 'claws', armor: '#2a1440', cape: '#0a0412', pauldrons: true });
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
  if (s.block) { armLx = -1.35; armLz = 0.85; fLx = -1.2; sx = 0.18; }
  if (s.channel) { armRx = -1.55; armRz = 1.2; armLx = -1.55; armLz = -1.2; sx = 0.1; }
  if (s.emote) {
    const e = s.emote, k = s.emoteT || 0;
    if (e === 'wave') { armRx = -2.9; armRz = 0.3 + Math.sin(k * 10) * 0.45; fx = -0.4; }
    else if (e === 'cheer') { armRx = -2.9; armLx = -2.9; armRz = 0.4; armLz = -0.4; P.hips.position.y += Math.abs(Math.sin(k * 7)) * 0.25; }
    else if (e === 'dance') { P.hips.rotation.y = Math.sin(k * 6) * 0.5; sy = -Math.sin(k * 6) * 0.7; armRx = -1.5 + Math.sin(k * 12) * 1.2; armLx = -1.5 - Math.sin(k * 12) * 1.2; P.hips.position.y += Math.abs(Math.sin(k * 12)) * 0.1; }
    else if (e === 'bow') { sx = 0.95; armRx = 0.4; armLx = -0.6; armLz = 0.6; }
    else if (e === 'laugh') { sx = -0.25 + Math.sin(k * 20) * 0.08; armRx = -0.4; armLx = -0.4; armRz = 0.9; armLz = -0.9; }
    else if (e === 'point') { armRx = -1.6; fx = 0; }
    else if (e === 'taunt') { armRx = -1.2 + Math.sin(k * 8) * 0.4; armLx = -0.4; sx = -0.15; }
  }
  if (s.hurt > 0) { sx -= 0.35 * s.hurt; }
  P.armL.rotation.x = armLx; P.armL.rotation.z = armLz - (floaty ? 0.3 : 0);
  P.armR.rotation.x = armRx; P.armR.rotation.z = armRz + (floaty ? 0.3 : 0);
  P.foreR.rotation.x = fx; P.foreL.rotation.x = fLx;
  P.spine.rotation.y = sy; P.spine.rotation.x = sx;
  P.head.rotation.x = -sx * 0.5;
  if (rig.offhand?.userData.face) rig.offhand.rotation.set(Math.PI / 2 - (armLx + fLx + sx) * (s.block ? 1 : 0.4), 0, 0);
  if (P.cape) P.cape.rotation.x = 0.15 + mv * 0.55 + Math.sin(t * 3.1) * 0.06 + (s.dash ? 0.6 : 0);
  if (P.wingL) { const f = Math.sin(t * 18) * 0.6; P.wingL.rotation.y = 0.4 + f; P.wingR.rotation.y = -0.4 - f; }
  if (P.tail) P.tail.rotation.z = Math.sin(t * 4) * 0.4;
  if (P.robe && rig.opts.legs === 'robe') P.robe.rotation.x = -0.08 * mv;
  // death
  const d = s.dead || 0;
  rig.body.rotation.x = -easeOut(Math.min(1, d * 1.6)) * Math.PI * 0.48;
  rig.body.position.set(0, -Math.max(0, d - 0.6) * 0.8, 0);
  if (s.roll > 0) {
    const th = easeIO(s.roll) * Math.PI * 2, h = 0.6;
    rig.body.rotation.x = th;
    rig.body.position.set(0, h - h * Math.cos(th) - Math.sin(Math.PI * s.roll) * 0.25, -h * Math.sin(th));
    if (P.legL) { P.legL.rotation.x = P.legR.rotation.x = -1.4; P.shinL.rotation.x = P.shinR.rotation.x = 2; }
    P.armL.rotation.x = P.armR.rotation.x = -0.6;
  }
}

// ---------- SPIDERS ----------
export function buildSpider(o) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  body.scale.setScalar(o.scale || 1);
  const mats = [];
  const M = (c, opt) => { const m = std(c, opt); mats.push(m); return m; };
  const shell = M(o.body, { rough: 0.35, metal: 0.3 }), mark = M('#2a0a04', { emissive: o.mark, ei: 2.2 }), eye = M('#ff2a10', { emissive: '#ff3a10', ei: 3 });
  const torso = new THREE.Group(); torso.position.y = 0.9; body.add(torso);
  mesh(sphere(0.5, 14, 10), shell, 0, 0, 0, torso).scale.set(1, 0.7, 1.1);
  const abdomen = new THREE.Group(); abdomen.position.set(0, 0.25, -0.95); torso.add(abdomen);
  mesh(sphere(0.8, 16, 12), shell, 0, 0, 0, abdomen).scale.set(1, 0.85, 1.2);
  for (let i = 0; i < 3; i++) mesh(sphere(0.16 - i * 0.03, 8, 6), mark, 0, 0.62, 0.35 - i * 0.38, abdomen).scale.set(1.6, 0.4, 1);
  mesh(new THREE.TorusGeometry(0.45, 0.04, 6, 20, Math.PI), mark, 0, 0.45, -0.2, abdomen).rotation.y = Math.PI / 2;
  const head = new THREE.Group(); head.position.set(0, 0.05, 0.6); torso.add(head);
  mesh(sphere(0.32, 12, 10), shell, 0, 0, 0, head);
  for (let i = 0; i < 6; i++) mesh(sphere(0.045, 6, 5), eye, ((i % 3) - 1) * 0.11, 0.12 + Math.floor(i / 3) * 0.08, 0.27, head);
  for (const s of [-1, 1]) { const f = mesh(cone(0.05, 0.28, 5), M('#d8d0bc'), 0.1 * s, -0.2, 0.22, head); f.rotation.x = 2.6; }
  if (o.crown) for (let i = 0; i < 5; i++) { const sp = mesh(cone(0.06, 0.35, 5), mark, -0.3 + i * 0.15, 0.3, -0.05, head); sp.rotation.x = -0.4; }
  const legs = [];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const hip = new THREE.Group(); hip.position.set(0.3 * side, 0, 0.35 - i * 0.24); torso.add(hip);
    hip.rotation.y = side * (Math.PI / 2) + (i - 1.5) * -0.45 * side;
    const upper = new THREE.Group(); upper.rotation.z = 0.9 * side * -1; hip.add(upper);
    // segment along local +X for side=+1, -X for side=-1 handled via rotation of hip; build along +Z of hip
    const segA = mesh(cyl(0.05, 0.06, 0.95, 6), shell, 0, 0, 0.47, upper); segA.rotation.x = Math.PI / 2;
    const knee = new THREE.Group(); knee.position.z = 0.95; upper.add(knee);
    const segB = mesh(cyl(0.025, 0.05, 1.25, 6), shell, 0, 0, 0.62, knee); segB.rotation.x = Math.PI / 2;
    legs.push({ hip, upper, knee, side, i });
  }
  // orient legs: upper tilts up, knee bends down to the floor
  for (const L of legs) { L.upper.rotation.set(-0.7, 0, 0); L.knee.rotation.set(1.75, 0, 0); }
  const rig = { root, body, P: { torso, abdomen, head, legs }, mats, opts: { spider: true }, kind: 'spider', weapon: null, offhand: null };
  rig.baseEmissive = mats.map((m) => m.emissive.clone());
  return rig;
}

export function animateSpider(rig, s) {
  const P = rig.P, t = s.t, mv = Math.min(1.2, s.move || 0), d = s.dead || 0;
  for (const L of P.legs) {
    const ph = (L.i % 2 === 0) === (L.side > 0) ? 0 : Math.PI;
    const w = t * 13 + ph;
    L.hip.rotation.x = Math.sin(w) * 0.35 * mv;
    L.upper.rotation.x = -0.7 - Math.max(0, Math.cos(w)) * 0.35 * mv - d * 0.9;
    L.knee.rotation.x = 1.75 + d * 1.0;
  }
  const atk = s.atk >= 0 ? Math.sin(s.atk * Math.PI) : 0;
  for (const L of P.legs) if (L.i === 0) L.upper.rotation.x -= atk * 1.2;
  P.torso.position.y = 0.9 + Math.abs(Math.sin(t * 13)) * 0.04 * mv + atk * 0.25 - d * 0.5 + (s.air ? 0.6 : 0);
  P.torso.rotation.x = -atk * 0.35 - (s.air ? 0.3 : 0);
  P.abdomen.rotation.x = Math.sin(t * 2) * 0.05 + atk * 0.2;
  P.head.rotation.y = Math.sin(t * 1.3) * 0.15;
  rig.body.rotation.z = d > 0.3 ? Math.min(1, (d - 0.3) * 2) * Math.PI : 0;
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

// ---------- WORM (Ash Burrower) ----------
export function buildWorm() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mats = [];
  const shell = std('#5a3a2a', { rough: 0.6, flatShading: true }), glow = std('#2a1004', { emissive: '#ff6a1a', ei: 1.8 }); mats.push(shell, glow);
  const segs = [];
  for (let i = 0; i < 6; i++) { const s = mesh(new THREE.DodecahedronGeometry(0.42 - i * 0.04, 0), shell, 0, 0.45, -i * 0.5, body); segs.push(s); if (i % 2 === 0) mesh(sphere(0.12, 6, 5), glow, 0, 0.82 - i * 0.03, -i * 0.5, body); }
  const head = new THREE.Group(); head.position.set(0, 0.55, 0.45); body.add(head);
  mesh(new THREE.DodecahedronGeometry(0.45, 0), shell, 0, 0, 0, head);
  for (const s of [-1, 1]) { const m = mesh(cone(0.07, 0.5, 5), std('#e8dcc0'), 0.18 * s, -0.05, 0.4, head); m.rotation.x = Math.PI / 2; m.rotation.z = -0.4 * s; }
  for (const s of [-1, 1]) mesh(sphere(0.07, 6, 5), std('#ff3a10', { emissive: '#ff3a10', ei: 3 }), 0.2 * s, 0.18, 0.3, head);
  const rig = { root, body, P: { segs, head }, mats, opts: { worm: true }, kind: 'worm', weapon: null, offhand: null };
  rig.baseEmissive = mats.map((m) => m.emissive.clone());
  return rig;
}
export function animateWorm(rig, s) {
  const t = s.t, mv = Math.min(1, s.move || 0), d = s.dead || 0;
  rig.P.segs.forEach((g, i) => { g.position.x = Math.sin(t * 8 - i * 0.9) * 0.18 * (0.3 + mv); g.position.y = 0.45 + Math.abs(Math.sin(t * 8 - i * 0.9)) * 0.1 * mv - d * 0.4; });
  const atk = s.atk >= 0 ? Math.sin(s.atk * Math.PI) : 0;
  rig.P.head.rotation.x = -atk * 0.8; rig.P.head.position.y = 0.55 + atk * 0.6 - d * 0.4;
  rig.body.rotation.z = d * 1.4;
}

// ---------- DRAKE ----------
export function buildDrake() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(1.6);
  const mats = [];
  const M = (c, o) => { const m = std(c, o); mats.push(m); return m; };
  const hide = M('#2a4a66', { rough: 0.45, metal: 0.25, flatShading: true }), belly = M('#8aa8b8', { rough: 0.6 }), bolt = M('#0a1a2a', { emissive: '#6ad0ff', ei: 2.6 }), horn = M('#d8d8e8');
  const torso = new THREE.Group(); torso.position.y = 1.6; body.add(torso);
  mesh(sphere(0.9, 14, 10), hide, 0, 0, 0, torso).scale.set(0.9, 0.8, 1.5);
  mesh(sphere(0.7, 12, 8), belly, 0, -0.25, 0.1, torso).scale.set(0.8, 0.6, 1.3);
  for (let i = 0; i < 5; i++) mesh(cone(0.12, 0.4, 4), bolt, 0, 0.72, 0.8 - i * 0.4, torso);
  const neck = []; let parent = torso;
  for (let i = 0; i < 4; i++) { const n = new THREE.Group(); n.position.set(0, i ? 0.32 : 0.4, i ? 0.32 : 1.1); parent.add(n); mesh(sphere(0.32 - i * 0.03, 10, 8), hide, 0, 0, 0, n); neck.push(n); parent = n; }
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.35); parent.add(head);
  mesh(box(0.5, 0.36, 0.8), hide, 0, 0, 0.2, head);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.15, 0); head.add(jaw); mesh(box(0.42, 0.12, 0.7), belly, 0, -0.04, 0.25, jaw);
  for (const s of [-1, 1]) { const h = mesh(cone(0.07, 0.6, 5), horn, 0.18 * s, 0.25, -0.2, head); h.rotation.x = -1.1; mesh(sphere(0.06, 6, 5), bolt, 0.17 * s, 0.1, 0.45, head); }
  const tail = []; parent = torso;
  for (let i = 0; i < 6; i++) { const t = new THREE.Group(); t.position.set(0, 0, i ? -0.45 : -1.3); parent.add(t); mesh(sphere(0.3 - i * 0.04, 8, 6), hide, 0, 0, 0, t); tail.push(t); parent = t; }
  mesh(cone(0.2, 0.5, 4), bolt, 0, 0, -0.3, parent).rotation.x = -Math.PI / 2;
  const wingMat = M('#1a3a56', { rough: 0.7 }); wingMat.side = THREE.DoubleSide;
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(0.5 * s, 0.45, 0.2); torso.add(w);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(2.6 * s, 0.9); sh.lineTo(3.0 * s, -0.2); sh.lineTo(2.2 * s, -0.5); sh.lineTo(1.4 * s, -0.9); sh.lineTo(0.6 * s, -1.1);
    const wm = mesh(new THREE.ShapeGeometry(sh), wingMat, 0, 0, 0, w); wm.rotation.x = -Math.PI / 2;
    wings.push(w);
  }
  const legs = [];
  for (const [x, z] of [[-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6]]) { const l = new THREE.Group(); l.position.set(x, -0.4, z); torso.add(l); mesh(capsule(0.14, 0.6), hide, 0, -0.45, 0, l); legs.push(l); }
  const rig = { root, body, P: { torso, neck, head, jaw, tail, wings, legs }, mats, opts: { drake: true }, kind: 'drake', weapon: null, offhand: null };
  rig.baseEmissive = mats.map((m) => m.emissive.clone());
  return rig;
}
export function animateDrake(rig, s) {
  const P = rig.P, t = s.t, mv = Math.min(1, s.move || 0), d = s.dead || 0, air = s.air ? 1 : 0;
  const flap = Math.sin(t * (air ? 9 : 2.4)) * (air ? 0.7 : 0.15);
  P.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (air ? flap : 0.9 + flap * 0.3); });
  P.neck.forEach((n, i) => { n.rotation.x = Math.sin(t * 1.5 + i) * 0.08 - (air ? 0.15 : 0); n.rotation.y = Math.sin(t * 0.8 + i * 0.5) * 0.12; });
  P.tail.forEach((n, i) => { n.rotation.y = Math.sin(t * 2.2 - i * 0.6) * 0.18; n.rotation.x = 0.06; });
  const atk = s.atk >= 0 ? Math.sin(s.atk * Math.PI) : 0;
  P.jaw.rotation.x = atk * 0.6 + (air ? 0.4 : 0);
  P.neck[0].rotation.x -= atk * 0.4;
  P.legs.forEach((l, i) => { l.rotation.x = air ? 0.9 : Math.sin(t * 8 + i * Math.PI * 0.5) * 0.5 * mv; });
  P.torso.position.y = 1.6 + Math.sin(t * 2) * 0.05 - d * 1.0;
  rig.body.rotation.z = d > 0.3 ? Math.min(1, (d - 0.3) * 2) * 1.4 : 0;
}
