// Gear in a run: what drops from whom, picking it up, and the pickup card that
// lets you equip it on the spot (E / gamepad X).

import { rollItem, rollRarity, addToStash, equip, equipped, equippedGadget, statLines, perkLines, RARITIES, slotLabel, baseOf, score } from './gear.js';

/** Item power for a drop: grows with the wave and the arena. */
function dropPower(game, bonus = 0) {
  const tier = game.difficulty?.lootPower || 0;
  return Math.max(1, Math.round((game.enemyLevel?.() || game.wave || 1) * 0.9 + (game.arena || 0) * 2 + tier + bonus + (Math.random() * 2 - 1)));
}

export class GearMethods {
  /** Maybe drop gear from a defeated enemy (bosses always drop two pieces). */
  dropGear(enemy) {
    const roll = (source, bonus) => {
      const r = Math.random();
      const slot = r < 0.42 ? 'bow' : r < 0.75 ? 'armor' : 'gadget';
      return rollItem(slot, dropPower(this, bonus), rollRarity(source, this.difficulty?.rarityBoost || 0));
    };
    if (enemy.isBoss) {
      const slots = ['bow', 'armor', 'gadget'].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const slot of slots) this.gearDrops.spawn(enemy.pos, rollItem(slot, dropPower(this, 2), rollRarity('boss', this.difficulty?.rarityBoost || 0)));
      return;
    }
    const chance = enemy.elite ? 0.35 : enemy.kind === 'archer' || enemy.kind === 'bomber' ? 0.05 : 0.035;
    if (Math.random() < chance) this.gearDrops.spawn(enemy.pos, roll(enemy.elite ? 'elite' : 'enemy', enemy.elite ? 1 : 0));
  }

  /** A Unique dropped: a beat of slow motion, a golden flash and a fanfare. */
  onUniqueDrop(pos) {
    this.banner('UNIQUE!', 'Something special dropped', 1.6);
    this.slowmo = Math.max(this.slowmo, 0.6);
    this.slowmoScale = 0.3;
    this.zoomKick = Math.min(0.12, this.zoomKick + 0.06);
    this.sfx.sample('bell', { vol: 0.7, rate: 1.1, jitter: 0 });
    this.sfx.sample('jingleClear', { vol: 0.45, rate: 1.2, jitter: 0, delay: 0.15 });
    const f = document.getElementById('flash');
    if (f) {
      f.classList.remove('go');
      void f.offsetWidth;
      f.classList.add('go');
    }
    this.particles.spawn(pos.clone().setY(1.5), { count: 60, color: [3, 2.2, 0.7], speed: 7, up: 6, life: 1.1, size: 0.09, gravity: 4 });
  }

  onGearPickup(item) {
    addToStash(item);
    (this.runGear ||= []).push(item);
    const unique = item.rarity === 'unique';
    this.sfx.sample(unique ? 'jingleClear' : 'uiConfirm', { vol: unique ? 0.6 : 0.45, jitter: 0 });
    this.particles.spawn(this.player.pos.clone().setY(1.2), { count: unique ? 30 : 14, color: [2, 1.8, 1.2], speed: 3, up: 3, life: 0.6, size: 0.07 });
    this.showGearCard(item);
  }

  /** The pickup card: the new item against what you have equipped. */
  showGearCard(item) {
    const el = document.getElementById('gear-card');
    const cur = item.slot === 'gadget' ? equippedGadget(1) : equipped(item.slot);
    const R = RARITIES[item.rarity];
    const better = cur && score(item) > score(cur);
    el.style.setProperty('--rar', R.color);
    el.innerHTML = `
      <div class="gc-top"><span class="gc-rar">${R.name} ${slotLabel(item.slot)}</span><span class="gc-pow">Power ${item.power}</span></div>
      <div class="gc-name"></div>
      <div class="gc-base">${baseOf(item).blurb}</div>
      <div class="gc-stats">${statLines(item, cur)}</div>
      <div class="gc-perks">${perkLines(item) || '<div class="pk none">No perks</div>'}</div>
      <div class="gc-foot"><kbd>E</kbd> ${item.slot === 'gadget' ? 'Equip in slot 1' : 'Equip now'}${better ? ' <b class="gc-better">Upgrade</b>' : ''}<span>Saved to your stash</span></div>`;
    el.querySelector('.gc-name').textContent = item.name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.gearCard = { item, t: 6 };
  }

  updateGearCard(dt) {
    const c = this.gearCard;
    if (!c) return;
    c.t -= dt;
    if (this.input.wasPressed('KeyE') && this.state === 'playing') {
      this.input.pressed.delete('KeyE'); // E equips here rather than firing the volley
      equip(c.item);
      this.numbers.spawn(this.player.pos.clone().setY(2.4), `${c.item.name} equipped`, 'callout gold');
      this.sfx.sample('clang', { vol: 0.4, rate: 1.4, jitter: 0 });
      // Armor can change max HP: keep the same fraction of health.
      this.player.hp = Math.min(this.player.hp, this.maxHp());
      return this.hideGearCard();
    }
    if (c.t <= 0) this.hideGearCard();
  }

  hideGearCard() {
    this.gearCard = null;
    document.getElementById('gear-card')?.classList.remove('show');
  }

  /** One line for the game-over screen. */
  gearSummary() {
    const found = this.runGear || [];
    if (!found.length) return '';
    const best = [...found].sort((a, b) => score(b) - score(a))[0];
    return `Gear found: ${found.length} · best: <b style="color:${RARITIES[best.rarity].color}">${best.name}</b> (Power ${best.power}). Visit the Armory in camp.`;
  }
}
