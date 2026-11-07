# Draw & Release

A top-down action roguelite for the browser, built with three.js. You're an archer descending through monster-filled arenas: draw your bow, release in the gold flash for perfect shots, roll through attacks, pick a new skill after every wave, and take down a boss every five waves to open the gate to the next arena. Between runs you return to camp to spend soul gems on new heroes and outfits.

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
| Arrow Storm (ultimate) | Q or E | Y or LB |
| Use building (camp) | E | X |
| Pause | P / Esc | Start |
| Settings | O or the ⚙ button | |
| Mute / restart | M / R | |
| Developer tuning panel | `` ` `` | |

## The game

### Combat
- **Charge shot:** damage and arrow speed grow with draw time. Releasing in the short gold window at full draw is a **perfect** shot (2× damage, pierces). With the Overdraw skill, holding past it charges a 3× mega-shot.
- **Dodge roll:** invulnerable for most of the roll. Rolling through an attack as it lands (or past an arrow at close range) is a **perfect dodge**: time slows and your next draw starts at full.
- **Arrow Storm:** a meter filled by perfect shots, hits, kills and perfect dodges. Unleash a rain of ~70 golden arrows on the area under your cursor.
- **Feedback:** hit-stop, camera punch and chromatic aberration on big hits, knockback, flinches, floor decals (blood, scorch, frost, cracks), dissolving spawns and deaths, a slow-motion kill cam on the last kill of a wave.

### Enemies
| Enemy | Where | Behavior |
| --- | --- | --- |
| Grunt | Everywhere | Chases, telegraphs (red glow and wedge), then leaps. A full-draw or perfect hit during the windup staggers it. |
| Skeleton Archer | From wave 3 | Keeps its distance; a cyan aim line tracks you, then locks before it fires. |
| Frost Ghoul | Frozen Crypt | Faster grunt; its hits chill you (−40% speed). |
| Fire Imp | Infernal Forge | Throws fireballs that leave burning ground; bursts into flame when it dies. |
| Elites | From wave 4 | Double HP and an aura: **Swift**, **Shielded** (break it with a full-draw or perfect shot), **Vampiric**, **Volatile** (explodes after death). |
| **Gorvak** (boss) | Every 5th wave | Hammer swing (cone), tracking ground slam with shockwaves to roll through, a charge that stuns him if he hits a wall or pillar, grunt summons and double shockwaves when enraged, a poise bar broken by perfect shots. Appears as the Ogre Warlord, the Frostbound and the Infernal. |

### Progression
- **Skill draft:** after each wave, pick 1 of 3 cards (one reroll per run). Twelve skills stack up to level III, from Heavy Draw and Split Shot to Thunderstrike, Fire/Frost arrows, Second Wind and the legendary Overdraw.
- **Arenas:** each boss opens a portal in the far gate. Walk through to descend: **Sunken Ruins → Frozen Crypt → Infernal Forge**, each with its own architecture, lighting, floor, weather and enemies.
- **Hazards and boons:** explosive barrels (shoot them; they chain and hurt you too), spike traps, healing springs, haste runes, lightning totems you wake with an arrow, ice patches (Crypt) and lava vents (Forge).
- **Loot:** soul gems and health orbs burst out of enemies and home in on you.
- **Save points:** beating a boss saves a checkpoint (wave, arena and skills) and banks your gems. Continue from the camp's Ruin Gate.

### Camp
A walkable hub before and between runs. Walk up to a building and press E:
- **Hall of Heroes:** choose Rowan the Ranger, Sylva the Huntress (faster draw) or Brom Ironbeard (more HP and damage). Unlock with soul gems after milestones.
- **Tailor's Tent:** outfits (Crimson Hunter, Frost Warden, Shadow Stalker, Golden Champion), retextured on the same rig so every animation carries over.
- **Rune Shrine:** records and your save.
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
| `src/enemy.js` | Grunt (the base enemy class: AI, status effects, dissolve, hit reactions) |
| `src/skeleton.js` | Skeleton Archer and enemy arrows |
| `src/variants.js` | Frost Ghoul, Fire Imp and fireballs |
| `src/boss.js` | Gorvak: attacks, telegraphs, shockwaves, phases, poise |
| `src/elites.js` | Elite affixes and auras |
| `src/skills.js` | Skill catalogue, the run's build, derived stats, temporary buffs |
| `src/ultimate.js` | Arrow Storm |
| `src/arrows.js` | Player arrows: flight, swept hits, pierce, ricochet, trails |
| `src/world.js` | Base arena, collision helpers |
| `src/environment.js` | Arena themes and dressing (props, floor, lighting, grass, mist, light shafts) |
| `src/hazards.js` | Hazards and boons |
| `src/camp.js` | Camp hub scene and building menus |
| `src/profile.js` | Saved profile: gems, unlocks, characters, outfits, records, checkpoint |
| `src/models.js` | Loading Meshy models, instancing, animation helper, dissolve shader, outfit textures |
| `src/juice.js`, `src/fx.js` | Decals, portals, particles, damage numbers, screen shake |
| `src/loot.js` | Soul gems and health orbs |
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
