// Combat events: firing, hits, kills, elements, lightning, explosions, dodges, damage.
import * as THREE from 'three';
import { gearStats } from './gear.js';
import { config } from './config.js';
import { lv, buffs } from './skills.js';

/** Methods mixed into Game (see game.js). */
export class CombatMethods {
  /** opts: { mega, extra } */
  fireArrow(origin, dir, speed, damage, charge, perfect, opts = {}) {
    const element = lv('fire') ? 'fire' : lv('frost') ? 'frost' : null;
    // In camp, arrows fly in the camp scene (training dummy practice).
    const arrows = this.state === 'camp' ? this.camp.arrows : this.arrows;
    arrows.spawn(origin, dir, speed, damage, charge, perfect, { ...opts, bounces: lv('ricochet'), element });
    if (this.state === 'camp') {
      this.sfx.release(charge, perfect, this.panAt(origin));
      return;
    }
    if (opts.extra) return; // Split Shot side arrows share the main shot's sound and stats
    this.tips.done('draw');
    if (perfect) this.tips.done('perfect');
    else this.tips.show('perfect');
    this.sfx.release(charge, perfect, this.panAt(origin));
    if (opts.mega) {
      this.sfx.megaRelease();
      this.shake.add(0.5);
      this.particles.spawn(origin, { count: 24, color: [3, 0.6, 2.4], speed: 6, up: 1, life: 0.4, size: 0.1, gravity: 1, dir, spread: 1 });
    }
    this.stats.shots++;
    if (perfect) {
      this.stats.perfects++;
      this.stats.streak++;
      this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
      if (this.stats.streak % 3 === 0) this.sfx.combo();
      this.ultimate.gain(config.ultimate.perPerfect);
      this.particles.spawn(origin, { count: 14, color: [3, 2.2, 0.6], speed: 5, up: 1, life: 0.35, size: 0.08, gravity: 2, dir, spread: 0.9 });
      this.shake.add(0.18);
    } else {
      this.stats.streak = 0;
      this.particles.spawn(origin, { count: 4, color: 0xd8cfb8, speed: 2, up: 0.5, life: 0.25, size: 0.06, gravity: 0, dir, spread: 1 });
    }
  }

  onArrowHit(arrow, enemy, point) {
    // Broadheads (gear): extra damage to elites and bosses.
    const G = gearStats();
    const damage = arrow.damage * (enemy.elite || enemy.isBoss ? 1 + G.perk('broadheads') : 1);
    const result = enemy.hit(damage, arrow.dir, arrow.charge, arrow.perfect || arrow.mega);
    if (!result) return;
    if (arrow.hitCount === 0 && !arrow.extra) {
      this.stats.hits++;
      this.ultimate.gain(config.ultimate.perHit);
    }
    const feel = config.feel;
    const full = arrow.charge >= 0.999;

    const kind = arrow.mega ? 'mega' : arrow.perfect ? 'perfect' : full ? 'crit' : 'normal';
    this.numbers.spawn(point.clone().add(new THREE.Vector3(0, 0.8, 0)), Math.round(damage), kind);
    if (G.perk('barbed') && result !== 'kill') enemy.applyBleed?.(G.perk('barbed'), 3);
    this.particles.spawn(point, {
      count: arrow.perfect || arrow.mega ? 22 : 8 + Math.round(arrow.charge * 8),
      color: arrow.mega ? [3, 0.6, 2.4] : arrow.perfect ? [3, 2.1, 0.5] : 0xb33a2a,
      speed: 3 + arrow.charge * 5,
      up: 2,
      life: 0.5,
      size: 0.1,
      dir: arrow.dir,
      spread: 1.1,
    });

    const big = arrow.perfect || arrow.mega;
    this.hitStop = Math.max(this.hitStop, big ? feel.perfectHitStop : feel.hitStop * (0.3 + 0.7 * arrow.charge));
    this.shake.add(arrow.mega ? 0.6 : arrow.perfect ? 0.45 : 0.12 + 0.2 * arrow.charge);
    if (big) {
      this.zoomKick = Math.min(0.12, this.zoomKick + (arrow.mega ? 0.09 : 0.05));
      this.aberration = Math.min(1, this.aberration + (arrow.mega ? 1 : 0.6));
    }
    if (Math.random() < (big ? 0.9 : 0.35)) {
      this.decals.spawn(enemy.pos.clone().addScaledVector(arrow.dir, 0.4 + Math.random() * 0.6), 'blood', big ? 1.2 : 0.7);
    }
    this.sfx.hit(arrow.perfect, this.panAt(point));

    if (result === 'stagger') {
      this.stats.staggers++;
      this.numbers.spawn(point.clone().add(new THREE.Vector3(0, 1.6, 0)), 'STAGGER', 'callout');
      this.sfx.stagger(this.panAt(point));
    }
    if (result === 'kill') this.onKill(enemy);
    else this.applyElement(enemy, point);
    if (arrow.perfect) this.powderBlast(enemy, arrow.damage);
  }

  onKill(enemy) {
    this.stats.kills++;
    // Field Dressing (gear): patch yourself up a little on every kill.
    const dressing = gearStats().perk('fieldDressing');
    if (dressing && !this.player.dead) {
      const heal = Math.min(dressing, this.maxHp() - this.player.hp);
      if (heal > 0) this.player.hp += heal;
    }
    this.dropGear(enemy);
    if (enemy.affix === 'volatile' || enemy.kind === 'bomber') {
      const pos = enemy.pos.clone();
      const big = enemy.affix === 'volatile';
      setTimeout(() => this.explosion(pos, big ? 3.2 : 2.2, big ? 45 : 25, big ? 22 : 12), big ? 550 : 250);
    }
    if (enemy.elite) this.loot.drop(enemy.pos, 5, 1);
    if (enemy.isBoss) this.loot.drop(enemy.pos, 25, 3);
    else this.loot.drop(enemy.pos, enemy.kind === 'archer' ? 2 : 1 + (Math.random() < 0.3 ? 1 : 0), Math.random() < 0.15 ? 1 : 0);
    this.ultimate.gain(config.ultimate.perKill);
    const decal = enemy.burnT > 0 ? 'scorch' : enemy.frozenT > 0 || enemy.slowT > 0 ? 'frost' : 'blood';
    this.decals.spawn(enemy.pos, decal, decal === 'blood' ? 1.8 : 2.2, 18);
    // Last enemy of the wave: slow-motion kill cam.
    const others = this.enemies.some((e) => e !== enemy && e.state !== 'dying' && !e.removed);
    if (!enemy.isBoss && this.waveState === 'active' && this.toSpawn === 0 && !others && !this.player.dead) {
      this.killCam = { t: 0, dur: 1.3, target: enemy.pos.clone() };
      this.slowmo = 1.1;
      this.slowmoScale = 0.22;
      this.hud.vignette.classList.add('slowmo');
    }
    this.sfx.kill(this.panAt(enemy.pos));
    // Three kills in quick succession earns the announcer.
    this.killTimes = (this.killTimes || []).filter((t) => this.elapsed - t < 1.5);
    this.killTimes.push(this.elapsed);
    if (this.killTimes.length >= 3 && this.elapsed - (this.lastMultiKill || -9) > 2.5) {
      this.lastMultiKill = this.elapsed;
      this.sfx.multiKill();
    }
    this.particles.spawn(enemy.pos.clone().setY(0.9), { count: 26, color: 0x7a2a20, speed: 6, up: 4, life: 0.8, size: 0.16 });
    this.particles.spawn(enemy.pos.clone().setY(0.9), { count: 10, color: 0x2a2420, speed: 3, up: 3, life: 1, size: 0.25 });
  }

  applyElement(enemy, point) {
    const fire = lv('fire');
    const frost = lv('frost');
    if (fire) enemy.applyBurn(1 + 3 * fire, 3);
    // Pinning Arrows: hobble the target; every third hit pins it in place.
    if (frost && enemy.applyFrost(0.2 + 0.1 * frost, 2, 3, 1.5)) {
      this.numbers.spawn(point.clone().setY(2.4), 'PINNED', 'callout');
      this.sfx.sample('thunkWood', { vol: 0.7, rate: 0.8, pan: this.panAt(enemy.pos) });
      this.particles.spawn(enemy.pos.clone().setY(0.2), { count: 12, color: 0x7a6a58, speed: 2, up: 1, life: 0.5, size: 0.14, gravity: 3 });
    }
  }

  /** Blasting Arrows: a perfect hit sets off the powder charge on the arrowhead. */
  powderBlast(source, damage) {
    const n = lv('blasting');
    if (!n) return;
    const pos = source.pos;
    const targets = this.enemies
      .filter((e) => e !== source && e.isHittable() && e.pos.distanceTo(pos) < 3.5)
      .sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos))
      .slice(0, n + 1);
    this.sfx.sample('boom', { vol: 0.6, rate: 1.3, jitter: 0.1, pan: this.panAt(pos) });
    this.particles.spawn(pos.clone().setY(1.1), { count: 22, color: [3, 1.4, 0.35], speed: 6, up: 2, life: 0.35, size: 0.12, gravity: 4 });
    this.particles.spawn(pos.clone().setY(1.1), { count: 8, color: 0x2a2420, speed: 2, up: 2, life: 1, size: 0.3, gravity: -1, drag: 1 });
    this.decals.spawn(pos, 'scorch', 1.8, 8);
    for (const t of targets) {
      const dir = new THREE.Vector3().subVectors(t.pos, pos).setY(0).normalize();
      const res = t.hit(damage * 0.6, dir, 0.4, false);
      t.knock?.addScaledVector(dir, 4);
      this.numbers.spawn(t.pos.clone().setY(2.1), Math.round(damage * 0.6), 'crit');
      if (res === 'kill') this.onKill(t);
    }
  }

  onRicochet(point) {
    this.sfx.thunk(this.panAt(point));
    this.particles.spawn(point, { count: 6, color: 0xffe9b0, speed: 3, up: 1, life: 0.25, size: 0.05, gravity: 0 });
  }

  onRefresh() {
    this.numbers.spawn(this.player.pos.clone().setY(2.2), 'REFRESH', 'callout');
    this.particles.spawn(this.player.pos.clone().setY(0.8), { count: 10, color: [1.6, 2.2, 3], speed: 3, up: 1, life: 0.35, size: 0.06, gravity: 0 });
  }

  onArrowStopped(arrow, hitWall) {
    if (hitWall) {
      this.sfx.thunk(this.panAt(arrow.pos));
      this.particles.spawn(arrow.pos, { count: 5, color: 0x8a8070, speed: 2, up: 1, life: 0.35, size: 0.06 });
    } else {
      this.particles.spawn(arrow.pos.clone().setY(0.05), { count: 4, color: 0x5a5048, speed: 1.2, up: 1.5, life: 0.3, size: 0.05 });
      this.sfx.arrowGround(this.panAt(arrow.pos));
    }
  }

  /** A heavy landing: cracked floor, dust ring, a bump of shake if it's close. */
  onSlam(pos, strength = 1) {
    this.decals.spawn(pos, 'crack', 2.2 * strength, 10);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.particles.spawn(pos.clone().setY(0.1), {
        count: 1,
        color: 0x7a6a58,
        speed: 3 * strength,
        up: 0.6,
        life: 0.6,
        size: 0.18,
        gravity: 2,
        drag: 3,
        dir: new THREE.Vector3(Math.cos(a), 0.1, Math.sin(a)),
        spread: 0.15,
      });
    }
    const d = pos.distanceTo(this.player.pos);
    if (d < 8) this.shake.add(0.25 * strength * (1 - d / 8));
  }

  onChilled() {
    buffs.chill = 2;
    this.numbers.spawn(this.player.pos.clone().setY(2.4), 'CHILLED', 'callout');
    this.sfx.freeze(0);
  }

  onShieldBreak(enemy) {
    this.numbers.spawn(enemy.pos.clone().setY(2.6), 'SHIELD SPLIT', 'callout gold');
    this.sfx.sample('thunkWood', { vol: 0.9, rate: 0.6, pan: this.panAt(enemy.pos) });
    this.sfx.sample('clang', { vol: 0.5, rate: 0.8, pan: this.panAt(enemy.pos) });
    this.particles.spawn(enemy.pos.clone().setY(1.1), { count: 18, color: 0x7a5232, speed: 5, up: 2, life: 0.6, size: 0.1, gravity: 9 });
  }

  /** A blast that hurts enemies (and the hero if close). Used by barrels, powder-keg elites and bombers. */
  explosion(pos, radius, enemyDamage, playerDamage) {
    this.sfx.sample('boom', { vol: 0.9, rate: 0.9, jitter: 0.1, pan: this.panAt(pos) });
    this.sfx.sample('slam', { vol: 0.6, rate: 0.7 });
    this.shake.add(0.5);
    this.aberration = Math.min(1, this.aberration + 0.6);
    this.decals.spawn(pos, 'scorch', radius * 1.2, 16);
    this.particles.spawn(pos.clone().setY(0.8), { count: 40, color: [3, 1.3, 0.3], speed: 8, up: 4, life: 0.6, size: 0.16, gravity: 6 });
    this.particles.spawn(pos.clone().setY(1), { count: 14, color: 0x2a2420, speed: 2.5, up: 3, life: 1.4, size: 0.35, gravity: -1, drag: 1 });
    for (const e of this.enemies) {
      if (!e.isHittable()) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d > radius + e.radius) continue;
      const dir = new THREE.Vector3(e.pos.x - pos.x, 0, e.pos.z - pos.z).normalize();
      const dmg = enemyDamage * (1 - 0.5 * (d / radius));
      const res = e.hit(dmg, dir, 1, false);
      e.knock?.addScaledVector(dir, 8);
      this.numbers.spawn(e.pos.clone().setY(2.2), Math.round(dmg), 'crit');
      if (res === 'kill') this.onKill(e);
      else e.applyBurn?.(6, 3);
    }
    const P = this.player;
    if (Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z) < radius) {
      const dir = new THREE.Vector3(P.pos.x - pos.x, 0, P.pos.z - pos.z).normalize();
      const res = P.takeDamage(playerDamage, dir, this);
      if (res === true) this.onPlayerHit({ lungeDir: dir }, playerDamage);
    }
  }

  onDodge() {
    this.tips.done('dodge');
    this.stats.dodges++;
    this.sfx.dodge();
  }

  onPerfectDodge(enemy) {
    const d = config.dodge;
    this.stats.perfectDodges++;
    this.ultimate.gain(config.ultimate.perPerfectDodge);
    this.player.counterT = d.counterWindow;
    this.slowmo = d.slowmoTime;
    this.slowmoScale = d.slowmoScale;
    this.sfx.perfectDodge();
    this.numbers.spawn(this.player.pos.clone().setY(2.2), 'PERFECT DODGE', 'callout gold');
    this.particles.spawn(this.player.pos.clone().setY(0.8), { count: 18, color: [2.4, 2.4, 3], speed: 4, up: 1, life: 0.4, size: 0.07, gravity: 0 });
    this.hud.vignette.classList.add('slowmo');
  }

  onPlayerHit(enemy, damage = config.grunt.damage) {
    if (this.player.dead && !this.deathShown) {
      // Make the death unmissable: slow motion and a banner before the summary.
      this.deathShown = true;
      this.slowmo = 1.5;
      this.slowmoScale = 0.25;
      this.banner('You fell', `Wave ${this.wave}`, 2.2);
      this.input.mouse.down = false;
    }
    this.aberration = Math.min(1, this.aberration + 0.8);
    this.decals.spawn(this.player.pos, 'blood', 0.8);
    this.sfx.hurt();
    this.waveHurt = true;
    this.shake.add(0.6);
    this.hitStop = Math.max(this.hitStop, 0.08);
    this.numbers.spawn(this.player.pos.clone().setY(2), `-${damage}`, 'hurt');
    this.particles.spawn(this.player.pos.clone().setY(1), { count: 14, color: 0xff3b2f, speed: 5, up: 2, life: 0.5, size: 0.1, dir: enemy.lungeDir, spread: 1 });
    this.hud.vignette.classList.remove('flash');
    void this.hud.vignette.offsetWidth; // restart the CSS animation
    this.hud.vignette.classList.add('flash');
  }

  // ---------------------------------------------------------------- loop

  onUltimateReady() {
    this.tips.show('ult');
    this.sfx.ultimateReady();
    this.numbers.spawn(this.player.pos.clone().setY(2.4), 'ARROW VOLLEY READY · Q', 'callout gold');
  }

  onUltimateEnd() {
    this.shake.add(0.2);
  }
}
