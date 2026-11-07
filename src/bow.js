// The recurve bow, built from curves so it reads cleanly from every angle.
// Local frame: +Y along the limbs, +Z toward the target, limbs curving back
// toward the archer, grip at the origin.

import * as THREE from 'three';

// One limb from the grip to the tip (z back, y up); the lower limb mirrors it.
const LIMB = [
  [0, 0.06],
  [-0.03, 0.18],
  [-0.1, 0.34],
  [-0.15, 0.46],
  [-0.13, 0.53],
  [-0.09, 0.56],
].map(([z, y]) => new THREE.Vector3(0, y, z));
const TIP = LIMB[LIMB.length - 1];
const SEGMENTS = 24;
const RADIAL = 6;

const limbGeo = (() => {
  const curve = new THREE.CatmullRomCurve3(LIMB);
  const geo = new THREE.TubeGeometry(curve, SEGMENTS, 0.022, RADIAL);
  // Taper toward the tip.
  const pos = geo.attributes.position;
  const centers = curve.getSpacedPoints(SEGMENTS);
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.min(Math.floor(i / (RADIAL + 1)), SEGMENTS);
    const c = centers[ring];
    const k = 1 - 0.55 * (ring / SEGMENTS);
    pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
  }
  geo.computeVertexNormals();
  return geo;
})();
const gripGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8);
const gripMat = new THREE.MeshStandardMaterial({ color: 0x2e1f14, roughness: 0.9 });
const tipGeo = new THREE.SphereGeometry(0.018, 6, 4);
const tipMat = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.4, metalness: 0.4 });

/** Limbs (flexible group), grip and the tip position. `color` tints the wood. */
export function makeBowParts(color = 0x6b3f1d) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, emissive: 0x000000 });
  const upper = new THREE.Mesh(limbGeo, mat);
  const lower = new THREE.Mesh(limbGeo, mat);
  lower.scale.y = -1;
  const tipTop = new THREE.Mesh(tipGeo, tipMat);
  tipTop.position.copy(TIP);
  const tipBottom = tipTop.clone();
  tipBottom.position.y = -TIP.y;
  const limbs = new THREE.Group();
  limbs.add(upper, lower, tipTop, tipBottom);
  const grip = new THREE.Mesh(gripGeo, gripMat);
  for (const m of [upper, lower, grip]) m.castShadow = true;
  return { limbs, grip, mat, tip: TIP };
}

/** A complete strung bow that doesn't animate (for enemy archers). */
export function makeSimpleBow(color) {
  const { limbs, grip } = makeBowParts(color);
  const g = new THREE.Group();
  const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, TIP.y, TIP.z), new THREE.Vector3(0, -TIP.y, TIP.z)]);
  g.add(limbs, grip, new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xd8d0b8 })));
  return g;
}

/** Put a bow in a hand bone at world size (bones carry the character's scale). */
export function holdInHand(bow, hand, size = 1) {
  const ws = new THREE.Vector3();
  hand.getWorldScale(ws);
  bow.removeFromParent();
  bow.position.set(0, 0, 0);
  bow.rotation.set(0, 0, 0);
  bow.scale.setScalar(size / (ws.x || 1));
  hand.add(bow);
}

const UP = new THREE.Vector3(0, 1, 0);
const side = new THREE.Vector3();
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const pq = new THREE.Quaternion();

/**
 * Turn a held bow upright with its front toward `forward` (world), whatever the
 * hand's own rotation is. Call after the parent's world matrix is current.
 */
export function orientUpright(bow, forward) {
  side.crossVectors(UP, forward).normalize();
  m.makeBasis(side, UP, forward);
  q.setFromRotationMatrix(m);
  bow.parent.getWorldQuaternion(pq);
  bow.quaternion.copy(pq.invert().multiply(q));
}
