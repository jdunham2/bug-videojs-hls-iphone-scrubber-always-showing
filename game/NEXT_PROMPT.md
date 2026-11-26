# Next milestone prompt — copy and paste this into Claude

> We have a working vertical slice of **Emberfall** in `game/` (read `game/README.md` first). It's a co-op 3D browser action RPG built with Three.js and a Node WebSocket server: a town hub to explore, procedural dungeons with a boss, gear and rarities, a Dark World merchant, and a night-time Defend the City mode with building. Now take it toward AAA "game feel" and depth with the milestone below. Keep everything procedural (no external asset downloads), keep the server authoritative for enemies and loot, and keep 60 fps on a mid-range laptop. Test each feature in a headless browser and show me screenshots.
>
> **1. Classes and skill trees (the biggest gap)**
> - Add 3 classes, chosen in the lobby with a 3D character preview: **Warden** (sword and shield tank: shield bash, taunt, block), **Emberblade** (fast dual-wield: blink strike, fire whirl, combo finisher) and **Hexcaller** (ranged caster: fire bolt, chain lightning, summon an ember spirit).
> - Each class has 4 active skills on keys 1–4 with cooldowns and a resource bar (Rage, Focus or Mana), plus a 12-node passive talent tree. Players earn talent points on level-up and can reset them at a town NPC.
> - Every skill gets its own VFX, SFX, animation pose, and a server-validated hit.
>
> **2. Combat feel pass**
> - Enemies get real hit reactions (knockback and stagger on the server), elite variants with affixes (Molten, Frozen, Vampiric, Shielded) and a coloured aura, and a champion pack in every dungeon.
> - Add a dodge-roll with i-frames to replace the dash, a perfect-dodge slow-motion moment, a lock-on target (middle mouse), and a combo counter with a style rank (D→S) that boosts gold.
> - Give the Bone Tyrant a 3-phase fight: arena hazards in phase 2, enrage in phase 3. Add a second boss, the **Ash Matriarch** (a spider queen with web traps), on even depths.
>
> **3. Dungeon variety**
> - Add 3 biomes that rotate by depth, each with its own palette, props, lighting and enemies: **Bone Crypts**, **Molten Forge** (lava floor hazards) and **Frozen Catacombs** (slippery ice).
> - Add room events: trap corridors, locked doors with lever puzzles, a treasure goblin that flees, and a shrine that gives a random temporary buff.
>
> **4. Defend the City 2.0**
> - Enemies use real pathfinding (a flow field on the server) so barricades actually reroute them.
> - Add structure upgrades (3 tiers, each with a new look), walls that snap together, a repair action, and a tower-targeting priority setting.
> - Add a siege boss on wave 5 (a battering-ram Ogre that goes for the gate) and minimap warnings showing which lane is under attack.
>
> **5. Persistence and social**
> - Move saves to the server: a JSON file database keyed by a player token, so friends can't edit gold in devtools. Add a stash in town shared across characters.
> - Add a party ready-check before entering the dungeon, trading between players, and emotes on a wheel (hold T).
>
> **6. Presentation**
> - A cinematic intro that flies the camera over Emberhold with title cards, and boss intro cameras with name splashes.
> - A procedural music system (WebAudio): calm town theme, tense dungeon theme, drum-heavy night-defense theme, with crossfades.
> - Settings menu: graphics quality (shadows, grass density, bloom, resolution scale), volume sliders, mouse sensitivity, key rebinding.
> - Add gamepad support.
>
> Plan the work in phases, build and test each phase before moving on, and commit after each phase.
