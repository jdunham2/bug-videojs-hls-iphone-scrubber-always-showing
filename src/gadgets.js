// Gadgets in play: two slots on cooldowns (keys 1 and 2, gamepad RB / LT).
//   Bear Trap    – set at your feet; snaps shut on the first enemy, holding it and biting hard.
//   Smoke Bomb   – a cloud where enemies slow to a stumble and can't attack.
//   Healing Tonic – heal over two seconds.
//   Throwing Net – thrown at the cursor; pins everything it lands on.
//   Powder Keg   – lobbed at the cursor; short fuse, big blast.
//   War Horn     – shockwave that shoves enemies back, plus a burst of speed and draw.

import * as THREE from 'three';
import { equippedGadget, itemStats, gearIcon, RARITIES } from './gear.js';
import { buffs } from './skills.js';

const rand = (a, b) => a + Math.random() * (b - a);

// --- meshes
const ironMat = new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.7, roughness: 0.4 });
const trapBaseGeo = new THREE.CylinderGeometry(0.45, 0.5, 0.06, 20);
const jawGeo = new THREE.TorusGeometry(0.42, 0.035, 6, 20, Math.PI);
const toothGeo = new THREE.ConeGeometry(0.035, 0.12, 4);

function trapMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(trapBaseGeo, ironMat));
  const jaws = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    const jaw = new THREE.Mesh(jawGeo, ironMat);
    jaw.rotation.y = side > 0 ? 0 : Math.PI;
    pivot.add(jaw);
    for (let i = 1; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      const t = new THREE.Mesh(toothGeo, ironMat);
      t.position.set(Math.cos(a) * 0.42 * (side > 0 ? 1 : -1), 0.06, Math.sin(a) * 0.42 * (side > 0 ? 1 : -1));
      pivot.add(t);
    }
    pivot.rotation.x = 0; // opened flat; snaps up to ±1.4
    pivot.userData.side = side;
    jaws.push(pivot);
    g.add(pivot);
  }
  g.position.y = 0.04;
  g.traverse((o) => (o.castShadow = true));
  return { g, jaws };
}

const netTex = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(220,200,160,0.95)';
    x.lineWidth = 3;
    for (let i = 0; i <= 128; i += 16) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, 128);
      x.moveTo(0, i);
      x.lineTo(128, i);
      x.stroke();
    }
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  };
})();
/** A soft, lumpy smoke puff. */
const puffTex = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const px = 64 + rand(-22, 22);
      const py = 64 + rand(-22, 22);
      const r = rand(26, 44);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();
const kegGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12);
const kegMat = new THREE.MeshStandardMaterial({ color: 0x6a4020, roughness: 0.8 });
const ringGeo = new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2);

export class Gadgets {
  constructor(game) {
    this.game = game;
    this.cool = [0, 0]; // seconds left per slot
    this.traps = [];
    this.smokes = [];
    this.nets = [];
    this.kegs = [];
    this.rings = [];
    this.heals = [];
  }

  /** The item in slot n (1-based) and its numbers. */
  slot(n) {
    const item = equippedGadget(n);
    return item ? { item, s: itemStats(item) } : null;
  }

  use(n, target) {
    const G = this.game;
    const sl = this.slot(n);
    if (!sl || this.cool[n - 1] > 0 || G.player.dead) {
      if (sl && this.cool[n - 1] > 0) G.sfx.sample('uiSwitch', { vol: 0.25, jitter: 0 });
      return false;
    }
    const { item, s } = sl;
    this.cool[n - 1] = s.cooldown;
    G.bounty?.('gadget');
    G.stats.gadgets = (G.stats.gadgets || 0) + 1;
    this.max = this.max || [1, 1];
    this.max[n - 1] = s.cooldown;
    const P = G.player;
    const at = target.clone().setY(0);
    // Keep thrown things inside the throw range.
    const off = at.clone().sub(P.pos);
    if (off.length() > 9) at.copy(P.pos).addScaledVector(off.normalize(), 9);
    switch (item.base) {
      case 'bearTrap':
        this.placeTrap(P.pos.clone(), s);
        break;
      case 'smokeBomb':
        this.smoke(P.pos.clone(), s);
        break;
      case 'flask':
        this.heals.push({ t: 2, rate: (G.maxHp() * 0.4 * s.potency) / 2 });
        G.sfx.sample('ding', { vol: 0.35, rate: 0.8, jitter: 0 });
        G.sfx.noise(0.4, 0.08, 'lowpass', 600, 0.1);
        G.numbers.spawn(P.pos.clone().setY(2.4), 'TONIC', 'callout');
        break;
      case 'net':
        this.throwNet(P.pos.clone(), at, s);
        break;
      case 'powderKeg':
        this.throwKeg(P.pos.clone(), at, s);
        break;
      case 'warHorn':
        this.horn(s);
        break;
    }
    G.tips?.done?.('gadget');
    return true;
  }

  placeTrap(pos, s) {
    const G = this.game;
    const { g, jaws } = trapMesh();
    g.position.x = pos.x;
    g.position.z = pos.z;
    G.scene.add(g);
    this.traps.push({ g, jaws, pos: pos.setY(0), armed: 0.4, life: 20 * s.duration, snap: 0, victim: null, hold: 3 * s.duration, dmg: 45 * s.potency });
    G.sfx.sample('clang', { vol: 0.35, rate: 1.6, jitter: 0 });
  }

  smoke(pos, s) {
    const G = this.game;
    const sm = { pos: pos.setY(0), r: 3.6, t: 6 * s.duration, puffs: [] };
    // Soft billowing puffs that burst outward, then drift and fade.
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(), color: 0xa8a29a, transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (sm.r - 0.6);
      sp.userData = { home: new THREE.Vector3(pos.x + Math.cos(a) * r, rand(0.5, 1.8), pos.z + Math.sin(a) * r), size: rand(1.8, 3.2), spin: rand(-0.4, 0.4), phase: Math.random() * 6 };
      sp.position.set(pos.x, 0.8, pos.z);
      sp.scale.setScalar(0.5);
      G.scene.add(sp);
      sm.puffs.push(sp);
    }
    sm.age = 0;
    this.smokes.push(sm);
    G.sfx.sample('whoosh', { vol: 0.7, rate: 0.5, jitter: 0 });
    G.sfx.noise(1.2, 0.12, 'lowpass', 900);
  }

  throwNet(from, to, s) {
    const G = this.game;
    const mat = new THREE.MeshBasicMaterial({ map: netTex(), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
    mesh.position.copy(from).setY(1.4);
    G.scene.add(mesh);
    this.nets.push({ mesh, from: from.clone().setY(1.4), to: to.clone(), t: 0, dur: 0.45, landed: false, life: 3 * s.duration, r: 2.6, pin: 3 * s.duration });
    G.sfx.sample('whoosh', { vol: 0.6, rate: 0.8, jitter: 0 });
  }

  throwKeg(from, to, s) {
    const G = this.game;
    const mesh = new THREE.Mesh(kegGeo, kegMat);
    mesh.castShadow = true;
    G.scene.add(mesh);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0.7, depthWrite: false }));
    ring.position.set(to.x, 0.05, to.z);
    ring.scale.setScalar(3.4);
    G.scene.add(ring);
    this.kegs.push({ mesh, ring, from: from.clone().setY(1.3), to: to.clone(), t: 0, dur: 0.6, fuse: 0.9, landed: false, dmg: 110 * s.potency });
    G.sfx.sample('whoosh', { vol: 0.5, rate: 0.7, jitter: 0 });
  }

  horn(s) {
    const G = this.game;
    const P = G.player;
    G.sfx.warHorn();
    G.shake.add(0.4);
    buffs.haste = Math.max(buffs.haste, 6 * s.duration);
    G.numbers.spawn(P.pos.clone().setY(2.5), 'RALLY!', 'callout gold');
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.set(P.pos.x, 0.08, P.pos.z);
    G.scene.add(ring);
    this.rings.push({ ring, t: 0, dur: 0.5, r: 6 });
    for (const e of G.enemies) {
      if (!e.isHittable()) continue;
      const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      if (d > 6) continue;
      const dir = new THREE.Vector3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize();
      const res = e.hit(20 * s.potency, dir, 1, false);
      e.knock?.addScaledVector(dir, e.isBoss ? 3 : 14);
      if (res === 'kill') G.onKill(e);
    }
  }

  update(dt) {
    const G = this.game;
    const P = G.player;
    this.cool[0] = Math.max(0, this.cool[0] - dt);
    this.cool[1] = Math.max(0, this.cool[1] - dt);

    // Healing over time.
    for (let i = this.heals.length - 1; i >= 0; i--) {
      const h = this.heals[i];
      const step = Math.min(dt, h.t);
      h.t -= dt;
      const heal = Math.min(h.rate * step, G.maxHp() - P.hp);
      if (heal > 0 && !P.dead) {
        P.hp += heal;
        h.shown = (h.shown || 0) + heal;
        if (h.shown >= 6) {
          G.numbers.spawn(P.pos.clone().setY(2.2), `+${Math.round(h.shown)}`, 'heal');
          h.shown = 0;
        }
      }
      if (Math.random() < dt * 25) G.particles.spawn(P.pos.clone().setY(0.4 + Math.random()), { count: 1, color: [2.4, 1.8, 0.8], speed: 0.4, up: 1.6, life: 0.6, size: 0.06, gravity: -1 });
      if (h.t <= 0) this.heals.splice(i, 1);
    }

    // Traps.
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      t.armed -= dt;
      t.life -= dt;
      if (!t.victim && t.armed <= 0) {
        const e = G.enemies.find((e) => e.isHittable() && Math.hypot(e.pos.x - t.pos.x, e.pos.z - t.pos.z) < 0.6 + e.radius * 0.6);
        if (e) {
          t.victim = e;
          t.snapT = 0;
          e.frozenT = Math.max(e.frozenT, e.isBoss ? 0.6 : t.hold);
          const res = e.hit(t.dmg, new THREE.Vector3(0, 0, 1), 0.5, false);
          G.numbers.spawn(e.pos.clone().setY(2.2), Math.round(t.dmg), 'crit');
          G.numbers.spawn(e.pos.clone().setY(2.8), 'TRAPPED', 'callout');
          G.sfx.sample('clang', { vol: 0.9, rate: 0.9, jitter: 0, pan: G.panAt(t.pos) });
          G.shake.add(0.25);
          G.particles.spawn(t.pos.clone().setY(0.3), { count: 14, color: 0x9a9a9a, speed: 3, up: 2, life: 0.4, size: 0.08, gravity: 8 });
          if (res === 'kill') G.onKill(e);
          t.life = Math.min(t.life, t.hold + 0.6);
        }
      }
      if (t.victim) {
        t.snapT += dt;
        const k = Math.min(1, t.snapT / 0.08);
        for (const j of t.jaws) j.rotation.x = j.userData.side * 1.35 * k;
        if (!t.victim.removed) t.g.position.set(t.victim.pos.x, 0.04, t.victim.pos.z);
      }
      if (t.life <= 0) {
        t.g.removeFromParent();
        this.traps.splice(i, 1);
      }
    }

    // Smoke clouds.
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i];
      sm.t -= dt;
      sm.age += dt;
      const burst = Math.min(1, sm.age / 0.35);
      const fade = Math.min(1, sm.t / 1.2);
      for (const sp of sm.puffs) {
        const u = sp.userData;
        sp.position.lerp(u.home, 1 - Math.exp(-8 * dt));
        u.home.y += dt * 0.08;
        sp.scale.setScalar(u.size * (0.4 + 0.6 * burst) * (1 + 0.06 * Math.sin(sm.age * 1.3 + u.phase)));
        sp.material.rotation += u.spin * dt;
        sp.material.opacity = 0.62 * burst * fade;
      }
      for (const e of G.enemies) {
        if (e.state === 'dying' || e.isBoss) continue;
        if (Math.hypot(e.pos.x - sm.pos.x, e.pos.z - sm.pos.z) < sm.r) {
          e.blindT = 0.3;
          e.slowT = Math.max(e.slowT, 0.3);
          e.slowAmt = Math.max(e.slowAmt || 0, 0.55);
        }
      }
      if (sm.t <= 0) {
        for (const sp of sm.puffs) {
          sp.removeFromParent();
          sp.material.dispose();
        }
        this.smokes.splice(i, 1);
      }
    }

    // Nets.
    for (let i = this.nets.length - 1; i >= 0; i--) {
      const n = this.nets[i];
      if (!n.landed) {
        n.t += dt;
        const k = Math.min(1, n.t / n.dur);
        n.mesh.position.lerpVectors(n.from, n.to, k).setY(0.1 + Math.sin(k * Math.PI) * 2.2);
        n.mesh.scale.setScalar(0.6 + k * n.r * 2);
        n.mesh.rotation.y += dt * 6;
        if (k >= 1) {
          n.landed = true;
          G.sfx.sample('thunkGround', { vol: 0.5, rate: 0.7, jitter: 0, pan: G.panAt(n.to) });
          let caught = 0;
          for (const e of G.enemies) {
            if (!e.isHittable() || Math.hypot(e.pos.x - n.to.x, e.pos.z - n.to.z) > n.r + e.radius * 0.5) continue;
            e.frozenT = Math.max(e.frozenT, e.isBoss ? 0.8 : n.pin);
            caught++;
          }
          if (caught) G.numbers.spawn(n.to.clone().setY(2.4), caught > 1 ? `NETTED ×${caught}` : 'NETTED', 'callout');
        }
      } else {
        n.life -= dt;
        n.mesh.material.opacity = Math.min(0.95, n.life);
        if (n.life <= 0) {
          n.mesh.removeFromParent();
          n.mesh.material.dispose();
          this.nets.splice(i, 1);
        }
      }
    }

    // Powder kegs.
    for (let i = this.kegs.length - 1; i >= 0; i--) {
      const k = this.kegs[i];
      if (!k.landed) {
        k.t += dt;
        const p = Math.min(1, k.t / k.dur);
        k.mesh.position.lerpVectors(k.from, k.to, p).setY(0.25 + Math.sin(p * Math.PI) * 2.6 + (1 - p) * 1.0);
        k.mesh.rotation.x += dt * 10;
        if (p >= 1) {
          k.landed = true;
          k.mesh.rotation.set(0, 0, Math.PI / 2);
          G.sfx.sample('thunkWood', { vol: 0.6, rate: 0.8, jitter: 0, pan: G.panAt(k.to) });
        }
      } else {
        k.fuse -= dt;
        k.ring.material.opacity = 0.4 + 0.4 * Math.abs(Math.sin(k.fuse * 18));
        if (Math.random() < dt * 40) G.particles.spawn(k.mesh.position.clone().setY(0.55), { count: 1, color: [3, 2, 0.6], speed: 1.5, up: 1.5, life: 0.25, size: 0.05, gravity: 4 });
        if (k.fuse <= 0) {
          k.mesh.removeFromParent();
          k.ring.removeFromParent();
          G.explosion(k.to, 3.4, k.dmg, 0);
          G.hitStop = Math.max(G.hitStop, 0.06);
          G.zoomKick = Math.min(0.12, G.zoomKick + 0.08);
          this.kegs.splice(i, 1);
        }
      }
    }

    // Horn shockwave rings.
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      r.ring.scale.setScalar(0.5 + k * r.r);
      r.ring.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        r.ring.removeFromParent();
        this.rings.splice(i, 1);
      }
    }
    this.updateHud();
  }

  /** The two gadget buttons on the HUD with a cooldown sweep. */
  updateHud() {
    for (const n of [1, 2]) {
      const el = document.getElementById(`gadget${n}`);
      if (!el) continue;
      const sl = this.slot(n);
      const key = sl ? sl.item.uid : '';
      if (el._key !== key) {
        el._key = key;
        el.style.setProperty('--rar', sl ? RARITIES[sl.item.rarity].color : '#555');
        el.querySelector('.gi').innerHTML = sl ? gearIcon(sl.item) : '';
        el.title = sl ? sl.item.name : 'Empty gadget slot';
        el.classList.toggle('empty', !sl);
      }
      const left = this.cool[n - 1];
      const frac = left > 0 ? left / ((this.max && this.max[n - 1]) || 1) : 0;
      const deg = Math.round(frac * 360);
      if (el._deg !== deg) {
        el._deg = deg;
        el.style.setProperty('--cd', `${deg}deg`);
        const ready = deg === 0;
        if (ready && el._wasCooling) {
          el.classList.remove('ready');
          void el.offsetWidth;
          el.classList.add('ready');
        }
        el._wasCooling = !ready;
        el.querySelector('.gt').textContent = left > 0 ? Math.ceil(left) : '';
      }
    }
  }

  clear() {
    for (const t of this.traps) t.g.removeFromParent();
    for (const n of this.nets) n.mesh.removeFromParent();
    for (const k of this.kegs) {
      k.mesh.removeFromParent();
      k.ring.removeFromParent();
    }
    for (const r of this.rings) r.ring.removeFromParent();
    for (const sm of this.smokes) for (const sp of sm.puffs) sp.removeFromParent();
    this.traps.length = this.smokes.length = this.nets.length = this.kegs.length = this.rings.length = this.heals.length = 0;
    this.cool = [0, 0];
  }
}
