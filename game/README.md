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

## What's in the slice

| Pillar | What you can do |
|---|---|
| **3D world to explore** | Emberhold: a walled town with a market plaza, houses, lamplit streets, gate towers, wind-blown grass, a lake, forests, mountains and ruins. 6 hidden **ancient chests** in the wilderness hold gold and gear (they refill every 10 minutes). Full day/night lighting. |
| **Dungeons** | Orange portal. Procedural crypts (rooms, corridors, torches, fog of war on the minimap) full of Skeletons, Ash Cultists (ranged), Ember Imps and Bone Brutes. Ends with the **Bone Tyrant** boss: telegraphed ground slams, and it summons minions at 60% and 30% health. |
| **Scaling** | Every boss kill raises the party's **Depth**. Enemy health, damage and gold scale up, and so do the item level and rarity of drops. |
| **Loot and gear** | Weapons (Sword, Axe, Warhammer with wide cleave, Twin Daggers) plus Helm, Chest and Boots. 5 rarities (Common to Legendary) with random affixes: damage %, health, crit, move speed, gold find, lifesteal. Drops show as Diablo-style light beams. Equipped gear changes how your hero looks (glowing weapons, helmet crests, tinted armour). |
| **Combat** | 3-hit combo, **Ember Slam** area attack, invulnerable dash, jump, potions, crits, hit-stop, screen shake, floating damage numbers, auto-aim toward enemies near your crosshair. |
| **Dark World** | Violet portal. A blood-moon realm of obsidian spires, floating rocks and roaming wraiths. The **Hollow Merchant** sells rare and epic gear, potions and Mystery Caches, and buys your loot. |
| **Defend the City** | Ring the **Night Bell** beside the Ember Heart. You get a 30 s build phase, then 5 waves arrive through the east, south and west gates. Press **B** to build Barricades, Arrow Towers, Ember Braziers and Frost Totems. Every wave pays out, and surviving until dawn pays a large bonus. |
| **Progression** | XP and player levels. Gold, gear and level are saved in your browser (localStorage). |

## Controls
WASD move · Mouse look (click to lock) · LMB attack combo · Q / RMB Ember Slam · Shift dash · Space jump · R potion · E interact · I / Tab inventory · B build mode (1–4 to pick) · Enter chat · H help · Wheel zoom

## Code map
```
game/
  server.js              static host + authoritative co-op sim (enemy AI, projectiles, loot rolls, waves, structures)
  public/shared/         code used by both server and client: RNG/noise, world layout, dungeon generator, items, enemy stats
  public/js/main.js      renderer + bloom, zone switching, network glue, game loop
  public/js/player.js    hero controller, combat, skills, third-person camera
  public/js/models.js    procedural characters, enemies, weapons + procedural animation
  public/js/entities.js  enemy/remote-player/loot/projectile/structure views
  public/js/zones/       town.js, dungeon.js, dark.js, common.js (sky, portals, textures, batching)
  public/js/fx.js        GPU particles, slashes, shockwaves, telegraphs, damage text
  public/js/ui.js        HUD, minimap, inventory, shop, chat, build bar
  public/js/audio.js     synthesized SFX + ambience (WebAudio)
```

Networking model: the server owns enemies, loot rolls, the defense waves and structures. Each client owns its own movement, HP and inventory and sends hit events, which the server checks against distance. That's fine for friendly co-op. A competitive mode would need server-side validation.
