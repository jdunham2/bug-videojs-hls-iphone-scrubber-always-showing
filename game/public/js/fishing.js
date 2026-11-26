// Fishing mini-game at the Emberhold lake: cast, wait for the bite, strike in time, then keep the fish
// inside the catch bar until the reel fills. The server rolls the fish and validates the timing.
import * as THREE from 'three';
import { G } from './state.js';
import { FISH } from '../shared/life.js';
import { TOWN } from '../shared/world.js';

const $ = (id) => document.getElementById(id);
const WATER_Y = -1.7;

export class Fishing {
  constructor() {
    this.state = 'idle';
    this.el = document.createElement('div'); this.el.id = 'fishing'; this.el.style.display = 'none';
    this.el.innerHTML = '<div class="fbox"><div class="fzone"></div><div class="ffish">🐟</div><div class="fprog"><i></i></div></div><div class="fhint"></div>';
    document.body.appendChild(this.el);
    this.box = this.el.querySelector('.fbox'); this.zone = this.el.querySelector('.fzone'); this.fishEl = this.el.querySelector('.ffish'); this.prog = this.el.querySelector('.fprog i'); this.hint = this.el.querySelector('.fhint');
    this.bobber = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: '#ff3a2a', roughness: 0.5 })); this.bobber.add(b);
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f2f2f2' })); this.bobber.add(w);
    this.lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 12), 3));
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.7 }));
    this.line.frustumCulled = false;
  }
  get active() { return this.state !== 'idle'; }
  start(player) {
    if (this.active) return;
    const L = TOWN.lake, dx = L.x - player.pos.x, dz = L.z - player.pos.z, d = Math.hypot(dx, dz);
    this.player = player; player.ry = Math.atan2(dx, dz);
    const k = Math.max(0, d - 5); // land the bobber ~5 m inside the waterline
    this.spot = new THREE.Vector3(player.pos.x + (dx / d) * k, WATER_Y, player.pos.z + (dz / d) * k);
    G.zone.scene.add(this.bobber, this.line);
    this.state = 'cast'; this.t = 0; G.fishing = true;
    player.castT = 0.4; G.audio.dash();
    this.show('Casting…');
    G.net.send({ t: 'fishStart' });
  }
  onBite(m) { if (this.state !== 'cast' && this.state !== 'wait') return; this.state = 'wait'; this.biteIn = m.delay; this.diff = m.diff; this.show('Wait for the bite… (move to cancel)'); }
  show(text) { this.el.style.display = ''; this.box.style.display = this.state === 'reel' ? '' : 'none'; this.hint.textContent = text; }
  stop(ok, silent) {
    if (this.state === 'idle') return;
    if (!silent) G.net.send({ t: 'fishEnd', ok: !!ok });
    this.state = 'idle'; G.fishing = false; this.el.style.display = 'none';
    this.bobber.parent?.remove(this.bobber); this.line.parent?.remove(this.line);
    this.el.querySelector('.fbang')?.remove();
  }
  caught(m) {
    const F = FISH[m.k];
    G.ui.toast(`Caught: ${F.name}!`, F.color, `${m.n} in your journal · sold for ${F.gold}g${m.gem ? ' · a gem was inside!' : ''}`);
    G.audio.loot(m.k === 'koi' ? 4 : m.k === 'eel' ? 3 : 1);
    G.fx.emit({ pos: this.spot.clone().setY(0.2), count: 40, speed: 4, color: '#c8f0ff', color2: '#2a7aa8', size: 0.3, life: 0.8, up: 2 });
  }
  /** returns true while fishing owns the input */
  update(dt, input) {
    if (this.state === 'idle') return false;
    const p = this.player, P = p.pos;
    if (G.zone?.type !== 'town' || p.dead) { this.stop(false); return false; }
    this.t += dt;
    // fishing line from the hand to the bobber with a little sag
    const hand = new THREE.Vector3(P.x + Math.sin(p.ry) * 0.5, P.y + 1.6, P.z + Math.cos(p.ry) * 0.5);
    const fly = this.state === 'cast' ? Math.min(1, this.t / 0.6) : 1;
    const bob = this.spot.clone(); bob.y = WATER_Y + 0.05 + Math.sin(this.t * 3) * 0.03;
    if (this.state === 'bite') bob.y -= 0.18 + Math.sin(this.t * 30) * 0.05;
    if (this.state === 'reel') { bob.x += Math.sin(this.t * 7) * 0.3; bob.z += Math.cos(this.t * 5) * 0.3; bob.y -= 0.12; }
    const cur = hand.clone().lerp(bob, fly); cur.y += Math.sin(fly * Math.PI) * 3;
    this.bobber.position.copy(cur);
    const a = this.lineGeo.attributes.position.array;
    for (let i = 0; i < 12; i++) { const k = i / 11, q = hand.clone().lerp(cur, k); q.y -= Math.sin(k * Math.PI) * (this.state === 'reel' ? 0.1 : 0.6); a.set([q.x, q.y, q.z], i * 3); }
    this.lineGeo.attributes.position.needsUpdate = true;
    const mv = input.moveAxes();
    const strike = input.actHit('interact') || input.click(0) || input.hit('Space') || input.pad.pressed.has('attack');
    if (this.state !== 'reel' && Math.hypot(mv.x, mv.y) > 0.3) { this.stop(false); G.ui.toast('You reel in your line.', '#c8d8e8'); return false; }
    if (this.state === 'wait') {
      this.biteIn -= dt;
      if (this.biteIn <= 0) { this.state = 'bite'; this.biteT = 1.0; this.show('Strike now! (E / click)'); const bang = document.createElement('div'); bang.className = 'fbang'; bang.textContent = '!'; this.el.appendChild(bang); G.audio.pop(); G.audio.lever(true); G.fx.emit({ pos: this.spot.clone().setY(0), count: 20, speed: 3, color: '#ffffff', color2: '#5ab0ff', size: 0.25, life: 0.6, up: 2 }); }
    } else if (this.state === 'bite') {
      this.biteT -= dt;
      if (strike) { this.el.querySelector('.fbang')?.remove(); this.state = 'reel'; this.progress = 0.3; this.zoneY = 0.3; this.zoneV = 0; this.fishY = 0.5; this.fishT = 0.5; this.fishV = 0; this.show('Hold E / click / Space to raise the bar — keep the fish inside!'); }
      else if (this.biteT <= 0) { this.stop(false); G.ui.toast('It got away…', '#ff9a7a'); }
    } else if (this.state === 'reel') {
      const hold = input.act('interact') || input.mouse(0) || input.down('Space') || input.pad.down.has('attack');
      const D = this.diff || 1;
      this.zoneV += (hold ? 2.6 : -2.2) * dt; this.zoneV *= 0.96; this.zoneY += this.zoneV * dt;
      if (this.zoneY < 0) { this.zoneY = 0; this.zoneV *= -0.3; } if (this.zoneY > 0.77) { this.zoneY = 0.77; this.zoneV = 0; }
      if (Math.random() < dt * (0.6 + D * 0.7)) this.fishT = Math.random() * 0.94;
      this.fishV += (this.fishT - this.fishY) * 6 * D * dt; this.fishV *= 0.9; this.fishY = Math.max(0, Math.min(0.94, this.fishY + this.fishV * dt * 3));
      const inside = this.fishY + 0.03 > this.zoneY - 0.01 && this.fishY + 0.03 < this.zoneY + 0.25;
      this.progress += (inside ? 0.32 : -0.15 - D * 0.03) * dt;
      this.zone.style.bottom = (this.zoneY * 100) + '%'; this.fishEl.style.bottom = (this.fishY * 100) + '%';
      this.zone.style.background = inside ? 'rgba(94,234,138,.6)' : 'rgba(94,234,138,.3)';
      this.prog.style.height = Math.max(0, Math.min(1, this.progress)) * 100 + '%';
      if (inside && Math.random() < dt * 8) G.audio.click();
      if (this.progress >= 1) this.stop(true);
      else if (this.progress <= 0) { this.stop(false); G.ui.toast('The line went slack… it escaped.', '#ff9a7a'); }
    }
    return true;
  }
}
