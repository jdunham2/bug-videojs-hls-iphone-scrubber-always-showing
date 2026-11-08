// Missions in play: the hidden treasure chest, the bonus challenge, and the
// Mission Complete screen with stars and rewards.

import * as THREE from 'three';
import { spawnProp } from './models.js';
import { pillars, ARENA_HALF } from './world.js';
import { recordMission, MISSIONS, fmtTime } from './missions.js';
import { dailyScore, recordDaily } from './daily.js';
import { rollItem, addToStash, RARITIES, gearIcon } from './gear.js';
import { bankRun } from './profile.js';
import { prov } from './provisions.js';

const glowTex = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,220,140,0.9)');
    grad.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

export class MissionMethods {
  /** A mission's own setup when a run starts. */
  setupMission() {
    this.secret = null;
    const m = this.mission;
    if (!m) return;
    // The chest turns up on a random middle wave.
    this.secretWave = 2 + Math.floor(Math.random() * Math.max(1, m.waves - 2));
  }

  /** Enemy level for spawns: the wave plus the mission's starting level. */
  enemyLevel() {
    return this.wave + (this.mission?.level || 0);
  }

  /** Hide the treasure chest somewhere out of the way (a far corner, behind cover). */
  spawnSecret() {
    if (this.secret) return;
    const P = this.player.pos;
    const H = ARENA_HALF - 2.2;
    const spots = [
      [H, H],
      [-H, H],
      [H, -H],
      [-H, -H],
      [0, H],
      [H, 0],
    ].filter(([x, z]) => Math.hypot(x - P.x, z - P.z) > 9 && pillars.every((q) => Math.hypot(x - q.x, z - q.z) > q.r + 1.2));
    const [x, z] = spots[Math.floor(Math.random() * spots.length)] || [H, H];
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(-x, -z);
    const model = spawnProp('treasureChest', 0.9);
    if (model) group.add(model);
    else group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0x7a4a22 })));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(2.2);
    glow.position.y = 0.6;
    group.add(glow);
    this.scene.add(group);
    this.secret = { group, glow, pos: new THREE.Vector3(x, 0, z), found: false, t: 0 };
    pillars.push((this.secret.collider = { x, z, r: 0.6, h: 0.8, hazardSpot: true }));
    this.sfx.sample('ding', { vol: 0.25, rate: 2.2, jitter: 0, pan: this.panAt(this.secret.pos) });
    if (prov.has('scout')) {
      // The hired scout has marked the spot: a tall beam of light over the chest.
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.6, 14, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 0.8), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      beam.position.y = 7;
      group.add(beam);
      this.banner('Your scout found it', 'A beacon marks the hidden chest', 1.8);
    }
  }

  updateSecret(dt) {
    const s = this.secret;
    if (!s || s.found) return;
    s.t += dt;
    s.glow.material.opacity = 0.45 + 0.25 * Math.sin(s.t * 3);
    if (Math.random() < dt * 6) this.particles.spawn(s.pos.clone().setY(0.5 + Math.random() * 0.6), { count: 1, color: [3, 2.4, 1], speed: 0.3, up: 0.8, life: 0.7, size: 0.05, gravity: -0.5 });
    if (Math.hypot(this.player.pos.x - s.pos.x, this.player.pos.z - s.pos.z) < 1.6 && !this.player.dead) this.openSecret();
  }

  openSecret() {
    const s = this.secret;
    s.found = true;
    this.stats.secret = true;
    this.bounty('chest');
    s.glow.material.opacity = 1;
    s.glow.scale.setScalar(4);
    setTimeout(() => s.glow.removeFromParent(), 600);
    this.numbers.spawn(s.pos.clone().setY(2.4), 'SECRET FOUND!', 'callout gold');
    this.sfx.sample('jingleClear', { vol: 0.6, jitter: 0 });
    this.particles.spawn(s.pos.clone().setY(0.8), { count: 50, color: [3, 2.3, 0.8], speed: 6, up: 6, life: 1, size: 0.08, gravity: 6 });
    this.shake.add(0.2);
    this.loot.drop(s.pos, Math.round(15 * (this.difficulty?.gems || 1)), 1);
    const slot = ['bow', 'armor', 'gadget'][Math.floor(Math.random() * 3)];
    const power = this.enemyLevel() * 0.9 + (this.difficulty?.lootPower || 0) + 2;
    this.gearDrops.spawn(s.pos, rollItem(slot, power, Math.random() < 0.35 ? 'unique' : 'rare'));
  }

  clearSecret() {
    if (!this.secret) return;
    this.secret.group.removeFromParent();
    const i = pillars.indexOf(this.secret.collider);
    if (i >= 0) pillars.splice(i, 1);
    this.secret = null;
  }

  /** The boss of a mission is down: stars, rewards, the victory screen. */
  missionComplete() {
    const m = this.mission;
    this.state = 'victory';
    this.gearDrops.scoop();
    this.hideGearCard();
    this.tips.hide();
    this.hud.bossCard.classList.remove('show');
    this.loot.scoop();
    this.music.stinger(true);
    this.sfx.sample('jingleClear', { vol: 0.8, jitter: 0 });
    const got = { clear: true, secret: !!this.stats.secret, challenge: m.challenge.check(this) };
    const fresh = m.daily ? { clear: false, secret: false, challenge: false } : recordMission(m.id, got);
    this.dailyResult = null;
    if (m.daily) {
      const score = dailyScore(this.stats, { cleared: true, elapsed: this.elapsed, wave: this.wave });
      this.dailyResult = { score, ...recordDaily(score, true) };
      fresh.clear = this.dailyResult.firstClear; // first clear of the day pays a gear reward
    }
    // Rewards: a gem purse that grows with the mission and tier, plus a guaranteed
    // Rare-or-better piece of gear the first time you clear it.
    const index = m.daily ? 2 : MISSIONS.indexOf(m);
    const purse = Math.round((25 + 15 * index) * (this.difficulty?.gems || 1));
    const gems = this.loot.runGems + purse;
    this.gemsThisRun = (this.stats.gemsBanked || 0) + gems;
    this.newUnlocks = [...(this.runUnlocks || []), ...bankRun({ gems, wave: this.wave, kills: this.stats.kills })];
    this.loot.runGems = 0;
    this.reward = null;
    if (fresh.clear) {
      const slot = ['bow', 'armor', 'gadget'][Math.floor(Math.random() * 3)];
      this.reward = rollItem(slot, this.enemyLevel() + (this.difficulty?.lootPower || 0) + 2, Math.random() < 0.4 ? 'unique' : 'rare');
      addToStash(this.reward);
    }
    this.bounty('mission');
    this.xpResult = this.awardXp(true);
    this.victory = { got, fresh, purse };
    this.showOverlay('victory');
  }

  /** The Mission Complete screen body. */
  victoryHtml() {
    const m = this.mission;
    const v = this.victory;
    const s = this.stats;
    const star = (on, isNew, label, i) => `<div class="vstar ${on ? 'on' : ''} ${isNew ? 'new' : ''}" style="animation-delay:${0.35 + i * 0.35}s"><span>★</span><em>${label}</em></div>`;
    const r = this.reward;
    return `
      <div class="eyebrow">${this.difficulty?.name || ''}</div>
      <h1 class="victory">${m.daily ? 'Trial Complete' : 'Mission Complete'}</h1>
      <p class="tag">${m.name}</p>
      ${
        m.daily
          ? `<div class="vscore"><div class="vs-num">${this.dailyResult.score.toLocaleString()}</div><div class="vs-label">${this.dailyResult.isBest ? 'New best today!' : `Today's best: ${this.dailyResult.best.toLocaleString()}`}</div></div>`
          : `<div class="vstars">
        ${star(v.got.clear, v.fresh.clear, 'Cleared', 0)}
        ${star(v.got.secret, v.fresh.secret, 'Secret chest', 1)}
        ${star(v.got.challenge, v.fresh.challenge, m.challenge.text + ` (${m.challenge.progress(this)})`, 2)}
      </div>`
      }
      <div class="summary">
        <div><b>${fmtTime(this.elapsed)}</b><span>Time</span></div>
        <div><b>${s.kills}</b><span>Kills</span></div>
        <div><b>${s.perfects}</b><span>Perfect shots</span></div>
        <div><b>◆ ${this.gemsThisRun}</b><span>Gems (+${v.purse} reward)</span></div>
      </div>
      ${r ? `<div class="vreward" style="--rar:${RARITIES[r.rarity].color}"><span class="gi">${gearIcon(r)}</span><div><div class="vr-label">${m.daily ? "Today's reward" : 'First clear reward'}</div><div class="vr-name"></div><div class="vr-meta">${RARITIES[r.rarity].name} · Power ${r.power}</div></div></div>` : ''}
      ${this.xpHtml()}
      ${this.newUnlocks?.length ? `<p class="unlocks">New in camp: ${this.newUnlocks.join(', ')}</p>` : ''}
      ${this.gearSummary() ? `<p class="gear-found">${this.gearSummary()}</p>` : ''}
      <button>Return to camp</button>`;
  }
}
