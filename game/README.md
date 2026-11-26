# Emberfall — vertical slice

A co-op online 3D action RPG that runs in the browser. You and your friends delve into procedurally generated dungeons, collect gear, spend gold in the Dark World, and defend the city of Emberhold at night.

Built with **Three.js** (rendering, post-processing) and a small **Node.js + WebSocket** server that runs the co-op simulation. There are no external art or audio files: every model, texture, particle effect and sound is generated in code.

## Run it

```bash
cd game
npm install
npm start
```

Open http://localhost:3000. Pick a name and banner colour, then click **Enter Emberhold**.

### Play online with a friend
1. Start the server and click **Copy invite link** (top right). The link includes your party code.
2. Your friend opens the link, or types the 4-letter party code in the lobby.
3. Your friend has to be able to reach your server, so do one of these:
   - On the same Wi-Fi: share `http://<your-LAN-IP>:3000`.
   - Over the internet: deploy `game/` to any Node host (Render, Railway, Fly.io, a VPS). It uses `PORT` from the environment and serves both the game and the WebSocket on one port.
   - Or use a quick tunnel such as `cloudflared tunnel --url http://localhost:3000`.

Up to 4 players per party.

## What's in the game

| Pillar | What you can do |
|---|---|
| **3 classes** | Pick a class in the lobby (with a live 3D preview). **Warden** (sword and shield tank, Rage): Shield Bash, War Cry taunt, hold-to-Block with perfect blocks, Earthshatter. **Emberblade** (dual-blade assassin, Focus): Blink Strike, Fire Whirl, Blade Flurry, Execution. **Hexcaller** (staff caster, Mana): ranged bolts, Fire Bolt, Chain Lightning, Ember Spirit summon, Meteor. Each class has its own resource bar and skills on keys 1–4. |
| **Talent trees** | 12 nodes per class in 4 tiers, with 1 point per level. Higher tiers unlock as you invest, and capstones change how skills play (Aegis Wave, Ember Dance, Twin Spirits…). The Trainer in town resets your talents for gold. |
| **Combat feel** | Server-side knockback and stagger (poise per enemy). A dodge-roll with i-frames; rolling through a hit at the last moment triggers a **Perfect Dodge** (slow motion and a resource refund). Lock-on (V / middle mouse). A style meter ranked D→S that boosts your damage and gold. Hit-stop, screen shake, crits. |
| **Elites and bosses** | Elite affixes: **Molten** (burn, fire pool on death), **Frozen** (slows you), **Vampiric** (heals on hit), **Shielded** (periodic damage shield). Each has a glowing aura and a name tag, plus there's one champion pack per dungeon. The **Bone Tyrant** has 3 phases: slams, then fire geysers, then enrage. The **Ash Matriarch** spider queen (on even depths) spins webs, spits venom, leaps at you and spawns spiderling broods. Both get letterboxed boss-intro cameras. |
| **Dungeon variety** | Biomes rotate by depth: **Bone Crypts**, **Molten Forge** (lava pools that burn), **Frozen Catacombs** (slippery ice). Every dungeon has a gated boss room with a **lever puzzle** (pull them in the order of the runes on the gate; a wrong pull resets the levers and spawns skeletons), spike traps, buff **shrines** shared by the party, and a **treasure goblin** that runs away and escapes through a portal if you're too slow. |
| **Defend the City 2.0** | Enemies follow **flow-field pathfinding** and route around your structures. If you wall them in, they smash through. **Stone walls** snap to a grid and link up visually. Every structure has **3 upgrade tiers**, each with a new look, and can be **repaired** (in build mode, aim at a structure and press U or R). The **Siege Ogre** with a battering ram arrives on wave 5 and goes after your defenses. Lane warnings show on the HUD and as red wedges on the minimap. |
| **Saves and friends** | Profiles live **on the server** (`data/profiles.json`, keyed by a browser token), so gold, gear, levels and talents can't be edited in devtools. Each class is a separate character, and gold plus a 48-slot **stash** are shared across them. **Ready-check** before the party enters a dungeon. **Trading** with a nearby party member (press E): both sides lock in items and gold, then accept. **Emote wheel** (hold T). |
| **Presentation** | Cinematic intro flyover with title cards. Boss intro cameras. **Procedural adaptive music** (town, dungeon, night siege, Dark World, boss) with crossfades. A **settings menu** (graphics quality Low→Ultra, master/music/SFX volume, mouse sensitivity, invert Y, full **key rebinding**, intro toggle). **Gamepad support** (standard mapping). |
| **Still here** | The explorable valley with chests, gear rarities and affixes, the Dark World merchant (now with server-side shop stock), day/night lighting, and synthesized audio. |

### Endgame, world and story (milestone 3)
| Feature | Details |
|---|---|
| **Legendary powers** | 18 powers: 4 per class that change a skill (Forked Storm, Ember Vortex, Mirror Shield…), plus 6 generic ones (Thunderlord, Phoenix Heart, Combustion…). |
| **Item sets** | 9 class sets with 2-piece and 4-piece bonuses (e.g. +40% skill damage, skills cost 35% less, Ember Spirits never expire). |
| **Blacksmith** | Salvage items into Ember Shards and Ember Cores, reroll a single affix, and raise an item's level. All of it is server-side. |
| **Ember Rifts** | Timed keystone dungeons from the Rift Obelisk, with 2 random modifiers (Swift, Frenzied, Volatile, Empowered, Darkness). Kills fill a progress bar; at 100% the Guardian spawns. Clearing in under 5 minutes raises your keystone (+2 if under 3 minutes) and enters you on the seasonal **Hall of Embers** leaderboard. |
| **Paragon** | Level cap 30. XP beyond the cap earns Paragon points to spend on Might, Vitality, Bulwark, Precision, Haste or Fortune. |
| **New enemies** | Shield-bearers (block from the front, so you have to flank), Ash Burrowers (move underground and erupt under you), Cinder Menders (heal their allies), Blast Imps (suicide bombers that also target your structures). |
| **New bosses** | **Storm Drake**: breath strafes and storm strikes; the dungeon boss on depths 3, 6, 9… and the Stormspire world boss. **Hollow King**: Dark World throne boss who moves the fight to a new arena each phase. **Bog Colossus**: the Act I boss. |
| **Defense** | Night mutators (Blood Moon, Choking Fog, Siege Night) and a **War Table** research tree (towers, walls, braziers, frost totems, Ember Heart health). |
| **World and story** | **Ashen Marsh** and **Stormspire Peaks** open regions with world events (Meteor Crash, Rift Breach). A six-step Act I questline with Captain Bryn (typed dialogue, quest tracker, J for the quest log) unlocks the Peaks. Waypoints connect the regions; summon an **Ember Steed** mount with M. |
| **Launch readiness** | Server-side damage budgets (per hit and per second, derived from your real stats; rejected hits are logged). Per-connection rate limits and a 32 KB payload cap. A public party browser. `/healthz`. A SQLite store (`EMBERFALL_SQLITE=1`). Graceful shutdown. A Dockerfile, plus a GitHub Actions CI workflow that runs syntax checks, `npm test` (9 server-simulation tests), a load test and the static build. |
| **Client** | F3 performance overlay, dynamic resolution, touch controls (auto-enabled on phones and tablets), colour-blind-safe rarity palette, interface scale, and an account recovery code (Settings → Graphics) to carry your hero to another device. |

### Act II, depth, feel, living world, social and scale (milestone 4)
| Feature | Details |
|---|---|
| **Act II: The Storm Crown** | Six Stormspire quests with **Scout Ilsa**, a companion simulated on the server who follows you and uses **Piercing Volley** and **Mending Wind** (heals the party). When she goes down, stand next to her to revive her. Recover three **Storm Relics**, slay the Drake, then climb to the summit arena for the **Storm Herald**, a 4-phase act boss. In phase 2 it binds the Storm Drake and is immune until the Drake dies. In phase 3 it takes over the Drake's breath strafes and radial bolt novas. In phase 4 a ring of storm closes in. There are two story cutscenes plus an outro, made from camera shots and captioned dialogue. Toggle Ilsa from the quest log (J). |
| **Stormcaller Ranger** | Fourth class: a bow and the resource **Wind**. Skills: Volley, Snare Trap, Storm Hawk, Arrow Rain. It has its own talents, 4 legendaries and 3 sets. |
| **Gems, sockets and wardrobe** | 3 gem types × 5 tiers drop from elites and bosses. Socket, unsocket and combine them at the Blacksmith (all server-side). The **Wardrobe** has dyes, armour appearance override, a hide-helmet option and 3 saved looks. |
| **Animation and feel** | Keyframed clips blended by a small state machine with a synced locomotion phase, crossfades and an additive hit-reaction layer. Clips: idle, run, sprint, 3 attack chains, slam, roll, death, block, cast, mount and 7 emotes. Out-of-combat **sprint**. Footsteps for 7 surfaces with dust, splash and snow puffs. Ground **decals** (scorch marks, cracks, splats). Spring **camera recoil** on heavy hits. **Controller rumble** (toggle in Settings). |
| **Living world** | A shared world clock (8-minute days) drives a full **day/night cycle** in the regions: sun arc, moon, stars, dusk tint. Nights bring more elites and +25% XP. Server-driven **weather** with gameplay effects: **rain** (enemies notice you 30% later), **blizzard** (everyone 15% slower), **ash storm** (+15% enemy damage, +25% gold). Ambient **wildlife** (bird flocks, rabbits, deer, hares, frogs that flee). **Eight townsfolk** on daily schedules who greet you and run home when the night bell rings. A **fishing** mini-game at the Emberhold lake: 6 fish, rare night catches, server-validated reel times. |
| **Social and live-ops** | Social panel (O). **Friend codes**, a friends list with online status and one-click party join, **whispers** (`/w Name message`). **Guilds** (1000 gold to found): invites, guild chat (`/g`), a shared 24-slot **guild stash** at the stash chest, and a seasonal **guild rift leaderboard**. **Daily and weekly bounties**, generated from the date, that progress from real play (kills, elites, bosses, dungeons, rifts, events, fishing, waves). Claim them at the Bounty Board. **Seasons**: Season Marks unlock a 7-tier cosmetic track (nameplate titles, auras, steed colours). Marks reset monthly; cosmetics stay. |
| **Admin dashboard** | `/api/admin` (enabled by `EMBERFALL_ADMIN_KEY`) reports live rooms, zones, players and an anti-cheat log covering both damage and movement rejections. `/admin/` is a dashboard for it. The same page, published as a static Artifact, runs the real server simulation in the page with bot parties and a cheater as a demo. |
| **Performance and scale** | Crowd separation uses a spatial hash, and big waves can move it to a **worker thread** (`EMBERFALL_WORKERS=1`). **Delta-compressed snapshots** use quantized positions with keyframes, about 49% less bandwidth in a 150-enemy wave. **Server movement validation** (a speed budget plus a burst allowance for rolls and blinks) works with **client prediction and reconciliation** (sequenced states, corrections replayed). **Experimental WebGPU renderer** (Settings → Renderer): the WebGPU build of three, TSL versions of every custom shader, instanced sprite particles and TSL bloom (`?gpu=gl` runs the same node renderer on its WebGL2 backend). |

### Act III, endgame mastery and launch (milestone 5)
| Feature | Details |
|---|---|
| **Act III: The Hollow Crown** | The **Sunken Citadel**: a drowned city whose tide (shared world clock, 2-minute cycle) floods and drains the streets; wading slows you. Six quests with **Sir Corvin**, a tank companion (taunts packs onto himself, Shield Wall halves party damage). Pick your companion in the quest log. **Tide Bells** you can only ring at low water, the **Drowned Warden**, and the 5-phase **Hollow King Reborn**: arena shifts, a party **sigil puzzle** (break the sigils in the order shown on his crown), tidal waves and an enrage. New cutscene style: **in-engine close-up dialogue with lip-flap**. |
| **Endgame** | **Nightmare I–III** party difficulty: scaled enemies and loot luck, **Nightmare Essence** and four Nightmare-only legendary powers. **Weekly Rift Trials**: one seed, keystone and modifier set for everyone, a weekly ranking, and a **replay of the top run** you can watch from the Rift Obelisk (timeline, speed, follow camera). **Mystic Forge**: legendary recipes, **enchanting** a chosen affix (pick one of three results), **set transmutation**. Tooltips compare real **DPS and toughness** against what you have equipped. |
| **Combat depth** | Server-tracked **elemental statuses and combos**: **Shock** (wet + storm: stun, +50%, arcs to wet neighbours), **Explosion** (oil + fire), **Steam** (wet + fire: blinds enemies). Rain, marsh water and the tide soak enemies. Telegraphed heavy blows glint; a perfect dodge or block **counters** them (stagger + exposed, +50% damage taken). **Combo points** from basic attacks fuel a class **finisher (F)**: Shield Slam, Ember Execution, Arcane Overload, Storm Arrow. **Training Grounds** (via the Trainer) with dummies, a DPS meter and a combat log. |
| **Player housing** | Your own home off Emberhold: craft 12 furniture pieces, display a **trophy** from each boss you've slain, and keep a **fish tank** that shows every species you've caught. Decorate in build mode (B) with a grid-snapped ghost; the server validates every placement. Friends and party members can visit (🏠 in Social) but can't edit. |
| **Launch readiness** | Optional **email login by magic link** (hashed emails, rate limits). A **directory service** (`node server/directory.js`) for a **server/region browser** with ping and **friends shown across servers**. **Chat moderation**: profanity filter, cleaned names, **mute** and **report** (click a name in chat). **Signed, rate-limited admin actions** from the dashboard (kick, ban, unban, grant, roll back to a daily backup), plus live reports and client errors. **Save versioning with ordered migrations**. Client error reporting. A **performance budget** step in CI. |
| **Polish** | **SVG iconography**, panel transitions, **controller-navigable menus**. Accessibility tab: **reduced motion** (follows the OS setting), **high contrast**, **subtitle sizes**, **sound captions**, **gamepad remapping**. **English and Spanish** string tables with a language picker. A **90-second attract-mode trailer** on the title screen. |

### Static solo build
`npm run build:artifact` writes `dist-artifact/`, a static solo build. It runs the server simulation inside the page and saves to localStorage. This is the version published as a claude.ai Artifact.

### Tests
`npm test` runs the server-simulation suite (19 tests, including Act III, endgame, combat combos, housing and launch features, plus the earlier 14: combat, anti-cheat, levers, economy, trading, rifts, quests, rate limits, gems, Act II and the Herald, clock, weather and fishing, social, delta snapshots and movement validation).

`npm run load` defends Emberhold with 4 players against a 150-enemy wave in three configurations:

| config | avg tick | p95 | per-client bandwidth |
|---|---|---|---|
| main thread · full snapshots | 1.03 ms | 1.9 ms | 55 KB/s |
| main thread · delta snapshots | 0.75 ms | 1.3 ms | 28 KB/s |
| worker thread · delta snapshots | 0.77 ms | 1.3 ms | 28 KB/s |

The tick budget is 50 ms (20 Hz). At this size the worker gives no measurable win: the spatial hash already makes separation cheap. It is there for far larger waves.

### Server options
`EMBERFALL_PUBLIC_URL` (links in login emails), `EMBERFALL_MAIL_WEBHOOK` (POST {to, subject, text} to your mail provider), `EMBERFALL_DIRECTORY` + `EMBERFALL_SERVER_NAME` + `EMBERFALL_REGION` (directory heartbeat), `PORT`, `EMBERFALL_DB` (JSON file), `EMBERFALL_SQLITE=1` (SQLite store), `EMBERFALL_DEV=1` (dev chat commands, movement checks off), `EMBERFALL_WORKERS=1` (crowd worker thread), `EMBERFALL_ADMIN_KEY=<secret>` (enables `/api/admin` and the `/admin/` dashboard).

### Dev mode
Start with `EMBERFALL_DEV=1` to enable `/depth N`, `/gold N`, `/xp N`, `/wave N`, `/loot N`, `/gems N`, `/quest N`, `/hour N` and `/weather clear|rain|snow|ash` in chat.
## Controls
WASD move (keep running out of combat to sprint) · Mouse look (click to lock) · LMB basic attack · 1–4 (and RMB) class skills · Shift dodge roll · Space jump · R potion · E interact / trade / fish · V or MMB lock-on · hold T emote wheel · M mount · I inventory · K talents · J quest log · O social · B build (U upgrade, R repair) · F finisher · Enter chat (`/w name`, `/g`, `/mute name`, `/report name reason`) · Esc settings · H help. Every key can be rebound in Settings.

Gamepad: left stick move · right stick camera · A jump · B dodge · X attack · Y interact · LB/RB/LT/RT skills 1–4 · R3 lock-on · L3 emotes · D-pad ↑ potion · Start settings · Back inventory.

## Code map
```
game/
  server.js              static host, rooms, rewards/loot ownership, ready-checks, trading, message routing
  server/zone.js         enemy AI, elites, bosses (Tyrant/Matriarch), goblin, hazards, levers & shrines
  server/defense.js      flow-field pathfinding, waves, structures, tiers, repairs, Siege Ogre
  server/profile.js      server-side characters, inventory, shop, stash, talents, trades
  server/db.js           JSON-file profile store
  public/shared/         code used by both server and client: RNG/noise, world layout, dungeon generator, items, enemy stats
  public/js/main.js      renderer + bloom, zone switching, network glue, game loop
  public/js/player.js    hero controller: dodge roll, perfect dodge, block, lock-on, style, camera
  public/js/skills.js    the 12 class skills, client projectiles, Ember Spirits, skill VFX
  public/js/cinematic.js intro flyover + boss intro cameras
  public/js/lobby.js     class select with 3D preview
  public/js/settings.js  quality presets, volumes, bindings (localStorage)
  public/js/models.js    procedural characters, enemies, weapons + procedural animation
  public/js/entities.js  enemy/remote-player/loot/projectile/structure views
  public/js/zones/       town.js, dungeon.js, dark.js, common.js (sky, portals, textures, batching)
  public/js/fx.js        GPU particles, slashes, shockwaves, telegraphs, damage text
  public/js/ui.js        HUD, minimap, inventory, shop, chat, build bar
  public/js/anim.js      keyframed clips + blending animation state machine
  public/js/feel.js      footsteps per surface, decals, camera recoil, rumble
  public/js/weather.js   rain / snow / ash rendering; wildlife.js, townsfolk.js, fishing.js
  public/js/socialui.js  friends, guild, bounties, season panel
  public/js/gpu.js       experimental WebGPU path (TSL materials, sprite particles, bloom)
  public/admin/          live-ops dashboard (/admin/)
  server/social.js       friends, whispers, guilds, bounties, seasons, cosmetics
  server/crowd*.js       spatial-hash crowd separation + optional worker thread
  public/shared/life.js  world clock, weather, fish; social.js bounties/seasons; snapshot.js delta applier
  public/js/audio.js     synthesized SFX + procedural adaptive music sequencer (WebAudio)
  public/js/input.js     rebindable actions, pointer lock, gamepad
```

Networking model: the server owns enemies, the companion, loot rolls, waves, structures, weather, the clock and every economy and social action. Clients predict their own movement (the server validates speed and sends corrections) and own their HP. They send hit events that the server checks against range and a per-hit/per-second damage budget derived from the hero's real stats.
