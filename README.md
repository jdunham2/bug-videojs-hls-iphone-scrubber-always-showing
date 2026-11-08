# Draw & Release

A top-down action roguelite for the browser, built with three.js. You're an archer fighting through arenas held by bandits, raiders and orc brutes: draw your bow, release in the gold flash for perfect shots, roll through attacks, pick a new skill after every wave, and take down a boss every five waves to open the gate to the next arena. Between runs you return to camp to spend gems on new heroes and outfits.

All characters, enemies and props are generated with the [Meshy](https://www.meshy.ai) API (models, textures, rigs and animations); sounds are CC0 samples from [Kenney](https://kenney.nl); the music is synthesized live.

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). `npm run build` produces a static site in `dist/`; `.github/workflows/pages.yml` deploys it to GitHub Pages (enable it once under **Settings → Pages → Source: GitHub Actions**).

## Controls

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Move | WASD / arrows | Left stick |
| Aim | Mouse | Right stick |
| Draw / fire | Hold / release left mouse | Hold / release RT (or RB) |
| Dodge roll | Space, Shift or right mouse | A or B |
| Arrow Volley (ultimate) | Q or E | Y or LB |
| Use building (camp) | E | X |
| Pause | P / Esc | Start |
| Settings | O or the ⚙ button | |
| Mute / restart | M / R | |
| Developer tuning panel | `` ` `` | |

## The game

### Combat
- **Charge shot:** damage and arrow speed grow with draw time. Releasing in the short gold window at full draw is a **perfect** shot (2× damage, pierces). With the Overdraw skill, holding past it charges a 3× mega-shot.
- **Dodge roll:** invulnerable for most of the roll. Rolling through an attack as it lands (or past an arrow at close range) is a **perfect dodge**: time slows and your next draw starts at full.
- **Arrow Volley:** a meter filled by perfect shots, hits, kills and perfect dodges. Loose a volley high into the air that comes down across the area under your cursor.
- **Feedback:** hit-stop, camera punch and chromatic aberration on big hits, knockback, flinches, floor decals (blood, scorch, frost, cracks), dissolving spawns and deaths, a slow-motion kill cam on the last kill of a wave.

### Enemies
| Enemy | Where | Behavior |
| --- | --- | --- |
| Grunt | Everywhere | Chases, telegraphs (red glow and wedge), then leaps. A full-draw or perfect hit during the windup staggers it. |
| Bandit Archer | From wave 3 | Keeps its distance; an aim line tracks you, then locks before it fires. |
| Frost Raider | Frostpeak Keep | Fast northern raider; his blows leave you numb with cold (−40% speed). |
| Fire-pot Bomber | Molten Forge | Lobs clay fire pots that leave burning ground; his bandolier goes up when he falls. |
| Elites | From wave 4 | Double HP and a ground marker: **Swift**, **Armored** (a round shield; split it with a full-draw or perfect shot), **Hardy** (patches itself up), **Powder Keg** (blows up after it falls). |
| **Gorvak** (boss) | Every 5th wave | Hammer swing (cone), tracking ground slam with shockwaves to roll through, a charge that stuns him if he hits a wall or pillar, a war horn that calls in reinforcements and double shockwaves when enraged, a poise bar broken by perfect shots. Appears as the Ogre Warlord, Gorvak of the North and Gorvak the Forgemaster. |

### Progression
- **Skill draft:** after each wave, pick 1 of 3 cards (one reroll per run). Twelve skills stack up to level III, from Heavy Draw and Split Shot to Blasting, Fire and Pinning arrows, Second Wind and the legendary Overdraw.
- **Hero talents:** one point per hero level, spent at the lectern in the Hall of Heroes: Might, Vigor, Nimble Fingers, Fleet-footed, Thick Hide, Falconer and Fortune. Points can be taken back for free.
- **The camp grows:** trophies and new structures appear as you progress (Gorvak's hammer on a plinth, a well, relics from each cleared mission, war banners, a ballista, a treasure hoard, a statue at level 10), announced when you come back to camp.
- **Falcon companion:** at hero level 4 a hunting falcon joins you. It circles overhead and every few seconds dives at the nearest enemy (it practises on the training dummy in camp).
- **Wave events and Champions:** from wave 4 some waves are a Horde, a War Party of elites or a Golden Wave (double gems), each with its own reward; from wave 6 a named Champion (an oversized elite with two affixes and a name over its head) can lead the wave and always drops Rare-or-better gear.
- **Loot thief:** now and then a bandit with a glowing sack of treasure drops in and runs for it. He never fights back; bring him down within about 14 seconds (an edge-of-screen pointer shows where he is and how long is left) and the sack bursts into gems and a piece of gear.
- **Boss signature moves:** each Gorvak form has its own telegraphed ranged attack: boulders, falling icicles, or pots of burning oil that leave fire on the ground.
- **Hero level and bounties:** every run earns XP (kills, waves, bosses, perfect shots, missions); each level pays gems and every third level a piece of gear, with an animated XP bar on the results screen. The Trophy Board holds three bounties (defeat elites, land perfect shots, find chests...) that carry across runs and pay gems and XP when claimed.
- **Walkable interiors:** the Hall, Tailor, Armory, Merchant and Blacksmith are rooms you walk into: heroes on pedestals, outfits on stands, goods on the counter with rarity beams, the smith at the anvil. Walk up to a station and press E.
- **Stepping inside:** going into a camp building pushes the camera up to its door and fades up a painted, animated interior behind the screen (torch-lit hall, tailor's tent, armory racks, merchant shelves, the forge with sparks, the trophy wall, and a map table at the gate).
- **Far Reaches enemies and bosses:** five new Meshy enemies with their own fighting styles: the Jungle Stalker (pounces from far away), the Shieldbearer (blocks arrows from the front: flank him or use a full draw), the Deckhand (fires a fan of three bolts), the Clockwork Automaton (armored against light shots, cracks the ground) and the Highland Lancer (long straight charge, with a Meshy spear). Each Far Reaches boss has its own rigged Meshy model: Ukko the Temple Brute, Grubnak the Sporeback (spore clouds), Vulgra the Dune-Breaker, Ironjaw the Machinist and Old Brannoc; in phase two they call in their region's warband.
- **The Far Reaches (dungeons 10-15):** clearing Emberfall Caldera opens a second region with its own painted map (tabs on the world map): The Verdant Temple, Glowcap Grove, Sandsea Oasis, Shipwreck Cove, Clockwork Foundry and The Misty Highlands, built from 18 new Meshy props (vine pillars, giant stone heads, a wrecked galleon, cannons, giant mushrooms, palms, gear pillars, steam engines, bamboo, watchtowers...) and a new rigged Meshy boss, the ogre pirate captain (Captain Blackhook and Captain Saltjaw), who fires cannonballs.
- **Nine dungeons:** after the first three missions come The Whispering Marsh (fog and fireflies), Autumn Hollow (falling leaves), Deepdelve Mines (lanterns and powder kegs), Stormwatch Harbor (rain on the docks), Sunscorch Canyon (blinding sun and hot vents) and Emberfall Caldera. Each has its own look, weather, pillar layout, enemy mix, hazards, music, a named boss with a signature attack (boulders, falling rocks, burning oil...), a bonus-star challenge and a spot on the world map. The Endless Siege now travels through all nine.
- **Setting out:** starting a run from the gate marches the hero into the glowing archway with the camera close behind, then a gold Setting Out card names the destination.
- **World map and missions:** the camp gate opens a painted parchment map of the Borderlands with drifting clouds, marching roads, fog over places you haven't reached and a hero marker that walks to the mission you pick. Missions (The Sunken Ruins, Frostpeak Keep, The Molten Forge) are short runs ending in a boss, each with a hidden treasure chest and a bonus challenge for up to three stars; clearing one opens the next, and a first clear pays a Rare-or-better piece of gear. The Endless Siege is the open-ended mode with save points.
- **Daily Trial:** one run a day, the same for everyone: today's date picks the arena and two twists (Glass Cannon, Swarm, Elite Hunt, Frenzy, Volley Line, Iron Will). Scored on kills, perfect shots, perfect dodges and a fast clear; the first clear each day pays gear. On the published page, everyone's best of the day goes on a shared leaderboard.
- **Arenas:** in the Endless Siege, beating a boss opens the far gate. Walk through to march on: **Sunken Ruins → Frostpeak Keep → Molten Forge**, each with its own architecture, lighting, floor, weather and enemies.
- **Hazards and boons:** powder barrels (shoot them; they chain and hurt you too), spike traps, fresh-water springs, war drums (shoot one for a burst of speed), ballistas you load with an arrow, ice patches (Keep) and lava vents (Forge).
- **Gear:** bows and armor drop from enemies (more from elites, two pieces from every boss) as beams of light in their rarity colour: Common, Rare or Unique, with a power level and perks (Keen Eye, Broadheads, Barbed Heads, Momentum, Padded, Tumbler, Scavenger and more). Bow types play differently: Longbow, Shortbow, War Bow, Hunting Bow, Horse Bow. Equip on pickup with E, or compare, equip and salvage at the **Armory** in camp.
- **Gadgets:** two slots on cooldowns (keys 1 and 2, gamepad LT and LB): Bear Trap, Smoke Bomb, Healing Tonic, Throwing Net, Powder Keg and War Horn. They drop as gear too, with perks for cooldown, strength and duration.
- **Difficulty tiers:** Adventurer, Veteran and Legend, picked at the camp gate. Each unlocks by beating a boss on the tier before; harder tiers mean tougher, harder-hitting enemies, stronger gear, more Rares and Uniques, and more gems.
- **Presentation:** each arena and the camp has its own adaptive music (key, chords and tempo); Unique drops get a beat of slow motion, a golden flash and a fanfare; fireflies drift around the camp.
- **Loot:** gems and health orbs burst out of enemies and home in on you.
- **Save points:** beating a boss saves a checkpoint (wave, arena and skills) and banks your gems. Continue from the camp's Ruin Gate.

### Camp
A walkable hub before and between runs. Walk up to a building and press E:
- **Hall of Heroes:** choose Rowan the Ranger, Sylva the Huntress (faster draw) or Brom Ironbeard (more HP and damage). Unlock with gems after milestones.
- **Tailor's Tent:** outfits (Crimson Hunter, Frost Warden, Shadow Stalker, Golden Champion), retextured on the same rig so every animation carries over.
- **Trophy Board:** records and your save.
- **Merchant:** three pieces of gear for sale (new stock after every run), a paid restock, and mystery bundles by slot.
- **Blacksmith:** temper gear (+1 power) and hone its weakest perk (+1 tier) for gems.
- **Ruin Gate:** start a new run or continue from the last save.

### Audio
Recorded CC0 samples (impacts, whooshes, UI, an announcer for combos, multi-kills and flawless waves) layered with synthesis and stereo-panned by screen position, plus an adaptive soundtrack: an ambient drone between waves, drums and bass that build with the number of enemies, brass for bosses.

## Code map

| File | What it does |
| --- | --- |
| `src/main.js` | Boot: settings, profile, models, game |
| `src/game.js` | Main loop, states (title, camp, playing, draft, game over), waves, combat events, camera, HUD |
| `src/config.js` | Tunable numbers (also editable live in the tuning panel) |
| `src/player.js` | Hero movement, bow draw/release, dodge, animation state |
| `src/enemy.js` | Grunt (the base enemy class: AI, status effects, leap-in, hit reactions) |
| `src/archer.js` | Bandit Archer and enemy arrows |
| `src/variants.js` | Frost Raider, Fire-pot Bomber and fire pots |
| `src/boss.js` | Gorvak: attacks, telegraphs, shockwaves, phases, poise |
| `src/elites.js` | Elite affixes and auras |
| `src/skills.js` | Skill catalogue, the run's build, derived stats, temporary buffs |
| `src/ultimate.js` | Arrow Volley |
| `src/bow.js` | The recurve bow, built from curves (player and archers) |
| `src/arrows.js` | Player arrows: flight, swept hits, pierce, ricochet, trails |
| `src/world.js` | Base arena, collision helpers |
| `src/environment.js` | Arena themes and dressing (props, floor, lighting, grass, mist, light shafts) |
| `src/hazards.js` | Hazards and boons |
| `src/camp.js` | Camp hub scene and building menus |
| `src/profile.js` | Saved profile: gems, unlocks, characters, outfits, records, checkpoint |
| `src/models.js` | Loading Meshy models, instancing, animation helper, outfit textures |
| `src/juice.js`, `src/fx.js` | Decals, gateway light, particles, damage numbers, screen shake |
| `src/loot.js` | Gems and health orbs |
| `src/gear.js` | Gear data: bow and armor types, rarities, perks, stash, stats |
| `src/missions.js`, `src/game-mission.js` | Missions, stars, the secret chest and the Mission Complete screen |
| `src/daily.js` | Daily Trial: seeded twists, scoring, leaderboard |
| `src/shops.js` | Merchant stock and prices, blacksmith tempering and honing |
| `src/difficulty.js` | Difficulty tiers and unlocks |
| `src/gadgets.js` | Gadget effects and the gadget HUD |
| `src/gear-drops.js`, `src/game-gear.js` | Gear drops in the arena, pickup card, equip on pickup |
| `src/audio.js`, `src/music.js` | Sound effects and the adaptive soundtrack |
| `src/input.js`, `src/settings.js` | Keyboard/mouse/gamepad input; settings menu |

## Asset pipeline (Meshy)

`tools/meshy/generate.mjs` turns the entries in `tools/meshy/assets.json` into game-ready files:

```bash
npm run meshy -- --dry-run          # list assets and credit cost
npm run meshy -- --balance          # Meshy credit balance
npm run meshy -- hero grunt         # generate (or resume) specific assets
```

- **Characters:** text → low-poly mesh (A-pose) → texture → auto-rig → library animations merged into one GLB.
- **Props:** mesh and texture only.
- **Outfits:** a retexture on the base character's original UVs (keeps its rig and animations).
- Output is optimized with gltf-transform (meshopt geometry, WebP textures) into `public/models/` with a `manifest.json`. Task IDs are saved to `tools/meshy/state.json` so runs resume instead of paying twice.
- **API key:** `MESHY_API_KEY`, or a gitignored `tools/meshy/.env` containing `MESHY_API_KEY=...`. Never commit it.

## Preview builds for sandboxed hosts

`python3 tools/build-preview.py OUT.html` builds a page for hosts that block `data:`/`blob:` requests (like the claude.ai artifact viewer): the code and sounds are embedded, and each model goes in its own JSON file under `pmodels/` next to the page.

## Credits

- 3D models, textures, rigs and animations: generated with Meshy.
- Sound effects and announcer: [Kenney](https://kenney.nl) (CC0), see `public/audio/LICENSE-kenney.txt`.
- Built with [three.js](https://threejs.org), [Vite](https://vite.dev), [gltf-transform](https://gltf-transform.dev) and [lil-gui](https://lil-gui.georgealt.com).
