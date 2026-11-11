# Emberfall Chronicles

A browser action RPG. Every sprite, tile and effect is drawn in code on a canvas, so there are no image assets. Open `index.html` in any modern browser.

- 6 classes: Warrior (Whirlwind), Mage (Fireball), Ranger (Arrow Storm), Rogue (Shadowstep backstab), Paladin (Holy Smite, stuns and heals) and Necromancer (Raise Dead skeleton army)
- A talent tree with three shared branches (Might, Guard, Arcana) and a branch unique to each class that upgrades its signature skill; points come from levels and story chapters, and talents can be reset for gold
- 35+ weapons any class can use (swords, katana, daggers, spear, scythe, cleaver, maul, flail, staffs, wands, bows, crossbows, blowgun, boomerang, chakram), with burn, freeze, poison, stun, lifesteal, execute, chain lightning, piercing and raise-the-dead effects; your class gets +15% with its own weapon type
- 17 spells taught by Elder Mira, including Mend, Blink, Frost Nova, Chain Lightning, Glacial Spike, Arcane Barrier, Vampiric Touch, Wall of Flames, Earthquake, Cyclone, Spirit Wolves, Meteor, Starfall and Recall, cast from slots 1-3
- 8 regions with fog-of-war, a day/night cycle and rain
- 20 monster types, including spitting toads, blinking wisps, lunging spiders and bandits, magma slimes that split in two, root-casting treants, diving harpies, poison-stinging ash scorpions, spore-cloud mushrooms, snowball-throwing yetis, ghouls, and mimics that pretend to be treasure chests
- 7 bosses: Varg the Bandit King (bandit camp), the Hollow King (Sunken Ruins), the Ashen Wyrm (Ashen Wastes), Sylvara, the Blighted Heart (a dead grove in the western Whisperwood: root lines, spore clouds, thorn storms and treant summons; drops the Heartwood Bow and the Twig pet), and one at the bottom of each dungeon
- 3 dungeons with rooms, corridors, torches, treasure and monster packs: the Mossy Crypt (Arachne, the Brood Queen), the Drowned Temple (Nerith, the Tide Serpent) and the Frostfang Caverns (Glacius, the Frost Titan). Dungeon bosses can be fought again on every visit
- A story in 5 chapters with an illustrated prologue and epilogue and spoken dialogue scenes: recover Seraphine's map from Varg, gather the three Emberstone shards from the dungeons, reforge the stone, and slay the Ashen Wyrm
- 47 quests (13 main story, 34 side quests) from 7 villagers, including Captain Rhea's bounties and Orrin the scholar's lore hunts, with a gold arrow that points to your tracked quest
- 6 waystones for fast travel and 8 lost pages of Seraphine's journal to find
- 20 achievements and a Bestiary
- Fishing minigame, mining, woodcutting and foraging, each with its own skill level
- Forge (5 weapon and 5 armor tiers), potion brewing, campfire cooking
- A workbench and Crafting skill: 30+ recipes for furniture, rings and amulets (equippable, with stat bonuses), bombs, whetstones and tonics
- Willow Cottage, a house you can buy and decorate: place furniture, sleep for a Well Rested XP buff that grows with comfort, keep a storage chest, and mount boss trophies for bonus damage
- 19 pets with abilities (loot magnet, luck, healing, coin and material finding, life-stealing bites, slowing and burning attacks, a phoenix that revives you): bought, adopted, fished up, found as rare drops, or won from bosses and the Arena
- 15 mounts, from a pony to a trampling sabertooth, a sturdy cave bear, a healing unicorn, a swimming sea turtle and two fliers (drake and griffin)
- Shop with goods, weapons, pets and mounts; 14 treasure chests
- Online multiplayer when published as a claude.ai artifact with the `room` capability: everyone who has the game open at once sees each other's heroes (class, gear, mount, name) and can chat; offline and in the standalone file the game is single-player
- The Emberfall Arena: a PvP zone where online players can fight each other, plus an 8-rank gladiator ladder against computer opponents (works offline) with a token shop
- Autosaves to the browser; plays with keyboard and mouse or touch

Controls: WASD to move, Space or click to attack, F or right-click for your skill, Shift to dash, X to ride, P for the stable, 1/2/3 to cast spells, B for the spellbook, E to interact, Q/R for potions, I for your bag and weapons, T for talents, C to decorate your house, G to throw a bomb, Enter to chat, O for the player list, L for the journal, M for the map.

`game.html` is the source. Run `./build.sh` to rebuild `index.html` from it.
