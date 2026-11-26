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

### Dev mode
Start the server with `EMBERFALL_DEV=1 npm start` to enable chat cheats for testing: `/depth N`, `/gold N`, `/xp N`, `/wave N`. Keep it off on a public server.

## Controls
WASD move · Mouse look (click to lock) · LMB basic attack · 1–4 (and RMB) class skills · Shift dodge roll · Space jump · R potion · E interact / trade · V or MMB lock-on · hold T emote wheel · I inventory · K talents · B build (U upgrade, R repair) · Enter chat · Esc settings · H help. Every key can be rebound in Settings.

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
  public/js/audio.js     synthesized SFX + procedural adaptive music sequencer (WebAudio)
  public/js/input.js     rebindable actions, pointer lock, gamepad
```

Networking model: the server owns enemies, loot rolls, waves, structures and every economy action (gold, items, shop, stash, talents, trades). Clients own their own movement and HP, and send hit events that the server range-checks. That's fine for friendly co-op. A competitive mode would also need server-side damage validation.
