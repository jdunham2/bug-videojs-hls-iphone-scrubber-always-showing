# Emberfall Chronicles

A browser action RPG. Every sprite, tile and effect is drawn in code on a canvas, so there are no image assets. Open `index.html` in any modern browser.

- 3 classes: Warrior, Mage and Ranger, each with its own skill
- 17 weapons any class can use (swords, daggers, spear, cleaver, maul, staffs, wand, bows, crossbow, boomerang), with burn, freeze, poison, stun, chain lightning and piercing effects; your class gets +15% with its own weapon type
- 9 spells taught by Elder Mira (Mend, Blink, Frost Nova, Chain Lightning, Haste, Poison Cloud, Stone Skin, Spirit Wolves, Meteor), cast from slots 1-3
- 8 regions with fog-of-war, a day/night cycle and rain
- 13 monster types, including spitting toads, blinking wisps, lunging spiders and bandits, and magma slimes that split in two
- 6 bosses: Varg the Bandit King (bandit camp), the Hollow King (Sunken Ruins), the Ashen Wyrm (Ashen Wastes), and one at the bottom of each dungeon
- 3 dungeons with rooms, corridors, torches, treasure and monster packs: the Mossy Crypt (Arachne, the Brood Queen), the Drowned Temple (Nerith, the Tide Serpent) and the Frostfang Caverns (Glacius, the Frost Titan). Dungeon bosses can be fought again on every visit
- 27 quests (8 main story, 19 side quests), 17 achievements and a Bestiary
- Fishing minigame, mining, woodcutting and foraging, each with its own skill level
- Forge (5 weapon and 5 armor tiers), potion brewing, campfire cooking
- 9 pets with abilities (loot magnet, luck, healing, extra XP, defense, damage shield, fire and wisp attacks): bought, found as rare monster drops, or won from bosses
- 7 mounts, from a horse to a trampling boar, a frost wolf, a water-hopping toad and a flying drake
- Shop with goods, weapons, pets and mounts; 14 treasure chests
- Autosaves to the browser; plays with keyboard and mouse or touch

Controls: WASD to move, Space or click to attack, F or right-click for your skill, Shift to dash, X to ride, P for the stable, 1/2/3 to cast spells, B for the spellbook, E to interact, Q/R for potions, I for your bag and weapons, L for the journal, M for the map.

`game.html` is the source. Run `./build.sh` to rebuild `index.html` from it.
