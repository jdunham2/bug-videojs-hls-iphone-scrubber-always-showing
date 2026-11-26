# Next milestone prompt — copy and paste this into Claude

> **Emberfall** in `game/` (read `game/README.md` first) is a co-op 3D browser action RPG: Three.js client, authoritative Node WebSocket server, server-side saves. It already has 3 classes with skill trees, dodge/perfect-dodge/lock-on/style combat, elites, two multi-phase bosses, three rotating dungeon biomes with lever puzzles and goblins, flow-field Defend the City with tiered structures and a siege boss, a stash, trading, ready-checks, emotes, cinematics, adaptive music, settings and gamepad support. The next milestone is **endgame, story and launch-readiness**: the reasons people keep playing for months. Keep everything procedural, keep the server authoritative, keep 60 fps on a mid-range laptop, and test each feature in a headless browser with screenshots.
>
> **1. Legendary powers and crafting**
> - Legendary items roll one unique power that changes a skill (for example, "Chain Lightning splits into 3 bolts", "Fire Whirl pulls enemies in", "Shield Bash leaves a shockwave trail"). Add 4 per class plus 6 generic ones.
> - Add 3 item **sets** per class with 2-piece and 4-piece bonuses, shown in the tooltip.
> - Add a **Blacksmith** NPC in town: salvage items into Ember Shards, reroll one affix, and upgrade an item's level. Track material counts on the server.
>
> **2. Endgame: Ember Rifts and leaderboards**
> - Timed **Rifts** (keystone levels 1–∞) with a progress bar filled by kills, a rift guardian at 100%, and modifiers (fast enemies, explosive deaths, darkness).
> - Add a **seasonal leaderboard** on the server (highest rift cleared and time, per class), viewable on a town board.
> - After level 30, extra XP feeds **Paragon** points with small stat choices.
>
> **3. World and story**
> - Grow the valley into 3 open-world regions (the existing valley, Ashen Marsh and Stormspire Peaks), each with world events (a meteor crash, a caravan escort, a rift breach) that any party nearby can join.
> - Add a short questline with NPC dialogue boxes (portrait, typed text, choices) that introduces each system, ends with an act boss, and unlocks the next region.
> - Add a **mount** (summoned ember steed, fast travel between waypoints).
>
> **4. New threats**
> - 2 new bosses: a Storm Drake that flies with strafing breath runs, and a Hollow King in the Dark World who swaps arenas between phases.
> - 4 new enemy families with distinct mechanics: shield-bearers you have to flank, burrowers, healers you should focus first, and bombers.
> - Defend the City night **mutators** (blood moon, fog, double ogres) and a structure research tree.
>
> **5. Launch readiness**
> - **Server-side damage validation**: a per-class DPS budget and range/arc checks, with rejected hits logged.
> - Add **accounts** (email magic link or a passkey) so progress follows players across devices; keep the token as a fallback guest login.
> - Add a party browser: list public parties with depth and class mix, plus quick-join.
> - Production deploy: a Dockerfile, health checks, graceful shutdown that persists rooms, rate limiting, a SQLite profile store, and a GitHub Actions workflow that runs the headless tests.
> - Performance: GPU timing overlay (press F3), dynamic resolution scaling to hold 60 fps, instanced enemies for large waves, and a measured test of 4 players plus 60 enemies.
> - Touch controls for tablets (virtual stick and skill buttons), colour-blind-safe rarity and affix colours, and UI scale settings.
>
> Plan in phases, build and test each phase before moving on, show me screenshots, and commit after each phase.
