// In-engine dialogue scenes: letterboxed close-ups that cut between speakers, typed subtitles, and lip-flap
// driven by the text being spoken (open on vowels, closed on spaces and punctuation).
import * as THREE from 'three';
import { G } from './state.js';

const $ = (id) => document.getElementById(id);
const V = new THREE.Vector3(), W = new THREE.Vector3();
let box = null;
function ensureBox() {
  if (box) return box;
  box = document.createElement('div'); box.id = 'dlgBox'; box.className = 'dlg hidden';
  box.innerHTML = '<div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-hint">Click / Space to continue · Esc to skip</div>';
  document.body.appendChild(box);
  return box;
}

export class DialogueScene {
  constructor(camera) { this.camera = camera; this.lines = null; }
  get active() { return !!this.lines; }
  /** lines: [{ rig, name, text, color, side }] — rig is any humanoid rig with P.head (and P.mouth or P.jawBone) */
  play(lines, onEnd) {
    this.lines = lines; this.i = -1; this.onEnd = onEnd; this.t = 0; G.dlgRigs = new Set(lines.map((l) => l.rig));
    G.cinematic = true; document.body.classList.add('cine'); $('letterbox').classList.add('on'); $('skipHint').style.display = 'none';
    ensureBox().classList.remove('hidden');
    this.key = (e) => { if (!this.lines) return; if (e.code === 'Escape') this.stop(); else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') this.next(); };
    this.click = () => this.lines && this.next();
    addEventListener('keydown', this.key); box.addEventListener('click', this.click); $('letterbox').addEventListener('click', this.click);
    this.next();
  }
  next() {
    const L = this.lines[this.i];
    if (L && this.chars < L.text.length) { this.chars = L.text.length; return; } // finish typing first
    this.i++;
    if (this.i >= this.lines.length) return this.stop();
    const N = this.lines[this.i];
    this.chars = 0; this.lt = 0; this.t = 0;
    box.querySelector('.dlg-name').textContent = N.name; box.querySelector('.dlg-name').style.color = N.color || '#ffd98a';
    box.querySelector('.dlg-text').textContent = '';
    this.side = N.side ?? (this.i % 2 ? -1 : 1);
  }
  stop() {
    if (!this.lines) return;
    for (const L of this.lines) this.mouth(L.rig, 0);
    this.lines = null; G.cinematic = false; G.dlgRigs = null;
    document.body.classList.remove('cine'); $('letterbox').classList.remove('on'); box.classList.add('hidden');
    removeEventListener('keydown', this.key); box.removeEventListener('click', this.click); $('letterbox').removeEventListener('click', this.click);
    const cb = this.onEnd; this.onEnd = null; cb?.();
  }
  mouth(rig, open) {
    const P = rig?.P; if (!P) return;
    if (P.mouth) { P.mouth.scale.y = 1 + open * 3.2; P.mouth.position.y = -0.075 - open * 0.012; }
    if (P.jawBone) P.jawBone.rotation.x = 0.15 + open * 0.45;
  }
  update(dt) {
    if (!this.lines) return false;
    const L = this.lines[this.i]; this.t += dt;
    // type the line; the mouth opens on letters (wider on vowels) and closes between words
    if (this.chars < L.text.length) {
      this.lt += dt * 38; const n = Math.min(L.text.length, Math.floor(this.lt));
      if (n !== this.chars) { this.chars = n; box.querySelector('.dlg-text').textContent = L.text.slice(0, n); if (n % 4 === 0) G.audio.click(); }
      const ch = L.text[this.chars - 1] || ' ';
      const open = /[aeiouAEIOU]/.test(ch) ? 0.9 : /[a-zA-Z]/.test(ch) ? 0.45 : 0;
      this.mouth(L.rig, open * (0.7 + 0.3 * Math.abs(Math.sin(this.t * 22))));
    } else this.mouth(L.rig, 0);
    for (const o of this.lines) if (o.rig !== L.rig) this.mouth(o.rig, 0);
    // close-up: just off the speaker's shoulder line, looking at their face, with a slow push-in
    const head = L.rig.P.head; head.getWorldPosition(V);
    const root = L.rig.root, fwd = W.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    const scale = L.rig.body?.scale.y || 1, dist = (1.55 - Math.min(0.25, this.t * 0.04)) * scale;
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(0.55 * scale * this.side);
    this.camera.position.copy(V).addScaledVector(fwd, dist).add(right).add(new THREE.Vector3(0, 0.05 * scale, 0));
    this.camera.lookAt(V.x, V.y - 0.05 * scale, V.z);
    return true;
  }
}
