import { SPECIES } from './creatures.js';
import { ITEMS } from './items.js';

// Field journal: species are recorded the first time you get close to one.
const LORE = {
  pudgewing: { icon: '🐦', where: 'Beaches and lowlands', text: 'A round, flightless bird that bolts at the first footstep. Easy meat and hide for a new arrival.' },
  dashbeak: { icon: '🦎', where: 'Forests, in packs', text: 'Knee-high scavengers that swarm anything weaker. Alone they are a nuisance; four at once draw blood.' },
  crestcaller: { icon: '🦕', where: 'Grasslands, in herds', text: 'Its hollow crest carries alarm calls across the plains. The fastest runner on the island once saddled.' },
  trikeros: { icon: '🦏', where: 'Open grassland', text: 'A three-horned grazer that minds its own business until struck. Herds defend each other fiercely.' },
  domehead: { icon: '🐏', where: 'High hills, in pairs', text: 'Settles every argument with a skull as thick as a boulder. Best admired from a distance.' },
  ironhide: { icon: '🐢', where: 'Forests and hills', text: 'Plated from snout to club-tail; blades glance off its back. Tamed, it cracks rock like bread.' },
  talonrunner: { icon: '🦖', where: 'Forests, in packs of three', text: 'Pack hunters with a sickle claw on each foot. They circle before they strike.' },
  spinesail: { icon: '🐊', where: 'Beaches and shallows', text: 'A sail-backed hunter that stalks the tide line and wades in after prey. Do not swim near its shore.' },
  thunderneck: { icon: '🦕', where: 'Lowlands near the lake', text: 'The island’s largest grazer. Its footsteps carry for a kilometre; its tail can flatten a camp.' },
  gorgonax: { icon: '🦖', where: 'Northern highlands', text: 'The apex of the island’s food chain. It hunts anything that moves, including the other hunters.' },
  galewing: { icon: '🪽', where: 'Skies everywhere, perching to rest', text: 'A skittish pterosaur that rides the sea winds. Bring it down with tranquilizers to tame a flying mount.' },
  thunderwing: { icon: '🦅', where: 'Northern peaks', text: 'A storm-dark pterosaur that dives from the clouds. Few survivors see it coming.' },
  glimmerfin: { icon: '🐟', where: 'Shallow water, in schools', text: 'Silver-sided fish that flash and scatter. A spear catches supper.' },
  cinderback: { icon: '🌋', where: 'Ashfang Volcano and the Ember Depths', text: 'Basalt-plated and veined with living fire. It wades through heat that would cook anything else, and a saddled one carries you across lava.' },
  duskraptor: { icon: '🦇', where: 'Caves, in packs', text: 'Blind pack hunters that glow faintly blue in the dark. They hear you long before you see them.' },
  bogmaw: { icon: '🐊', where: 'Murkmire Swamp pools', text: 'Lies motionless in the murk with only its eyes above water, then lunges. Most victims never see it.' },
  reedhorn: { icon: '🦆', where: 'Murkmire Swamp, in herds', text: 'A duck-billed grazer that wades through the marsh tearing up reeds. Herds trumpet and stand together when threatened.' },
  frosthorn: { icon: '🦬', where: 'Frostpeak, in herds', text: 'A shaggy, three-horned grazer built for the cold. Its thick pelt makes the warmest armor on the island.' },
  rimeclaw: { icon: '🦖', where: 'Frostpeak, in packs', text: 'White-scaled raptors that vanish against the snow and hunt the Frosthorn herds.' },
  plateback: { icon: '🦕', where: 'Forests and grasslands, in pairs', text: 'Two rows of tall back plates and a tail tipped with four spikes. It turns its back to predators and swings.' },
  hornjaw: { icon: '🐂', where: 'Lowlands', text: 'A short-armed, horn-browed sprinter that charges its prey head-on at terrifying speed.' },
  scythehand: { icon: '🦥', where: 'Deep forest', text: 'A towering plant-eater with claws as long as swords. Saddled, it shreds trees for timber in seconds.' },
  skyhorn: { icon: '🦅', where: 'High cliffs and peaks', text: 'The largest pterosaur on the island, crowned with a blazing crest. The fastest thing in the sky.' },
  dashstrider: { icon: '🐓', where: 'Open grassland, in flocks', text: 'Long legs, a toothless beak and nerves of glass. Nothing on the island outruns a saddled one.' },
  frillspitter: { icon: '🦎', where: 'Forests, in pairs', text: 'When it flares its yellow frill, step aside: the venom it spits clings and slows its prey.' },
  nightstalker: { icon: '🌑', where: 'Lowland forests', text: 'Sleeps curled in the undergrowth by day. After dusk its eyes glow green, and it hunts anything it can find.' },
  longfin: { icon: '🦕', where: 'Coastal waters', text: 'A gentle, long-necked swimmer that grazes on fish. Far calmer to tame than a Deepjaw, and a fine sea mount.' },
  quillback: { icon: '🦔', where: 'Forests and grasslands, in pairs', text: 'Bristling with long quills. Strike it and you will feel every one of them.' },
  eggthief: { icon: '🥚', where: 'Lowlands, in pairs', text: 'A quick-fingered little bandit. It darts in, steals whatever it can carry and sprints off. Catch it to get your things back.' },
  bloodclaw: { icon: '🩸', where: 'Forests and hills, in pairs', text: 'A heavy raptor with hooked claws. Its slashes leave bleeding wounds; carry Healing Salve.' },
  skyreach: { icon: '🦒', where: 'Lowland plains', text: 'The tallest creature on the island, browsing treetops with its head held high. A saddle on its back is a watchtower that walks.' },
  glowtail: { icon: '✨', where: 'Forests, in small groups', text: 'A shy little lizard whose tail glows like a lantern. A tamed one lights your way through caves and dark nights.' },
  divebeak: { icon: '🐦', where: 'Beaches and coasts', text: 'A fishing seabird that folds its wings and plunges into the surf. Tamed, it brings you fish.' },
  shieldhorn: { icon: '🛡️', where: 'Grasslands, in herds', text: 'Its nose carries a broad bony shield. Provoke it and it lowers its head and charges hard enough to send you flying.' },
  shellback: { icon: '🐢', where: 'Beaches', text: 'A giant sea turtle that hauls out on the sand. Badly hurt, it pulls into a shell nothing can crack.' },
  leafshade: { icon: '🍃', where: 'Dense forest', text: 'Patterned like dappled leaves, it is invisible until you are almost on top of it. Its first strike is its deadliest.' },
  voltfin: { icon: '⚡', where: 'Coastal waters, in pairs', text: 'A glowing eel-like hunter. One touch delivers a shock that leaves a swimmer stunned.' },
  mossback: { icon: '🌿', where: 'Lowland meadows', text: 'A slow giant overgrown with glowing moss. Creatures near it mend their wounds; a tamed one tends to you and your tames.' },
  sandmaw: { icon: '🏜️', where: 'Beaches and dunes', text: 'It swims through sand like water. The ground shudders, then it erupts right beside you.' },
  howler: { icon: '🐺', where: 'Hills and grasslands, in packs', text: 'When one spots prey it howls, and the whole pack answers — faster and fiercer than before.' },
  deepjaw: { icon: '🐋', where: 'Deep water offshore', text: 'A sea serpent with a crocodile’s smile. Swimmers in deep water are on its menu.' },
};

export class Bestiary {
  constructor(game) {
    this.game = game;
    this.seen = new Set();
    this.open = false;
    this.el = document.getElementById('bestiary');
    this.grid = document.getElementById('bestiary-grid');
    this.scanT = 0;
    document.getElementById('bestiary-close').addEventListener('click', () => this.toggle(false));
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('show', this.open);
    const g = this.game;
    g.input.keys = {};
    if (this.open) { if (g.noLock) g.locked = false; else document.exitPointerLock?.(); this.render(); }
    else g.lock();
  }

  discover(sp) {
    if (this.seen.has(sp) || !LORE[sp]) return;
    this.seen.add(sp);
    const g = this.game;
    g.ui.notify(`New species: ${SPECIES[sp].name} — added to your Bestiary (J)`, 'quest');
    g.player.addXP(8, g.xpHooks);
    g.saves.markDirty();
  }

  update(dt) {
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.5;
    const p = this.game.player.pos;
    for (const c of this.game.creatures.list) {
      if (!this.seen.has(c.species) && c.pos.distanceTo(p) < (c.radius > 2 ? 45 : 28)) this.discover(c.species);
    }
  }

  render() {
    const g = this.game;
    const kills = g.stats.speciesKills || {}, tames = g.stats.speciesTames || {};
    document.getElementById('bestiary-count').textContent = `${this.seen.size} / ${Object.keys(LORE).length} species recorded`;
    this.grid.innerHTML = Object.keys(LORE).map((sp) => {
      const d = SPECIES[sp], L = LORE[sp];
      if (!this.seen.has(sp)) return `<div class="beast unknown"><div class="b-ic">❔</div><div class="b-name">Unknown species</div><div class="b-text">Get closer to something new to record it.</div></div>`;
      const traits = [d.diet === 'carn' ? 'Carnivore' : 'Herbivore', { aggressive: 'Hostile', neutral: 'Neutral', skittish: 'Skittish', passive: 'Passive' }[d.temper] || d.temper];
      if (d.flyer) traits.push('Flyer'); if (d.swimmer) traits.push('Swimmer'); if (d.rideable) traits.push('Rideable');
      const tame = d.tameFood ? `Tame with ${ITEMS[d.tameFood].name}` : 'Cannot be tamed';
      return `<div class="beast">
        <div class="b-ic">${L.icon}</div>
        <div class="b-name">${d.name}</div>
        <div class="b-tags">${traits.map((t) => `<span>${t}</span>`).join('')}</div>
        <div class="b-text">${L.text}</div>
        <dl><dt>Habitat</dt><dd>${L.where}</dd><dt>Taming</dt><dd>${tame}</dd><dt>Base stats</dt><dd>${d.hp} HP · ${d.dmg} dmg</dd><dt>Your record</dt><dd>${kills[sp] || 0} killed · ${tames[sp] || 0} tamed</dd></dl>
      </div>`;
    }).join('');
  }
}
