// Online co-op. Friends who have the game open show up in your camp, and anyone
// can join a friend's dungeon from the Online panel (up to four of you).
//
// The player who starts the dungeon is the host: their game runs the waves and
// the enemies, and enemies go after whichever player is closest. Everyone else
// sees the host's enemies mirrored on their own screen; their arrows, gadgets and
// skills hit those copies and the hits are sent to the host. Each player keeps
// their own hero, gear and skill picks, and their own health. Fall in a fight
// and a friend can get you back up by standing next to you (or you're back at
// the start of the next wave); the run ends only when everyone is down.
//
// Everything travels in each player's shared state (see net.js): their position,
// a short list of recent events (shots, hits, damage, kills) and, for a host,
// the enemies.

import * as THREE from 'three';
import { connectNet } from './net.js';
import { Player, ARROW_HEIGHT } from './player.js';
import { profile, cloudCtx, CHARACTERS } from './profile.js';
import { missionById } from './missions.js';
import { difficultyById } from './difficulty.js';
import { config } from './config.js';
import { stat } from './skills.js';
import { disposeInstance } from './models.js';
import { Grunt } from './enemy.js';
import { Archer } from './archer.js';
import { Boss, Shockwave, Barrage } from './boss.js';
import { Raider, Bomber, Thief } from './variants.js';
import { Stalker, Shieldbearer, Deckhand, Automaton, Lancer } from './reaches.js';
import { Sapper, Lurker, Netcaster, Berserker } from './warbands.js';
import { makeElite } from './elites.js';

const KINDS = { grunt: Grunt, archer: Archer, boss: Boss, raider: Raider, bomber: Bomber, thief: Thief, stalker: Stalker, shield: Shieldbearer, deckhand: Deckhand, automaton: Automaton, lancer: Lancer, sapper: Sapper, lurker: Lurker, netcaster: Netcaster, berserker: Berserker };
const kindOf = (e) => Object.keys(KINDS).find((k) => e.constructor === KINDS[k]) || 'grunt';

export const MAX_PARTY = 4;
const IN_RUN = new Set(['playing', 'choosing', 'paused', 'victory', 'gameover']);
const r2 = (v) => Math.round((v || 0) * 100) / 100;
const r1 = (v) => Math.round((v || 0) * 10) / 10;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const charName = (id) => CHARACTERS.find((c) => c.id === id)?.name || 'An archer';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function makeTag() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 72;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.8, 0.79, 1);
  s.renderOrder = 20;
  return s;
}

function drawTag(tag, name, hp, maxHp, showHp, down) {
  const c = tag.material.map.image;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.fillStyle = down ? '#ff9a8a' : '#bfe3ff';
  const text = down ? `${name} (down)` : name;
  g.strokeText(text, 128, 30);
  g.fillText(text, 128, 30);
  if (showHp) {
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(48, 42, 160, 14);
    g.fillStyle = down ? '#7a3a30' : '#5fd068';
    g.fillRect(50, 44, 156 * Math.max(0, Math.min(1, hp / (maxHp || 100))), 10);
  }
  tag.material.map.needsUpdate = true;
}

/** Another player: their latest shared state, their hero on screen, and a stand-in enemies can attack. */
class Remote {
  constructor(coop, peer, by) {
    this.coop = coop;
    this.peer = peer;
    this.by = by;
    this.g = null;
    this.name = '';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.lastSeq = null;
    // What the host's enemies see: hits on it are sent to that player, whose own
    // game applies them (so their roll still dodges, and their armor counts).
    this.proxy = {
      peer,
      pos: this.pos,
      vel: this.vel,
      dead: false,
      rollInvuln: false,
      takeDamage: (dmg, dir) => {
        coop.ev('d', [peer, Math.round(dmg), r2(dir.x), r2(dir.z)]);
        return 'remote';
      },
    };
  }

  get flags() {
    return this.g?.p?.[5] || 0;
  }
  get dead() {
    return !!(this.flags & 4);
  }
  get away() {
    return !!(this.flags & 8);
  }

  dispose() {
    if (!this.avatar) return;
    this.avatar.group.removeFromParent();
    this.tag.removeFromParent();
    for (const o of this.avatar.indicators || []) o.removeFromParent();
    disposeInstance(this.avatar.model);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    this.avatar = null;
  }
}

export class Coop {
  constructor(game) {
    this.game = game;
    this.net = null;
    this.status = 'connecting';
    this.remotes = new Map();
    this.events = [];
    this.seq = 0;
    this.runId = null;
    this.guest = null; // { peer, runId } while in a friend's dungeon
    this.puppets = new Map(); // host enemy id -> mirrored enemy (guests)
    this.nextId = 0;
    this.sendT = 0;
    this.myPeer = 'me';
    this.buildUi();
    this.hookSpawns();
    window.__coop = this;
    connectNet().then((net) => {
      this.net = net;
      this.status = net ? 'on' : 'off';
      net?.onChange(() => (this.dirty = true));
      this.renderUi();
    });
  }

  // ---------------------------------------------------------------- who's where

  /** Where I am, in the words other players compare against. */
  where() {
    const G = this.game;
    if (G.state === 'title') return 'menu';
    if (G.state === 'camp') return G.camp.room ? `room:${G.camp.room.kind}` : 'camp';
    return this.runId ? 'run' : 'solo';
  }

  get hosting() {
    return !!this.runId && !this.guest && IN_RUN.has(this.game.state);
  }

  /** Players in my dungeon (for a guest, the host too). */
  partyRemotes() {
    if (!this.runId) return [];
    return [...this.remotes.values()].filter((r) => r.g?.w === 'run' && r.g.run === this.runId);
  }

  inParty() {
    return !!this.guest || (this.hosting && this.partyRemotes().length > 0);
  }

  nameOf(r) {
    return r.name || charName(r.g?.ch);
  }

  resolveName(r) {
    const U = cloudCtx.user;
    if (!r.by || !U?.profiles) return;
    U.profiles([r.by])
      .then((ps) => {
        r.name = ps?.[r.by]?.name || '';
        r.tagKey = null;
        this.dirty = true;
      })
      .catch(() => {});
  }

  /** Queue an event into my shared state (others act on ones they haven't seen). */
  ev(type, data) {
    this.events.push([++this.seq, type, ...data]);
    if (this.events.length > 24) this.events.splice(0, this.events.length - 24);
  }

  // ---------------------------------------------------------------- per frame

  update(dt) {
    if (!this.net) return;
    const G = this.game;
    this.myPeer = this.net.myPeer();
    const seen = new Set();
    for (const p of this.net.peers()) {
      if (p.g?.v !== 1) continue;
      seen.add(p.peer);
      let r = this.remotes.get(p.peer);
      if (!r) {
        r = new Remote(this, p.peer, p.by);
        this.remotes.set(p.peer, r);
        this.resolveName(r);
        this.dirty = true;
      }
      if (r.g !== p.g) this.receive(r, p.g);
    }
    for (const [k, r] of this.remotes) {
      if (seen.has(k)) continue;
      r.dispose();
      this.remotes.delete(k);
      this.dirty = true;
    }
    for (const r of this.remotes.values()) this.updateAvatar(r, dt);
    // Host, down: back up when the next wave starts.
    if (this.hosting && G.player.dead && this.deadWave != null && G.wave > this.deadWave) this.revive();
    this.updatePartyHud();
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = G.state === 'playing' ? 0.066 : 0.12;
      this.publish();
    }
    if (this.dirty) {
      this.dirty = false;
      this.renderUi();
    }
  }

  publish() {
    const G = this.game;
    const P = G.player;
    const st = G.state;
    const away = st === 'choosing' || st === 'victory' || st === 'gameover' ? 8 : 0; // picking a skill or done: enemies leave you be
    const flags = (P.drawing ? 1 : 0) | (P.rolling ? 2 : 0) | (P.dead ? 4 : 0) | away;
    const g = {
      v: 1,
      ch: P.characterId || profile.character || 'hero',
      of: profile.outfit?.[P.characterId || profile.character] || 'default',
      w: this.where(),
      run: this.runId,
      p: [r2(P.pos.x), r2(P.pos.z), r2(Math.atan2(P.aimDir.x, P.aimDir.z)), r1(P.vel.x), r1(P.vel.z), flags, Math.round(P.hp), Math.round(G.maxHp?.() || 100), r2(P.charge)],
      ev: this.events.slice(-16),
    };
    if (this.hosting) {
      g.h = { m: G.mission?.id, d: G.difficulty?.id, wv: G.wave, ws: G.waveState, ts: G.toSpawn || 0, st };
      g.en = this.snapshotEnemies();
    }
    // Stay inside the 4 KB limit: drop the furthest-down enemies first.
    while (g.en?.length && JSON.stringify(g).length > 3800) g.en.length = Math.floor(g.en.length * 0.75);
    this.net.setPresence(g);
  }

  snapshotEnemies() {
    const out = [];
    for (const e of this.game.enemies) {
      if (e.removed) continue;
      if (!e.netId) e.netId = ++this.nextId;
      e.netKind ||= kindOf(e);
      out.push([e.netId, e.netKind, r1(e.pos.x), r1(e.pos.z), r2(e.yaw), e.state, r2(e.t), Math.ceil(e.hp), Math.ceil(e.maxHp), e.level || 1, e.isChampion ? 'c' : e.elite ? `e:${e.affix}` : '', e.isBoss ? e.phase || 1 : 0]);
      if (out.length >= 32) break;
    }
    return out;
  }

  receive(r, g) {
    const prev = r.g;
    r.g = g;
    if (prev?.w !== g.w || prev?.run !== g.run || !!prev?.h !== !!g.h) this.dirty = true;
    // A friend just set off on a dungeon: offer to join.
    if (g.h && g.w === 'run' && prev?.run !== g.run && this.game.state === 'camp') this.offerJoin(r);
    const list = g.ev || [];
    const top = list.reduce((m, e) => Math.max(m, e[0]), 0);
    if (r.lastSeq == null || top < r.lastSeq - 50) {
      r.lastSeq = top; // first sight (or they reloaded): don't replay old history
      return;
    }
    for (const e of list) if (e[0] > r.lastSeq) this.handleEvent(r, e);
    r.lastSeq = Math.max(r.lastSeq, top);
  }

  handleEvent(r, e) {
    const G = this.game;
    const [, type, ...d] = e;
    const sameRun = !!this.runId && r.g.run === this.runId && IN_RUN.has(G.state);
    const sameCamp = G.state === 'camp' && r.g.w === this.where();
    const fromHost = sameRun && this.guest?.peer === r.peer;
    switch (type) {
      case 'a': // someone's arrow (just for show)
        if (sameRun || sameCamp) this.visualArrow(d, sameCamp);
        break;
      case 'h': // a guest hit one of my enemies
        if (this.hosting && sameRun) this.applyHit(r, d);
        break;
      case 'st': // ...and set it burning, bleeding or frozen
        if (this.hosting && sameRun) this.applyStatus(d);
        break;
      case 'd': // the host's enemy hit me
        if (fromHost && d[0] === this.myPeer) this.takeDamage(d);
        break;
      case 'p':
        if (fromHost) this.replay(() => G.enemyArrows.spawn(new THREE.Vector3(d[0], d[1], d[2]), new THREE.Vector3(d[3], 0, d[4]).normalize(), d[5], d[6], this.puppets.get(d[7]) || null));
        break;
      case 'f':
        if (fromHost) this.replay(() => G.fireballs.spawn(new THREE.Vector3(d[0], d[1], d[2]), new THREE.Vector3(d[3], 0, d[4]).normalize(), this.puppets.get(d[5]) || null));
        break;
      case 'sw': {
        const b = fromHost && this.puppets.get(d[0]);
        if (!b) break;
        const at = new THREE.Vector3(d[1], 0, d[2]);
        (b.waves ||= []).push(new Shockwave(G, at, 12, d[3]));
        if (d[4]) b.waves.push(new Shockwave(G, at.clone(), 12, d[3], 0.45));
        break;
      }
      case 'br': {
        const b = fromHost && this.puppets.get(d[0]);
        if (b && d[1] === this.myPeer) (b.barrages ||= []).push(new Barrage(G, b, G.player));
        break;
      }
      case 'k':
        if (fromHost) this.onKill(d);
        break;
    }
  }

  replay(fn) {
    this.replaying = true;
    try {
      fn();
    } finally {
      this.replaying = false;
    }
  }

  // ---------------------------------------------------------------- arrows, hits, damage

  /** My own arrow: show it to everyone nearby. */
  noteShot(origin, dir, speed, perfect) {
    if (!this.net || !this.remotes.size) return;
    this.ev('a', [r2(origin.x), r2(origin.z), r2(dir.x), r2(dir.z), r1(speed), perfect ? 1 : 0]);
  }

  visualArrow([x, z, dx, dz, speed, perfect], camp) {
    const G = this.game;
    const arrows = camp ? G.camp.arrows : G.arrows;
    if (!arrows) return;
    const origin = new THREE.Vector3(x, ARROW_HEIGHT, z);
    arrows.spawn(origin, new THREE.Vector3(dx, 0, dz).normalize(), speed, 0, 1, !!perfect, { visual: true });
    G.sfx.sample?.('whoosh', { vol: 0.15, rate: 1.6, pan: G.panAt(origin) });
  }

  applyHit(r, [id, dmg, dx, dz, charge, perfect]) {
    const G = this.game;
    const e = G.enemies.find((x) => x.netId === id);
    if (!e || !e.isHittable()) return;
    const dir = new THREE.Vector3(dx, 0, dz).normalize();
    const amount = Math.max(0, Math.min(5000, dmg)); // untrusted: keep it sane
    const res = e.hit(amount, dir, Math.max(0, Math.min(1, charge)), !!perfect);
    if (!res) return;
    G.numbers.spawn(e.pos.clone().setY(2.1), Math.round(amount), perfect ? 'perfect' : 'normal');
    if (res === 'kill') {
      this.killer = r.peer;
      G.onKill(e);
      this.killer = null;
    }
  }

  applyStatus([id, kind, a, b, c, d]) {
    const e = this.game.enemies.find((x) => x.netId === id);
    if (!e || !e.isHittable()) return;
    if (kind === 'b') e.applyBurn?.(Math.min(a, 200), Math.min(b, 10));
    else if (kind === 'l') e.applyBleed?.(Math.min(a, 200), Math.min(b, 10));
    else if (kind === 'f') e.applyFrost?.(a, b, c, d);
  }

  takeDamage([, dmg, dx, dz]) {
    const G = this.game;
    const P = G.player;
    if (P.dead || G.state !== 'playing') return;
    const dir = new THREE.Vector3(dx, 0, dz);
    const res = P.takeDamage(Math.max(0, Math.min(500, dmg)), dir, G);
    if (res === true) G.onPlayerHit({ lungeDir: dir }, Math.round(dmg));
    else if (res === 'dodged') G.onPerfectDodge(null);
  }

  /** Host: an enemy died. Everyone in the party gets gems for it. */
  noteKill(enemy) {
    if (!this.hosting || !this.partyRemotes().length) return;
    if (!enemy.netId) enemy.netId = ++this.nextId;
    const base = enemy.isBoss ? 25 : enemy.elite ? 5 : enemy.kind === 'archer' ? 2 : 1;
    this.ev('k', [enemy.netId, this.killer || this.myPeer, base]);
  }

  onKill([id, killer, base]) {
    const G = this.game;
    const e = this.puppets.get(id);
    const pos = e ? e.pos.clone() : G.player.pos.clone();
    if (base) G.loot.drop(pos, Math.max(1, Math.round(base * (G.difficulty?.gems || 1))), e?.isBoss ? 3 : 0);
    if (killer === this.myPeer) {
      G.stats.kills++;
      G.bounty?.('kill');
      G.ultimate.gain(config.ultimate.perKill);
    }
  }

  /** Host: enemy arrows and fire pots also fly on guests' screens (and hurt them there). */
  hookSpawns() {
    const G = this.game;
    const share = () => this.hosting && !this.replaying && this.partyRemotes().length > 0;
    const ea = G.enemyArrows;
    const arrowSpawn = ea.spawn.bind(ea);
    ea.spawn = (origin, dir, speed, damage, owner) => {
      arrowSpawn(origin, dir, speed, damage, owner);
      if (share()) this.ev('p', [r2(origin.x), r2(origin.y), r2(origin.z), r2(dir.x), r2(dir.z), r1(speed), Math.round(damage), owner?.netId || 0]);
    };
    const fb = G.fireballs;
    const potSpawn = fb.spawn.bind(fb);
    fb.spawn = (origin, dir, owner) => {
      potSpawn(origin, dir, owner);
      if (share()) this.ev('f', [r2(origin.x), r2(origin.y), r2(origin.z), r2(dir.x), r2(dir.z), owner?.netId || 0]);
    };
  }

  noteShockwave(boss, at, damage) {
    if (!this.hosting || !this.partyRemotes().length) return;
    if (!boss.netId) boss.netId = ++this.nextId;
    this.ev('sw', [boss.netId, r2(at.x), r2(at.z), Math.round(damage), boss.phase === 2 ? 1 : 0]);
  }

  noteBarrage(boss, target) {
    if (!this.hosting || !this.partyRemotes().length || !target?.peer) return;
    if (!boss.netId) boss.netId = ++this.nextId;
    this.ev('br', [boss.netId, target.peer]);
  }

  /** Host: which player this enemy goes after (the closest one still standing). */
  targetFor(e) {
    const G = this.game;
    const P = G.player;
    const cands = P.dead ? [] : [P];
    for (const r of this.partyRemotes()) if (!r.dead && !r.away && r.placed) cands.push(r.proxy);
    if (cands.length <= 1) return cands[0] || P;
    const dist = (t) => Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z);
    let best = cands[0];
    for (const c of cands) if (dist(c) < dist(best)) best = c;
    const cur = cands.includes(e.netTarget) ? e.netTarget : null;
    // Stick with the current target unless someone is clearly closer.
    if (cur && dist(best) > dist(cur) * 0.7) return cur;
    e.netTarget = best;
    return best;
  }

  // ---------------------------------------------------------------- friends on screen

  updateAvatar(r, dt) {
    const g = r.g;
    if (!g?.p) return;
    const G = this.game;
    const [x, z, ay, vx, vz, f, hp, maxHp, charge] = g.p;
    const dx = x - r.pos.x;
    const dz = z - r.pos.z;
    if (!r.placed || Math.hypot(dx, dz) > 6) {
      r.pos.set(x, 0, z);
      r.placed = true;
    } else {
      const k = 1 - Math.exp(-14 * dt);
      r.pos.x += dx * k;
      r.pos.z += dz * k;
    }
    r.vel.set(vx, 0, vz);
    r.proxy.dead = !!(f & 4);
    r.proxy.rollInvuln = !!(f & 2);
    const inRun = !!this.runId && g.w === 'run' && g.run === this.runId && IN_RUN.has(G.state);
    const show = inRun || (G.state === 'camp' && g.w === this.where());
    if (!show) {
      if (r.avatar) r.avatar.group.visible = r.tag.visible = false;
      return;
    }
    if (!r.avatar) {
      r.avatar = new Player(G.scene);
      r.avatar.hideIndicators();
      r.tag = makeTag();
    }
    const A = r.avatar;
    const scene = G.state === 'camp' ? G.camp.scene : G.scene;
    if (A.group.parent !== scene) scene.add(A.group, r.tag);
    if (r.charId !== g.ch || r.outfit !== g.of) {
      r.charId = g.ch;
      r.outfit = g.of;
      A.setCharacter(g.ch, g.of);
    }
    A.group.visible = r.tag.visible = true;
    A.pos.copy(r.pos);
    A.vel.copy(r.vel);
    A.aimDir.set(Math.sin(ay), 0, Math.cos(ay));
    const drawing = !!(f & 1);
    if (r.wasDrawing && !drawing) A.releaseT = 0.35;
    r.wasDrawing = drawing;
    A.releaseT = Math.max(0, (A.releaseT || 0) - dt);
    A.drawing = drawing;
    A.drawT = Math.min(0.999, charge || 0) * stat.drawTime(); // the bow shows their draw (worked out from our draw time)
    A.rolling = !!(f & 2);
    A.dead = !!(f & 4);
    const aiming = drawing || A.releaseT > 0;
    const yaw = aiming ? ay - (A.spineBones?.length ? A.armOffset || 0 : 0) : Math.hypot(vx, vz) > 0.8 ? Math.atan2(vx, vz) : ay;
    A.yaw += wrap(yaw - A.yaw) * (1 - Math.exp(-16 * dt));
    A.aimingNow = aiming;
    A.group.position.copy(A.pos);
    A.group.rotation.y = A.yaw;
    A.updateBow();
    A.updateModel(dt);
    r.tag.position.set(A.pos.x, 2.6, A.pos.z);
    const key = `${this.nameOf(r)}|${inRun ? Math.round((hp / (maxHp || 100)) * 40) : -1}|${A.dead}`;
    if (key !== r.tagKey) {
      r.tagKey = key;
      drawTag(r.tag, this.nameOf(r), hp, maxHp, inRun, A.dead);
    }
  }

  // ---------------------------------------------------------------- joining a friend's dungeon

  canJoin(r) {
    const g = r.g;
    if (!g?.h || g.w !== 'run' || !g.run || this.game.state !== 'camp') return false;
    if (!missionById(g.h.m)) return false;
    if (g.h.st !== 'playing' && g.h.st !== 'choosing' && g.h.st !== 'paused') return false;
    const party = [...this.remotes.values()].filter((x) => x.g?.run === g.run).length; // host + guests
    return party < MAX_PARTY;
  }

  join(r) {
    const G = this.game;
    if (!this.canJoin(r)) return;
    const g = r.g;
    this.guest = { peer: r.peer, runId: g.run };
    this.runId = g.run;
    this.hostGoneT = 0;
    this.toggle(false);
    this.hideToast();
    G.camp.close?.();
    G.tips.hide();
    G.fade();
    G.sfx.sample('boom', { vol: 0.4, rate: 0.8, jitter: 0 });
    setTimeout(() => {
      G.start(false, { mission: missionById(g.h.m), difficulty: difficultyById(g.h.d) });
      G.wave = g.h.wv || 1;
      G.waveState = 'active';
      G.player.pos.set(r.pos.x + 1.5, 0, r.pos.z + 1.2);
      G.camTarget.copy(G.player.pos);
      G.banner('You joined the party', `${this.nameOf(r)}'s ${G.mission?.name || 'dungeon'}`, 2.4);
    }, 250);
  }

  /** A run is starting: solo/host runs of a mission can be joined by friends. */
  onRunStart() {
    const G = this.game;
    this.puppets.clear();
    this.deadWave = null;
    this.reviveT = 0;
    if (this.guest) return;
    this.runId = G.mission && !G.mission.daily ? `${(this.myPeer || 'p').slice(0, 8)}-${Date.now().toString(36)}` : null;
  }

  /** Back in camp (or the title): leave any party. */
  onLeaveRun() {
    this.runId = null;
    this.guest = null;
    this.puppets.clear();
    this.deadWave = null;
  }

  leaveParty() {
    const G = this.game;
    G.bankOnExit?.();
    this.onLeaveRun();
    G.enterCamp();
  }

  // ---------------------------------------------------------------- guests: following the host

  guestUpdate(dt) {
    const G = this.game;
    const host = this.remotes.get(this.guest.peer);
    const hg = host?.g;
    if (!hg || hg.w !== 'run' || hg.run !== this.guest.runId) {
      this.hostGoneT = (this.hostGoneT || 0) + dt;
      if (this.hostGoneT > 3) {
        this.hostGoneT = -1e9;
        G.banner('The host left the dungeon', 'Heading back to camp with what you found', 2.4);
        G.endReason = 'The host left';
        setTimeout(() => G.state === 'playing' && G.gameOver(), 2200);
      }
      return;
    }
    this.hostGoneT = 0;
    const h = hg.h || {};
    this.syncPuppets(hg.en || []);
    if (h.wv > G.wave) {
      G.wave = h.wv;
      if (G.waveState !== 'mission-won') {
        G.waveState = 'active';
        G.banner(`Wave ${h.wv}`, '', 1.4);
        G.sfx.wave(h.wv);
      }
      if (G.player.dead) this.revive();
    }
    G.toSpawn = h.ts || 0;
    if (h.ws === 'cleared' && G.waveState === 'active') {
      // Same as the host: a little healing, then pick a skill.
      const heal = G.mods?.noHeal ? 0 : Math.min(config.player.healPerWave, G.maxHp() - G.player.hp);
      if (!G.player.dead) G.player.hp += Math.max(0, heal);
      G.waveState = 'cleared';
      G.clearTimer = 1.1;
      G.banner(`Wave ${G.wave} cleared`, heal > 0 ? `+${Math.round(heal)} HP` : '');
      G.player.cheer();
      G.sfx.cleared(true);
    }
    if ((h.ws === 'mission-won' || h.st === 'victory') && G.waveState !== 'mission-won') {
      G.waveState = 'mission-won';
      G.clearTimer = 2.8;
      G.player.cheer();
    }
    if (h.st === 'gameover' && !this.partyOver) {
      this.partyOver = true;
      G.banner('The party fell', '', 2);
      G.endReason = 'The party fell';
      setTimeout(() => G.state === 'playing' && G.gameOver(), 1500);
    }
    // Count down to the skill pick / Mission Complete (the host's own timers).
    if (G.waveState === 'cleared' || G.waveState === 'mission-won') G.updateWaves(dt);
  }

  syncPuppets(list) {
    const G = this.game;
    const seen = new Set();
    for (const s of list) {
      const [id, kind, x, z, yaw, state, t, hp, maxHp, level, extra, phase] = s;
      seen.add(id);
      let e = this.puppets.get(id);
      if (!e) {
        if (state === 'dying') continue;
        e = this.makePuppet(id, kind, x, z, level, extra, state);
        if (!e) continue;
      }
      e.net = { x, z, yaw, state, t, hp, maxHp, phase };
    }
    for (const [id, e] of this.puppets) {
      if (seen.has(id)) continue;
      if (e.state !== 'dying') puppetDie(e);
      this.puppets.delete(id);
    }
    if (G.boss?.removed || (G.boss && G.boss.state === 'dying')) G.boss = null;
  }

  makePuppet(id, kind, x, z, level, extra, state) {
    const G = this.game;
    const K = KINDS[kind] || Grunt;
    const pos = new THREE.Vector3(x, 0, z);
    let e;
    try {
      e = kind === 'boss' ? new Boss(G, pos, level, 1, G.arena || 0) : new K(G, pos, level);
    } catch {
      return null;
    }
    e.netId = id;
    e.puppet = true;
    if (extra === 'c') {
      makeElite(e, 'shielded');
      e.isChampion = true;
    } else if (extra?.startsWith('e:')) makeElite(e, extra.slice(2));
    if (state !== 'spawning') {
      e.state = state;
      e.rig.position.y = 0;
      e.spawnRing.visible = false;
    }
    const coop = this;
    // Hits on the copy go to the host; the host's numbers come back in its next update.
    e.hit = function (damage, dir, charge, perfect) {
      if (!this.isHittable()) return null;
      coop.ev('h', [this.netId, Math.round(damage), r2(dir.x), r2(dir.z), r2(charge), perfect ? 1 : 0]);
      this.hp = Math.max(1, this.hp - damage);
      this.predUntil = performance.now() + 500;
      this.flash = 0.08;
      this.flinch = Math.min(1, 0.5 + charge * 0.5);
      return 'hit';
    };
    e.applyBurn = (dps, dur) => coop.ev('st', [id, 'b', r1(dps), r1(dur)]);
    e.applyBleed = (dps, dur) => coop.ev('st', [id, 'l', r1(dps), r1(dur)]);
    e.applyFrost = (...a) => {
      coop.ev('st', [id, 'f', ...a.map(r2)]);
      return false;
    };
    e.update = (dt) => puppetStep(e, dt);
    this.puppets.set(id, e);
    G.enemies.push(e);
    if (e.isBoss) G.boss = e;
    return e;
  }

  // ---------------------------------------------------------------- down, and back up

  /** Called while I'm down in a party: a friend standing next to me brings me back. */
  downedUpdate(dt) {
    const G = this.game;
    const P = G.player;
    if (this.deadWave == null) {
      this.deadWave = G.wave;
      this.reviveT = 0;
    }
    const helper = this.partyRemotes().find((r) => !r.dead && Math.hypot(r.pos.x - P.pos.x, r.pos.z - P.pos.z) < 2.4);
    this.reviveT = helper ? this.reviveT + dt : Math.max(0, this.reviveT - dt * 0.5);
    this.reviveBy = helper ? this.nameOf(helper) : null;
    if (this.reviveT >= 2.5) return this.revive();
    // The host ends the run once everyone is down.
    if (this.hosting && this.partyRemotes().every((r) => r.dead)) {
      G.deathTimer += dt;
      if (G.deathTimer > 1.3) G.gameOver();
    }
  }

  revive() {
    const G = this.game;
    const P = G.player;
    if (!P.dead) return;
    P.dead = false;
    P.hp = Math.round(G.maxHp() * 0.4);
    P.iframes = 2;
    G.deathShown = false;
    G.deathTimer = 0;
    this.deadWave = null;
    this.reviveT = 0;
    G.banner('Back on your feet!', this.reviveBy ? `${this.reviveBy} got you up` : '', 1.8);
    G.particles.spawn(P.pos.clone().setY(1), { count: 30, color: [1.6, 2.6, 1.4], speed: 3, up: 3, life: 0.8, size: 0.1, gravity: -1 });
    G.sfx.sample('jingleClear', { vol: 0.4, rate: 1.3, jitter: 0 });
  }

  // ---------------------------------------------------------------- the Online panel

  buildUi() {
    const btn = document.createElement('button');
    btn.id = 'online-btn';
    btn.type = 'button';
    btn.innerHTML = '<span class="dot"></span>Online <b>0</b>';
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.toggle();
    });
    const panel = document.createElement('div');
    panel.id = 'online-panel';
    panel.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const j = e.target.closest('[data-join]');
      if (j) {
        const r = this.remotes.get(j.dataset.join);
        if (r) this.join(r);
      }
      if (e.target.closest('[data-close]')) this.toggle(false);
    });
    const toast = document.createElement('div');
    toast.id = 'online-toast';
    toast.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const j = e.target.closest('[data-join]');
      if (j) {
        const r = this.remotes.get(j.dataset.join);
        if (r) this.join(r);
      } else this.hideToast();
    });
    const party = document.createElement('div');
    party.id = 'party-hud';
    document.body.append(btn, panel, toast, party);
    this.ui = { btn, panel, toast, party };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) this.toggle(false);
    });
  }

  toggle(show = !this.open) {
    this.open = show;
    this.ui.panel.classList.toggle('show', show);
    if (show) this.renderUi();
  }

  offerJoin(r) {
    if (!this.canJoin(r)) return;
    const t = this.ui.toast;
    const m = missionById(r.g.h.m);
    t.innerHTML = `<span><b></b> set off for ${esc(m?.name || 'a dungeon')}</span><button type="button" data-join="${esc(r.peer)}">Join</button>`;
    t.querySelector('b').textContent = this.nameOf(r);
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.hideToast(), 12000);
  }

  hideToast() {
    this.ui.toast.classList.remove('show');
  }

  whereText(r) {
    const g = r.g || {};
    if (g.w === 'camp' || g.w?.startsWith('room:')) return 'In camp';
    if (g.w === 'run') {
      if (g.h) {
        const m = missionById(g.h.m);
        return `Leading ${m?.name || 'a dungeon'} · wave ${g.h.wv || 1}`;
      }
      const host = [...this.remotes.values()].find((x) => x.g?.h && x.g.run === g.run);
      return host ? `In ${this.nameOf(host)}'s party` : g.run === this.runId ? 'In your party' : 'In a dungeon';
    }
    if (g.w === 'solo') return 'On a solo run';
    return 'On the title screen';
  }

  renderUi() {
    const n = this.remotes.size;
    const { btn, panel } = this.ui;
    btn.querySelector('b').textContent = this.status === 'on' ? String(n) : '';
    btn.classList.toggle('live', this.status === 'on');
    btn.classList.toggle('busy', n > 0);
    if (!this.open) return;
    let body;
    if (this.status === 'connecting') body = '<p class="ol-note">Connecting…</p>';
    else if (this.status === 'off')
      body = `<p class="ol-note">Online play works when the game is opened on claude.ai while signed in. Share it with friends (the page's <b>Share</b> menu, then invite them) and you'll see each other here.</p>`;
    else if (!n) body = `<p class="ol-note">No one else is here right now. Invite friends with the page's <b>Share</b> menu: when they open the game, they'll walk around your camp, and you can fight dungeons together (up to ${MAX_PARTY} players).</p>`;
    else {
      body = `<ul class="ol-list">${[...this.remotes.values()]
        .map(
          (r) => `<li><span class="ol-hero"></span><span class="ol-who"><b data-name="${esc(r.peer)}"></b><em>${esc(this.whereText(r))}</em></span>${
            this.canJoin(r) ? `<button type="button" data-join="${esc(r.peer)}">Join</button>` : r.g?.h && r.g.w === 'run' && this.game.state === 'camp' ? '<span class="ol-full">Full</span>' : ''
          }</li>`,
        )
        .join('')}</ul>
        <p class="ol-note">Start a dungeon from the gate and friends can join you here. The one who starts it leads: enemies, waves and the boss run on their game.</p>`;
    }
    panel.innerHTML = `<h3>Playing online</h3>${body}<button type="button" class="ol-close" data-close>Close</button>`;
    for (const r of this.remotes.values()) {
      const el = panel.querySelector(`[data-name="${CSS.escape(r.peer)}"]`);
      if (el) el.textContent = this.nameOf(r);
      const hero = el?.closest('li')?.querySelector('.ol-hero');
      if (hero) hero.textContent = r.name ? charName(r.g?.ch) : '';
      if (hero && !r.name) hero.remove();
    }
  }

  /** Your party's health while in a dungeon together. */
  updatePartyHud() {
    const el = this.ui.party;
    const G = this.game;
    const on = !!this.runId && IN_RUN.has(G.state) && this.partyRemotes().length > 0;
    el.classList.toggle('show', on);
    if (!on) {
      this.partyKey = '';
      return;
    }
    const rows = this.partyRemotes().map((r) => {
      const p = r.g.p || [];
      return { name: this.nameOf(r), hp: p[6] || 0, max: p[7] || 100, dead: r.dead, lead: !!r.g.h };
    });
    const me = G.player;
    const revive = me.dead ? (this.reviveBy ? `${this.reviveBy} is getting you up… ${Math.min(100, Math.round((this.reviveT / 2.5) * 100))}%` : 'You are down. Stand next to a friend (or wait for the next wave) to get back up.') : '';
    const key = JSON.stringify([rows, revive]);
    if (key === this.partyKey) return;
    this.partyKey = key;
    el.innerHTML = `${rows.map((r, i) => `<div class="pm ${r.dead ? 'down' : ''}"><span class="pm-name" data-i="${i}"></span><span class="pm-bar"><i style="width:${Math.round((100 * r.hp) / r.max)}%"></i></span></div>`).join('')}${revive ? '<div class="pm-revive"></div>' : ''}`;
    el.querySelectorAll('.pm-name').forEach((n, i) => (n.textContent = `${rows[i].lead ? '★ ' : ''}${rows[i].name}${rows[i].dead ? ' · down' : ''}`));
    if (revive) el.querySelector('.pm-revive').textContent = revive;
  }
}

/** A guest's copy of one of the host's enemies: it moves and animates as the host says. */
function puppetStep(e, dt) {
  const n = e.net;
  e.flash = Math.max(0, (e.flash || 0) - dt);
  e.hitT = Math.max(0, (e.hitT || 0) - dt);
  if (e.state === 'dying') {
    e.t += dt;
    e.updateDying(dt);
    e.updateModel(dt);
    return;
  }
  if (n) {
    if (n.state === 'dying') return puppetDie(e);
    const dx = n.x - e.pos.x;
    const dz = n.z - e.pos.z;
    if (Math.hypot(dx, dz) > 5) e.pos.set(n.x, 0, n.z);
    else {
      const k = 1 - Math.exp(-12 * dt);
      e.pos.x += dx * k;
      e.pos.z += dz * k;
    }
    e.yaw += wrap(n.yaw - e.yaw) * (1 - Math.exp(-14 * dt));
    if (n.state !== e.state) {
      const prev = e.state;
      e.lastState = prev;
      e.state = n.state;
      e.t = n.t;
      const pan = e.game.panAt(e.pos);
      if (n.state === 'intro' && e.isBoss) e.game.onBossIntro(e);
      if (n.state === 'windup') e.game.sfx.windup?.(pan);
      if (n.state === 'lunge') e.game.sfx.lunge?.(pan);
    } else e.t += dt;
    e.hp = performance.now() < (e.predUntil || 0) ? Math.min(e.hp, n.hp) : n.hp;
    e.maxHp = n.maxHp;
    if (e.isBoss && n.phase) e.phase = n.phase;
  }
  if (e.state === 'spawning') e.updateLeapIn(0.75);
  else if (e.spawnRing.visible) {
    e.rig.position.y = 0;
    e.spawnRing.visible = false;
  }
  // The red wedge before a lunge, so you can see it coming.
  if (e.wedge) {
    const g = e.tune || config.grunt;
    if (e.state === 'windup' && !e.isBoss) {
      const p = Math.min(1, e.t / g.windupTime);
      e.wedge.visible = true;
      e.wedgeMat.opacity = 0.12 + 0.45 * p;
      e.wedge.position.set(e.pos.x, 0.045, e.pos.z);
      e.wedge.rotation.y = e.yaw;
      e.wedge.scale.set(1.2, 1, g.lungeSpeed * g.lungeTime + e.radius);
    } else e.wedge.visible = false;
  }
  e.group.position.copy(e.pos);
  e.group.rotation.y = e.yaw;
  const f = e.flash > 0 ? 0.8 : 0;
  if (e.model) {
    for (const m of e.model.materials) m.emissive?.setRGB(f, f, f);
    e.flinch = Math.max(0, (e.flinch || 0) - dt * 5);
    e.model.holder.rotation.x = -0.45 * e.flinch * e.flinch;
  } else e.bodyMat?.emissive.setRGB(f * 2, f * 2, f * 2);
  e.updateHpBar();
  e.updateModel(dt);
  if (e.waves) e.waves = e.waves.filter((w) => w.update(dt));
  if (e.barrages) e.barrages = e.barrages.filter((b) => b.update(dt) || (b.dispose(), false));
}

function puppetDie(e) {
  if (e.state === 'dying') return;
  const dir = new THREE.Vector3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
  e.die(dir);
  if (e.isBoss) e.game.onBossDefeated(e); // banner, kill cam, and the rest of the wave falls
  if (e.game.boss === e) e.game.boss = null;
}
