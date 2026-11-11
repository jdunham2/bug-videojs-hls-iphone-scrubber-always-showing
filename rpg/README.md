# Emberfall Chronicles

A browser action RPG. Every sprite, tile and effect is drawn in code on a canvas, so there are no image assets. Open `index.html` in any modern browser.

- 3 classes: Warrior, Mage and Ranger, each with its own attack and skill
- 8 regions with fog-of-war, a day/night cycle, rain, and a boss: the Ashen Wyrm
- 16 quests (7 main story, 9 side quests) and 15 achievements
- Fishing minigame, mining, woodcutting and foraging, each with its own skill level
- Forge (5 weapon and 5 armor tiers), potion brewing, campfire cooking
- Shop with a lure, lantern, boots and a fox companion; 14 treasure chests
- Autosaves to the browser; plays with keyboard and mouse or touch

Controls: WASD to move, Space or click to attack, F or right-click for your skill, Shift to dash, E to interact, Q/R for potions, I for your bag, L for the journal, M for the map.

`game.html` is the source. Run `./build.sh` to rebuild `index.html` from it.
