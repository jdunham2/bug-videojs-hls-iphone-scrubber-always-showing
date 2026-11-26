# Next milestone prompt — copy and paste this into Claude

> **Emberfall** in `game/` (read `game/README.md`) is a co-op 3D browser action RPG with an authoritative Node server, 19 server tests (`npm test`), a 150-enemy load test, a CI performance budget, a solo Artifact build and a live-ops dashboard.
>
> **Content so far:**
> - 4 classes with talents, finishers and Paragon.
> - Three acts (the Ashen Marsh, Stormspire Peaks, the Sunken Citadel) with two companions.
> - 9 bosses.
> - Nightmare tiers and weekly Rift Trials with replays.
> - Crafting 2.0, elemental combos and counters.
> - Housing; friends, guilds, bounties and seasons.
> - Weather and day/night, fishing, accessibility options, English/Spanish, and an attract-mode trailer.
>
> The next milestone is **Act IV, systemic worlds and a 1.0 release**. Keep everything procedural, keep the server authoritative, keep 60 fps, add tests for every new server feature, and show me screenshots.
>
> 1. **Act IV: The Ember Throne.** A final region inside the Ember Heart itself: a volcanic, ever-shifting labyrinth whose layout re-rolls each visit. It has six quests, the return of all three earlier act bosses as echoes, and a final boss whose phases mirror each class's mechanics. Add an epilogue cutscene and a New Game+ that carries over gear and Paragon, with scaled acts and remixed modifiers.
> 2. **Systemic world.** Factions in the open regions (the Watch, Marsh Witches, Stormspire Clans) with reputation earned from events and bounties, vendors that unlock with it, and dynamic territory: event outcomes push faction borders on the minimap, and contested zones spawn faction wars.
> 3. **Pets and mounts 2.0.** Collectible battle pets that follow and help (loot pickup, small buffs), earned from rare drops and fishing. Mount customisation (armour, colours, dash), a mount race track in Emberhold, and a racing leaderboard.
> 4. **Co-op depth.** Party roles with synergy bonuses (tank, damage and support auras), revive-in-combat with a channel and a shared revive pool, party loot rules (round robin and need/greed with tooltips), and a **raid**: an 8-player, 3-boss instance with group mechanics such as soak circles, split-party plates and spread debuffs.
> 5. **Creator tools.** A **dungeon editor** (place rooms, traps, spawns and a boss) that saves to the server, can be shared by code, and has a "Featured dungeons" browser with ratings. Server-side validation ensures every layout is solvable and fair.
> 6. **1.0 release.** Native wrappers (PWA install with offline solo, plus a Steam-style desktop build via a small Electron/Tauri shell script). A cloud deployment guide with Docker Compose (game + directory + SQLite volume + backups). A tutorial onboarding for first-time players. Achievements (40+, server-validated). Music stems that react to combat intensity. A final art pass on the town and characters (normal-mapped procedural textures, better faces and hair).
>
> Plan in phases, build and test each phase (headless browser plus `npm test`), commit after each phase, and republish the Artifact at the end.
