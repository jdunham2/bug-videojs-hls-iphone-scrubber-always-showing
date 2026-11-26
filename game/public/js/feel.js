// Game feel: per-surface footsteps, ground decals (scorch marks, ash and ichor splats, cracks),
// camera recoil and controller rumble.
import * as THREE from 'three';
import { G } from './state.js';
import { tileAt } from '../shared/dungeon.js';

// ---- surfaces ----
export function surfaceAt(zone, x, z) {
  if (!zone) return 'stone';
  if (zone.type === 'town') return Math.hypot(x, z) < 16.5 ? 'stone' : 'grass';
  if (zone.type === 'dark') return 'ash';
  if (zone.d) { const t = tileAt(zone.d, x, z); return t === 4 ? 'ice' : 'stone'; }
  if (zone.type === 'region') {
    const y = zone.R.height(x, z);
    if (zone.key === 'marsh') return y < zone.R.water + 0.25 ? 'water' : 'mud';
    return y > 13 ? 'snow' : 'grass';
  }
  return 'stone';
}
const PUFF = { snow: ['#ffffff', '#cfe0f0'], ash: ['#8a8080', '#3a3030'], water: ['#bcd8c0', '#4a6a50'], mud: ['#6a5a3a', '#3a2e1e'], grass: null, stone: null, ice: ['#e8f6ff', '#9ac8e8'] };

/** footstep driver: fires on each foot plant of the keyframed run cycle */
export class Footsteps {
  constructor() { this.last = 0; }
  update(player, zone) {
    const A = player.rig.animator;
    if (!A || !player.onGround || player.mounted || player.roll || player.move < 0.2) { this.last = A ? A.phase : 0; return; }
    const ph = A.phase * 2, prev = this.last * 2;
    if (Math.floor(ph) !== Math.floor(prev)) {
      const s = surfaceAt(zone, player.pos.x, player.pos.z);
      G.audio.step(s, (player.sprinting ? 1.3 : 0.9) * Math.min(1, player.move));
      const c = PUFF[s];
      if (c) G.fx.emit({ pos: player.pos.clone().setY(player.pos.y + 0.05), count: s === 'water' ? 6 : 3, speed: s === 'water' ? 2.2 : 1.2, color: c[0], color2: c[1], size: 0.18, life: 0.45, up: s === 'water' ? 2 : 0.6, radius: 0.15, gravity: 6 });
    }
    this.last = A.phase;
  }
}

// ---- decals ----
function decalTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const rnd = (() => { let s = kind.length * 977; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  if (kind === 'scorch') {
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(10,6,4,0.95)'); g.addColorStop(0.55, 'rgba(25,14,8,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,${80 + rnd() * 80 | 0},20,${rnd() * 0.5})`; const a = rnd() * 6.28, r = rnd() * 30; x.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2, 2); }
  } else if (kind === 'crack') {
    x.strokeStyle = 'rgba(8,6,4,0.9)'; x.lineCap = 'round';
    for (let i = 0; i < 9; i++) { let px = 64, py = 64, a = (i / 9) * 6.28 + rnd() * 0.4; x.lineWidth = 4; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { a += (rnd() - 0.5) * 0.8; px += Math.cos(a) * 9; py += Math.sin(a) * 9; x.lineTo(px, py); x.lineWidth = Math.max(1, 4 - k * 0.6); } x.stroke(); }
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 30); g.addColorStop(0, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  } else { // splat (tinted per material)
    x.fillStyle = '#fff';
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, r = rnd() * (i < 4 ? 8 : 40), s = (i < 4 ? 26 : 5 + rnd() * 10); x.globalAlpha = 0.85; x.beginPath(); x.ellipse(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s, s * (0.6 + rnd() * 0.4), a, 0, 6.28); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const TEX = {};
const tex = (k) => (TEX[k] ||= decalTex(k));

export class Decals {
  constructor(max = 56) {
    this.max = max; this.list = []; this.root = new THREE.Group(); this.geo = new THREE.PlaneGeometry(1, 1); this.geo.rotateX(-Math.PI / 2);
  }
  /** kind: scorch | crack | splat; color tints splats (ash grey, ichor green, bone dust…) */
  add(kind, x, z, size = 2, color = '#ffffff', life = 24) {
    if (!G.zone) return;
    const mat = new THREE.MeshBasicMaterial({ map: tex(kind === 'scorch' || kind === 'crack' ? kind : 'splat'), color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity: kind === 'splat' ? 0.75 : 1 });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.set(x, G.zone.groundHeight(x, z) + 0.04 + this.list.length * 0.0004, z);
    m.rotation.y = Math.random() * Math.PI * 2; m.scale.setScalar(size); m.renderOrder = 1;
    this.root.add(m);
    this.list.push({ m, life, max: life, op: mat.opacity });
    if (this.list.length > this.max) this.drop(this.list.shift());
  }
  drop(d) { this.root.remove(d.m); d.m.material.dispose(); }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i]; d.life -= dt;
      if (d.life <= 0) { this.drop(d); this.list.splice(i, 1); continue; }
      if (d.life < 4) d.m.material.opacity = d.op * (d.life / 4);
    }
  }
  clear() { for (const d of this.list) this.drop(d); this.list = []; }
}
export const decals = new Decals();
export const SPLAT = { wraith: '#5a3a7a', imp: '#3a1a10', brute: '#3a4a2a', spider: '#2a3a10', spiderling: '#2a3a10', matriarch: '#2a3a10', goblin: '#c8a040', healer: '#2a6a3a', drake: '#2a4a7a', herald: '#4a8ac8', colossus: '#3a4a20', bomber: '#2a1a10' };

// ---- camera recoil ----
export const recoil = { pitch: 0, yaw: 0, vp: 0, vy: 0, kick(p, y = (Math.random() - 0.5) * p) { this.vp += p * 9; this.vy += y * 9; }, update(dt) {
  // critically damped spring back to rest
  this.vp += (-this.pitch * 160 - this.vp * 22) * dt; this.vy += (-this.yaw * 160 - this.vy * 22) * dt;
  this.pitch += this.vp * dt; this.yaw += this.vy * dt;
} };

// ---- controller rumble ----
export function rumble(strong, weak = strong, ms = 120) {
  if (G.settings && G.settings.rumble === false) return;
  try {
    const gp = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected);
    gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) });
  } catch (e) { /* unsupported */ }
}
