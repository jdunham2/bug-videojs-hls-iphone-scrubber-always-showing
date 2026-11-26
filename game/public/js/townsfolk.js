// Emberhold townsfolk: villagers who follow daily schedules on the shared world clock,
// greet heroes, and hurry home when the night bell rings.
import * as THREE from 'three';
import { G, angleLerp } from './state.js';
import { buildHumanoid } from './models.js';
import { Animator } from './anim.js';
import { TOWN } from '../shared/world.js';
import { RNG } from '../shared/rng.js';
import { placeLabel } from './entities.js';

const labels = document.getElementById('labels');
// [name, outfit, schedule of [fromHour, place]]
const FOLK = [
  ['Marta the Baker', { cloth: '#c8a070', hair: '#5a3a1a' }, [[6, 'stall0'], [12, 'well'], [14, 'stall0'], [19, 'home']], ['Fresh ember-bread!', 'Mind the crumbs, hero.', 'Bake by day, bar the door by night.']],
  ['Old Tomas', { cloth: '#5a6a4a', hair: '#d8d8d8' }, [[7, 'lake'], [13, 'plaza'], [17, 'lake'], [20, 'home']], ['The perch bite best at dusk.', 'In my day the dark kept to the woods.', 'Try the lake east of the gate.']],
  ['Sister Ena', { cloth: '#e8e0d0', hair: '#2a1a10', legs: 'robe' }, [[6, 'core'], [10, 'plaza'], [15, 'core'], [21, 'home']], ['The Ember Heart still burns. So must we.', 'Light keep you.', 'Pray for the night watch.']],
  ['Bram the Carter', { cloth: '#6a4a2a', hair: '#8a5a2a' }, [[8, 'gateS'], [11, 'stall1'], [15, 'gateE'], [19, 'home']], ['Roads are getting worse every week.', 'Seen the Peaks? Snow up to your knees.', 'Need a hand? Not with that sword.']],
  ['Lysa', { cloth: '#7a3a6a', hair: '#c88a3a' }, [[9, 'stall2'], [13, 'well'], [16, 'plaza'], [20, 'home']], ['Silks from beyond the marsh!', 'Ooh, is that a legendary?', 'Careful, those boots squeak.']],
  ['Garrick', { cloth: '#3a4a6a', hair: '#1a1a1a', armor: '#8a9aa8' }, [[6, 'gateN'], [12, 'smith'], [14, 'gateW'], [22, 'gateN']], ['Walls hold. For now.', 'Ring the bell when you’re ready, hero.', 'Stay sharp out there.']],
  ['Pip', { cloth: '#a85a3a', hair: '#e8c84a', scale: 0.72 }, [[8, 'plaza'], [11, 'lake'], [14, 'well'], [18, 'home']], ['Are you a real hero?!', 'Show me your sword!', 'Mum says I’m not allowed past the gate.']],
  ['Hedda', { cloth: '#4a5a3a', hair: '#9a9a8a' }, [[7, 'stall3'], [12, 'core'], [15, 'stall3'], [19, 'home']], ['Herbs for what ails you.', 'Marsh moss works wonders on burns.', 'Don’t eat the glowing mushrooms.']],
];

export class Townsfolk {
  constructor(town) {
    this.town = town; this.list = [];
    const L = town.layout, rng = new RNG(4242);
    const homes = L.houses.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const door = (h) => { const d = Math.hypot(h.x, h.z) || 1, k = Math.max(h.w, h.d) * 0.62 + 1; return { x: h.x - (h.x / d) * k, z: h.z - (h.z / d) * k }; };
    const R = TOWN.wallR - 4, lake = TOWN.lake, ld = Math.hypot(lake.x, lake.z);
    const places = {
      plaza: () => ({ x: rng.range(-9, 9), z: rng.range(8, 13) }), core: () => { const a = rng.range(0, 6.28); return { x: Math.cos(a) * 5, z: Math.sin(a) * 5 }; },
      well: () => ({ x: -4 + rng.range(-1.5, 1.5), z: 10 + rng.range(-1, 1) }), smith: () => ({ x: TOWN.smith.x + 2, z: TOWN.smith.z + 1.5 }),
      lake: () => ({ x: lake.x - (lake.x / ld) * 12 + rng.range(-2, 2), z: lake.z - (lake.z / ld) * 12 + rng.range(-2, 2) }),
      gateN: () => ({ x: 0, z: -R }), gateS: () => ({ x: 0, z: R }), gateE: () => ({ x: R, z: 0 }), gateW: () => ({ x: -R, z: 0 }),
    };
    L.stalls.forEach((s, i) => { places['stall' + i] = () => ({ x: s.x * 0.86, z: s.z * 0.86 }); });
    FOLK.forEach(([name, o, sched, lines], i) => {
      const rig = buildHumanoid({ skin: ['#e2b48f', '#c8946a', '#8a5a3a', '#f0c8a0'][i % 4], cloth: o.cloth, hair: o.hair, armor: o.armor || '#7a6a58', legs: o.legs, scale: o.scale || 1, weapon: null });
      rig.animator = new Animator();
      const home = door(homes[(i * 3) % homes.length]);
      const tag = document.createElement('div'); tag.className = 'nametag folk'; tag.innerHTML = `<span style="color:#e8dcc0">${name}</span>`; labels.appendChild(tag);
      const bub = document.createElement('div'); bub.className = 'emotebubble folkbubble'; bub.style.display = 'none'; labels.appendChild(bub);
      town.scene.add(rig.root);
      this.list.push({ name, rig, sched, lines, home, places, x: home.x, z: home.z, tx: home.x, tz: home.z, ry: 0, move: 0, t: rng.range(0, 10), tag, bub, bubT: 0, talkCd: 0, slot: null, inside: true });
    });
  }
  placeFor(f, hour) {
    if (G.defense.phase !== 'day') return 'home';
    let cur = f.sched[f.sched.length - 1][1];
    for (const [h, p] of f.sched) if (hour >= h) cur = p;
    if (hour < f.sched[0][0]) cur = 'home';
    return cur;
  }
  update(dt, playerPos, camera) {
    const hour = G.hour ?? 12;
    for (const f of this.list) {
      f.t += dt;
      const place = this.placeFor(f, hour);
      if (place !== f.slot) { f.slot = place; const p = place === 'home' ? f.home : f.places[place](); f.tx = p.x; f.tz = p.z; if (place !== 'home') f.inside = false; }
      const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
      const hurry = G.defense.phase !== 'day' ? 2.2 : 1;
      let mv = 0;
      if (d > 0.6) { const sp = Math.min(d, 2.1 * hurry * dt); f.x += (dx / d) * sp; f.z += (dz / d) * sp; f.ry = Math.atan2(dx, dz); mv = 0.45 * hurry; const p = { x: f.x, z: f.z }; this.town.collide(p, 0.35); f.x = p.x; f.z = p.z; }
      else if (f.slot === 'home') f.inside = true;
      else if (Math.random() < dt * 0.15) { const p = f.places[f.slot](); f.tx = p.x; f.tz = p.z; } // mill about
      f.move += (mv - f.move) * Math.min(1, dt * 6);
      const pd = Math.hypot(playerPos.x - f.x, playerPos.z - f.z);
      if (pd < 4 && mv === 0) f.ry = angleLerp(f.ry, Math.atan2(playerPos.x - f.x, playerPos.z - f.z), Math.min(1, dt * 4));
      f.rig.root.visible = !f.inside;
      f.rig.root.position.set(f.x, this.town.groundHeight(f.x, f.z), f.z);
      f.rig.root.rotation.y = angleLerp(f.rig.root.rotation.y, f.ry, Math.min(1, dt * 8));
      if (!f.inside) f.rig.animator.update(f.rig, { t: f.t, move: f.move, sprint: hurry > 1 && mv > 0, emote: pd < 4 && f.bubT > 0 ? 'wave' : null });
      // greetings
      f.talkCd -= dt; f.bubT -= dt;
      if (!f.inside && pd < 4.5 && f.talkCd <= 0) { f.talkCd = 25; f.bubT = 3.5; f.bub.textContent = f.lines[Math.floor(Math.random() * f.lines.length)]; }
      const show = !f.inside && pd < 14;
      if (show) placeLabelSimple(f.tag, f.rig.root.position, 2.3 * (f.rig.body.scale.y || 1), camera); else f.tag.style.display = 'none';
      if (show && f.bubT > 0) placeLabelSimple(f.bub, f.rig.root.position, 2.9 * (f.rig.body.scale.y || 1), camera); else f.bub.style.display = 'none';
    }
  }
  setVisible(v) { for (const f of this.list) { if (!v) { f.tag.style.display = 'none'; f.bub.style.display = 'none'; } } }
}
const _v = new THREE.Vector3();
function placeLabelSimple(el, pos, h, camera) { placeLabel(el, _v.set(pos.x, pos.y + h, pos.z), camera, 30); }
