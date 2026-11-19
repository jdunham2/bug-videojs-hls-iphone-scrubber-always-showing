# Stick Squad: Ink Wars

A hand-drawn, local co-op stick-figure brawler. One player uses the **keyboard**, the other uses a **Nintendo Switch Pro Controller** (any standard gamepad works too).

## Play

Open `index.html` in Chrome or Edge (these browsers have the best gamepad support). No build step and no install.

1. Connect the Pro Controller over USB or Bluetooth.
2. Click the page once, then press any controller button to join as P2.
3. Press **Enter** (or **+**) to start.

P2 can also drop in mid-game by pressing a button.

After joining, each player picks a fighter, and then you pick a starting stage.

No controller? P2 can play on the right side of the keyboard: arrow keys move, `/` jump, `,` light, `.` heavy, `;` special, Right Shift dash.

## Controls

P1's action keys sit together in one cluster under the right hand:

```
  U  I            U = dash     I = special
   J  K  L        J = light    K = heavy    L = jump
```

| Action | P1 Keyboard | P2 Switch controller |
|---|---|---|
| Move | W A S D | Left stick / D-pad |
| Jump (double jump) | L (or Space) | B |
| Light attack (3-hit chain) | J | Y |
| Heavy attack | K | X |
| Launcher | W + K | Up + X |
| Rising slash (anti-air) | W + J | Up + Y |
| Sweep kick (trips enemies) | S + K | Down + X |
| Dash strike | J while dashing | Y while dashing |
| Meteor slam | K in the air | X in the air |
| Dash (invincible) | U (or Shift) | ZR / R / ZL / L |
| Unique skill (2.5 s cooldown) | S + J | Down + Y |
| **Super move** (full ink meter) | W + I | Up + A |
| Special (full ink meter) | I | A |
| Pause | Esc / P | + (or −) |
| Music on/off | M | (none) |

### Nintendo Switch controllers

- **Pro Controller** and **Joy-Con pairs** work automatically in Chrome and Edge.
- **A single Joy-Con held sideways** works too, so two friends can each grab one Joy-Con.
- Controllers that report a raw layout or a "hat" D-pad (common in other browsers) are handled.
- If any button does the wrong thing, open **Controller Setup** from the title screen (press **C** or **−**) and press the button you want for each action. Your layout is saved.

## Online multiplayer

Click **ONLINE PLAY** on the title screen (or press **O**). One player picks **Host a game** and gets a 4-letter code; the other picks **Join a game** and types it. Inside the Claude artifact you can also pick **Quick Match**, which joins any open game or hosts one if there isn't any. The host plays as P1, the friend plays as P2 with their own keyboard or controller, and every mode works online (Story, Boss Rush, Versus).

- **In the Claude artifact:** invite your friend to the artifact from the Share menu (a public link can't join). Open games also show up as one-click **Join** buttons.
- **Downloaded file:** both players open `index.html` in Chrome or Edge while online. Players connect directly with WebRTC, using the free PeerJS service to find each other.

The host's computer runs the game and streams it to the friend about 30 times a second, so the host should have the better connection. If either side drops for 6 seconds, the game says so and P2 can carry on locally.

**Worlds stay open.** After you play with someone, the game remembers that world (its 4-letter code):

- If your friend leaves or their connection drops, the host keeps the world open (even in the middle of a game). The corner shows **WORLD ABCD IS OPEN**.
- On the title screen, a green **REJOIN WORLD ABCD** button (or press **R**) jumps straight back in with one click.
- If nobody has the world open, whoever clicks Rejoin first reopens it with the same code, and the other player joins them when they click.
- To close your world, press O and choose **Leave online game**.


## Fighters

338 fighters, each with their own stats, look, special move and a **unique skill** on Down + Light (S + J on keyboard, Down + Y on a controller) with a 2.5-second cooldown. The skill name and cooldown show in the HUD next to your score.

**Super moves:** with a full ink meter, hold Up and press Special (W + I, or Up + A on a controller) for your fighter's screen-shaking super move, with a cinematic cut-in. **Scribble:** Ink Tsunami · **Bolt:** Storm Surge · **Boulder:** Meteor Slam · **Inkblade:** Thousand Blades · **Doodle Witch:** Hex Storm · **Shade:** Shadow Dance · **Robo:** Orbital Laser · **Halo:** Sanctuary · **Slugger:** Grand Slam · **Hopper:** Leap Frog · **Whiskers:** Nine Lives · **Chef:** Feast · **Frosty:** Absolute Zero · **Ghostly:** Poltergeist · **DJ Beats:** Subwoofer · **Sir Doodle:** Excalibur · **Bubbles:** Bubble Prison · **Jetpack Jo:** Carpet Bomb · **Presto:** Grand Finale · **El Doodlo:** Piledriver · **Mimic:** Copycat (a random super) · **Blaze:** Supernova · **Captain Ink:** Full Broadside · **Gravity Gus:** Singularity · **Gemma:** Diamond Storm · **Kickflip Kai:** 900 Spin · **Buzzy Bea:** Killer Swarm · **Samurai Sam:** Final Cut · **Echo:** Echo Chamber · **Dynamite Dan:** Nuke · **Picasso Pip:** Mural · **Yoyo Yuki:** Yoyo Storm · **Cactus Carl:** Needle Nova · **Fairy Fern:** Fairy Ring · **Viking Vera:** Valhalla · **Dr. Goo:** Goo-pocalypse · **Digger Dax:** Earth Shatter · **Astro Ace:** Big Bang · **Chrono Claire:** Time Fracture · **Lucky Lou:** All In · **Magnet Max:** Super Magnet · **Boxer Bruno:** Knockout · **Archer Anna:** Storm of Arrows · **Dragon Drew:** Dragon Form · **Balloon Billie:** Water Park · **Robo Rex:** Extinction · **Paper Pia:** Origami Dragon · **Nova Nick:** Nova Blast · **Gardener Gil:** Jungle Fury · **Builder Bob:** Demolition · **Wizard Wally:** Armageddon · **Vampire Vlad:** Nightfall · **Clown Cleo:** Big Top · **Webby:** Spider Storm · **Tank Tina:** Shock and Awe · **Luna:** Full Moon · **Magma Marv:** Volcano · **Glitch Gabe:** Blue Screen · **Pirate Peg:** Kraken Call · **Ninja Neko:** Nine Tails · **Cowgirl Cassie:** High Noon · **Robo Pup:** Good Boy · **Ice Skater Ivy:** Blizzard Ballet · **Gladiator Gia:** Colosseum · **Alien Zorp:** Mothership · **Mermaid Maren:** Ocean's Wrath · **Rockstar Roxy:** Sold Out Show · **Zombie Zed:** Apocalypse · **Baker Benny:** Bake Off · **Lumberjack Lars:** Forest Fury · **Firefighter Finn:** Rescue · **Detective Dot:** Elementary · **Mecha Mika:** Mecha Mode · **Genie Geo:** Grand Wish · **Sumo Sato:** Yokozuna · **Mime Mimi:** Silent Show · **Butterfly Bella:** Metamorphosis · **King Kongo:** Jungle King · **Doctor Dolly:** Miracle · **Spartan Spike:** This Is Sparta · **Cheer Chloe:** Victory Cheer · **Pizza Paulo:** Extra Cheese · **Kangaroo Kip:** Outback Storm · **Viper Val:** Hydra Bite · **Prism Pam:** Spectrum · **Scarecrow Scott:** Harvest Moon · **Yeti Yuri:** Ice Age · **Racer Rita:** Grand Prix · **Skeleton Skip:** Graveyard Shift · **Golfer Gary:** Fore! · **Unicorn Uma:** Magic Stampede · **Basketball Bri:** All-Star · **Hockey Hank:** Hat Trick · **Octopus Ollie:** Kraken Wake · **Wind Wendy:** Hurricane · **Monk Mo:** Enlightenment · **Jester Jax:** Fool's Parade · **Pop Star Poppy:** World Tour · **Turtle Toby:** Tidal Turtle · **Penguin Penny:** Penguin Colony · **Paintball Pax:** Paint War · **Toaster Ted:** Burnt Toast · **Firework Fiona:** New Year · **Toadstool Tom:** Fungus Frenzy · **Vac Viv:** Dust Bunny Storm · **Beetle Bruce:** Hercules · **Gumdrop Gigi:** Sugar Storm · **Ballerina Blair:** Nutcracker · **Raccoon Rico:** Midnight Heist · **Shark Shelby:** Jaws · **Drummer Dani:** Drum Solo · **Fox Felix:** Nine Flames · **Gravel:** Mountain · **Pilot Petra:** Dogfight · **Druid Dara:** World Tree · **Karate Kim:** Black Belt · **Jellyfish Jill:** Bloom · **Lightning Liz:** Supercell · **Astronomer Astrid:** Star Burst · **Blacksmith Bram:** Masterwork · **Farmer Frank:** Harvest Time · **Hot Dog Hal:** Food Truck · **Ice Cream Izzy:** Meltdown · **Mail Carrier Mia:** Special Delivery · **Panda Pei:** Panda Power · **Trucker Tammy:** Convoy · **Ski Skyler:** Black Diamond · **Soccer Gio:** Golden Goal · **Camera Cam:** Paparazzi · **Lifeguard Lana:** Lifesaver · **Owl Oscar:** Midnight Flight · **Scuba Sia:** Abyss · **Werewolf Will:** Pack Hunt · **Chemist Chen:** Chain Reaction · **Treasure Tess:** Treasure Hoard · **Cyborg Cy:** Overclock · **Sushi Sora:** Omakase · **Tennis Tia:** Match Point · **Butler Benson:** At Your Service · **Snowman Stu:** Frostbite · **Dino Dex:** Meteor Age · **BMX Ben:** X Games · **Cookie Kay:** Bake Sale · **Mechanic Molly:** Robot Army · **Koala Kobi:** Dreamland · **Monkey Miko:** Jungle Swing · **Knight Kate:** Valor · **Beatbox Bo:** Remix · **Comet Cora:** Galaxy Dash · **Spooky Sue:** Haunting · **Spy Spencer:** License to Smash · **Sandy Samir:** Desert Fury · **Rainbow Ruby:** Double Rainbow · **Mummy Milo:** Pharaoh's Curse · **UFO Uzi:** Invasion · **Dolphin Dell:** Ocean Song · **Eagle Eddie:** Sky Hunter · **Clay Claude:** Sculpt · **Caveman Cal:** Ice Age Roar · **Surfer Skye:** Tubular · **Frog Freddy:** Frog Rain · **Chicken Chuck:** Fowl Play · **Bowler Betty:** Turkey · **Professor Paige:** Final Exam · **Rhino Rhea:** Rhino Rampage · **Chameleon Cami:** Now You See Me · **Dancer Diego:** Dance Floor · **Lion Leo:** Pride Rock · **Phoenix Phil:** Firestorm · **Volcano Vic:** Magma Core · **Queen Quinn:** Long Live the Queen · **Goblin Grix:** Loot Raid · **Frost Faye:** Winter Wonderland · **Space Knight Sol:** Galactic Justice · **Tiger Tara:** Eye of the Tiger · **Sorcerer Sid:** Grand Spell · **Bat Becky:** Midnight · **Dragon Queen Draca:** Dragonfire · **Graffiti Gwen:** Masterpiece · **Hamster Hammy:** Hamster Dance · **Rodeo Rick:** Yee-Haw! · **Parrot Polly:** Pirate Parrot · **Gnome Norm:** Gnome Army · **Fencer Fleur:** En Garde · **Puppet Penn:** Puppet Show · **Squirrel Sunny:** Nuts About You · **Electrician Ella:** Blackout · **Llama Lola:** No Prob-Llama · **Mecha Samurai Ryu:** Steel Storm · **Glacier Greta:** Absolute Zero · **Stormhawk Harper:** Eye of the Storm · **Archmage Aria:** Arcane Apocalypse · **Plasma Priya:** Neon Nova · **Cyber Ninja Kira:** System Crash · **Sea Serpent Sera:** Deep Sea Fury · **Titan Taj:** Colossus · **Star Guardian Stella:** Supernova Star · **Shadow King Shax:** Eternal Night · **Zookeeper Zara:** Feeding Time · **Plumber Pedro:** Flood Zone · **Juggler Juno:** Circus Star · **Sailor Sven:** All Hands on Deck · **Dragonfly Daisy:** Wing Storm · **Peacock Piper:** Peacock Parade · **Sloth Sloane:** Hibernate · **Hedgehog Hugo:** Sonic Spikes · **Narwhal Nia:** Arctic Ocean · **Toucan Tiki:** Tropical Storm · **Minotaur Moro:** Bull Rush · **Griffin Gray:** Royal Talons · **Kitsune Koha:** Spirit Realm · **Oni Onyx:** Demon Drums · **Warlock Wren:** Hex Storm · **Valkyrie Vida:** Wings of Glory · **Sphinx Sefa:** Ancient Power · **Aurora Ami:** Polar Night · **Nebula Noor:** Cosmic Collapse · **Chimera Chi:** Beast Mode · **Florist Flora:** Spring Garden · **Barista Boris:** Double Shot · **Kite Flyer Kiki:** Kite Festival · **Acrobat Archie:** Big Top Finale · **Angler Angus:** Whale of a Time · **Wombat Willa:** Dig Deep · **Goat Gideon:** Summit Smash · **Polar Bear Percy:** Blizzard Bear · **Hippo Hazel:** Hippo Stampede · **Lobster Lex:** Tide Pool · **Storm Giant Jasper:** Wrath of the Sky · **Crystal Knight Quincy:** Crystal Cathedral · **Solar Queen Delia:** Eternal Sunshine · **Void Walker Vex:** Event Horizon · **Lunar Lancer Zion:** Full Moon · **Phantom Thief Nico:** Midnight Caper · **Time Keeper Eliot:** End of Time · **Tempest Margo:** Perfect Storm · **Trident Tobias:** King of the Deep · **Star Dragon Iggy:** Supernova Dragon · **Banjo Blix:** Barn Dance · **Elf Holly:** Holiday Cheer · **Weightlifter Ivan:** Gold Medal · **Jetski Joey:** Tidal Rush · **Noodle Nora:** Chef Special · **Roller Skater Rosa:** Disco Rink · **Walrus Wes:** Arctic Splash · **Yoga Yara:** Zen Master · **Zebra Zane:** Savanna Rush · **Crocodile Cruz:** Swamp King · **Dragon Knight Drake:** Dragonslayer · **Flame Dancer Farrah:** Inferno Tango · **Quasar Quin:** Stellar Burst · **Diamond Devi:** Brilliant Cut · **Omega Orion:** Hunter Moon · **Cyber Wolf Cyrus:** Alpha Strike · **Paladin Prue:** Judgment · **Bone Mage Brix:** Rise of Bones · **Seraph Serena:** Heavenly Choir · **Cosmo King Kaz:** Universe · **Beaver Baxter:** Dam Buster · **Seal Sadie:** Ice Floe Party · **Bunny Blossom:** Egg Hunt · **Otter Oakley:** Otter Pile · **Flamingo Fifi:** Flock Dance · **Lemur Luca:** Move It Move It · **Moose Mac:** Northwoods · **Pelican Paxton:** Fish Frenzy · **Camel Camila:** Dune Storm · **Skunk Spud:** Pee-Yoo! · **Jaguar Jade:** Jungle Fury · **Basilisk Basil:** Serpent King · **Pegasus Pearl:** Starry Sky · **Cerberus Cerb:** Triple Trouble · **Mammoth Maxine:** Woolly Wrath · **Sabertooth Saba:** Apex Predator · **Qilin Qi:** Jade Heavens · **Roc Rory:** Sky King · **Salamander Zuri:** Volcanic Fury · **Dragon Turtle Domo:** Ancient Tide · **Tailor Tamsin:** Fashion Show · **Librarian Libby:** Overdue! · **Potter Paz:** Masterwork · **Taxi Driver Toni:** Traffic Jam · **Kayaker Kekoa:** Rapids Rush · **Judo Jun:** Black Belt · **Rugby Ruben:** Try Time · **Baseball Bailey:** Grand Slam · **Climber Camden:** Summit · **Park Ranger Ravi:** National Park · **Djinn Davi:** Grant All Wishes · **Kaiju Koji:** Monster Rampage · **Frost Wyrm Fenn:** Eternal Winter · **Sun Knight Solon:** High Noon · **Moon Witch Mira:** New Moon · **Sky Whale Wynn:** Ocean in the Sky · **Forest Guardian Fauna:** Ancient Forest · **Clockwork Knight Casper:** Clockwork Army · **Nova Wolf Nyx:** Constellation Pack · **Eternal Empress Elara:** Eternity · **Violinist Violet:** Grand Finale · **Inventor Huxley:** Eureka! · **Nurse Niko:** Code Red · **Harpist Amara:** Heavenly Harp · **Prince Pierre:** Kingdom Come · **Granny Gretel:** Cookies for All · **Barber Bryn:** Makeover · **Sculptor Suki:** Masterpiece Statue · **Officer Remy:** Sirens! · **Goldfish Goldie:** Golden Splash · **Cyclops Cyd:** Titan Eye · **Gorgon Gwyn:** Snake Pit · **Centaur Corvin:** Wild Hunt · **Harpy Harlow:** Tempest Wings · **Siren Soleil:** Ocean Opera · **Faun Finnegan:** Spring Festival · **Treant Oaken:** Ancient Grove · **Banshee Bree:** Night Terror · **Manticore Manny:** Beast of Legend · **Wyvern Voss:** Dragon Skies · **Tortoise Tucker:** Ancient Shell · **Meerkat Millie:** Mob Rush · **Platypus Plato:** Secret Mission · **Armadillo Arnie:** Roll Out · **Kiwi Kaia:** Fruit Bomb · **Axolotl Alby:** Pond Party · **Chinchilla Chico:** Cloud Nine · **Iguana Ignacio:** Desert King · **Capybara Cappy:** Hot Tub · **Quokka Quince:** Happy Hops · **Magma Queen Magda:** Molten Throne · **Gale Guardian Galen:** Eye of the Wind · **Quake Knight Kade:** Tectonic Smash · **Frost Emperor Frey:** Glacial Empire · **Crystal Dragon Cress:** Diamond Storm · **Thunder Tiger Tavi:** Thunderstruck · **Shadow Samurai Shiro:** Midnight Blade · **Starlight Stag Stellan:** Celestial Charge · **Ocean Titan Orla:** Abyssal Rage · **Chaos Cat Kaos:** Total Chaos.

**Unlocking fighters:** you start with the first 20 fighters (Scribble to Mimic). Every Story chapter you beat unlocks the next 3 (24 in all). The last 4 are **challenge fighters**: Balloon Billie (defeat 10 bosses), Robo Rex (reach wave 20 in Arcade), Paper Pia (win 2 Versus matches) and Nova Nick (clear Boss Rush or defeat 40 bosses). The 10 newest are challenge fighters too: Gardener Gil (defeat 100 enemies), Builder Bob (use 5 super moves), Wizard Wally (collect 20 power-ups), Vampire Vlad (reach Arcade wave 10), Clown Cleo (win a Versus match), Webby (defeat 20 bosses), Tank Tina (defeat 300 enemies), Luna (use 20 super moves), Magma Marv (beat Story mode) and Glitch Gabe (reach Arcade wave 30). Of the 20 newest fighters, 10 are unlocked right away (Pirate Peg, Ninja Neko, Cowgirl Cassie, Robo Pup, Ice Skater Ivy, Gladiator Gia, Alien Zorp, Mermaid Maren, Rockstar Roxy and Zombie Zed) and 10 are tough challenge fighters: Baker Benny (500 enemies), Lumberjack Lars (30 bosses), Firefighter Finn (50 power-ups), Detective Dot (3 Versus wins), Mecha Mika (40 supers), Genie Geo (Arcade wave 40), Sumo Sato (1000 enemies), Mime Mimi (50 bosses), Butterfly Bella (5 Versus wins) and King Kongo (clear Boss Rush). The newest 10: Doctor Dolly, Spartan Spike, Cheer Chloe, Pizza Paulo and Kangaroo Kip are unlocked right away; Viper Val (30-hit combo), Prism Pam (60 supers), Scarecrow Scott (100 power-ups), Yeti Yuri (1500 enemies) and Racer Rita (60-hit combo) are challenge fighters. Pack 5: Skeleton Skip, Golfer Gary, Unicorn Uma, Basketball Bri and Hockey Hank are unlocked right away; Octopus Ollie (90-hit combo), Wind Wendy (100 supers), Monk Mo (75 bosses), Jester Jax (10 Versus wins) and Pop Star Poppy (Arcade wave 50) are challenge fighters. Packs 6 and 7: Turtle Toby, Penguin Penny, Paintball Pax, Toaster Ted, Firework Fiona, Raccoon Rico, Shark Shelby, Drummer Dani, Fox Felix and Gravel are unlocked right away; Toadstool Tom (120-hit combo), Vac Viv (2500 enemies), Beetle Bruce (100 bosses), Gumdrop Gigi (200 power-ups), Ballerina Blair (150 supers), Pilot Petra (Arcade wave 60), Druid Dara (150-hit combo), Karate Kim (4000 enemies), Jellyfish Jill (150 bosses) and Lightning Liz (15 Versus wins) are challenge fighters. Packs 8 and 9: Astronomer Astrid, Blacksmith Bram, Farmer Frank, Hot Dog Hal, Ice Cream Izzy, Mail Carrier Mia, Panda Pei, Trucker Tammy, Ski Skyler and Soccer Gio are unlocked right away; Camera Cam (Arcade wave 70), Lifeguard Lana (180-hit combo), Owl Oscar (6000 enemies), Scuba Sia (200 bosses), Werewolf Will (20 Versus wins), Chemist Chen (200 supers), Treasure Tess (300 power-ups), Cyborg Cy (clear Boss Rush 3 times), Sushi Sora (8000 enemies) and Tennis Tia (200-hit combo) are challenge fighters. Packs 10 and 11: Butler Benson, Snowman Stu, Dino Dex, BMX Ben, Cookie Kay, Mechanic Molly, Koala Kobi, Monkey Miko, Knight Kate and Beatbox Bo are unlocked right away; Comet Cora (Arcade wave 80), Spooky Sue (220-hit combo), Spy Spencer (10000 enemies), Sandy Samir (250 bosses), Rainbow Ruby (25 Versus wins), Mummy Milo (250 supers), UFO Uzi (400 power-ups), Dolphin Dell (clear Boss Rush 5 times), Eagle Eddie (12000 enemies) and Clay Claude (250-hit combo) are challenge fighters. Packs 12 and 13: Caveman Cal, Surfer Skye, Frog Freddy, Chicken Chuck, Bowler Betty, Professor Paige, Rhino Rhea, Chameleon Cami, Dancer Diego and Lion Leo are unlocked right away; Phoenix Phil (Arcade wave 90), Volcano Vic (270-hit combo), Queen Quinn (14000 enemies), Goblin Grix (300 bosses), Frost Faye (30 Versus wins), Space Knight Sol (300 supers), Tiger Tara (500 power-ups), Sorcerer Sid (clear Boss Rush 7 times), Bat Becky (16000 enemies) and Dragon Queen Draca (300-hit combo) are challenge fighters. Packs 14 and 15: Graffiti Gwen, Hamster Hammy, Rodeo Rick, Parrot Polly, Gnome Norm, Fencer Fleur, Puppet Penn, Squirrel Sunny, Electrician Ella and Llama Lola are unlocked right away; Mecha Samurai Ryu (Arcade wave 100), Glacier Greta (320-hit combo), Stormhawk Harper (18000 enemies), Archmage Aria (350 bosses), Plasma Priya (35 Versus wins), Cyber Ninja Kira (350 supers), Sea Serpent Sera (600 power-ups), Titan Taj (clear Boss Rush 9 times), Star Guardian Stella (20000 enemies) and Shadow King Shax (350-hit combo) are challenge fighters. Packs 16 and 17: Zookeeper Zara, Plumber Pedro, Juggler Juno, Sailor Sven, Dragonfly Daisy, Peacock Piper, Sloth Sloane, Hedgehog Hugo, Narwhal Nia and Toucan Tiki are unlocked right away; Minotaur Moro (Arcade wave 110), Griffin Gray (370-hit combo), Kitsune Koha (22000 enemies), Oni Onyx (400 bosses), Warlock Wren (40 Versus wins), Valkyrie Vida (400 supers), Sphinx Sefa (700 power-ups), Aurora Ami (clear Boss Rush 11 times), Nebula Noor (25000 enemies) and Chimera Chi (400-hit combo) are challenge fighters. Packs 18 and 19: Florist Flora, Barista Boris, Kite Flyer Kiki, Acrobat Archie, Angler Angus, Wombat Willa, Goat Gideon, Polar Bear Percy, Hippo Hazel and Lobster Lex are unlocked right away; Storm Giant Jasper (Arcade wave 120), Crystal Knight Quincy (420-hit combo), Solar Queen Delia (28000 enemies), Void Walker Vex (450 bosses), Lunar Lancer Zion (45 Versus wins), Phantom Thief Nico (450 supers), Time Keeper Eliot (800 power-ups), Tempest Margo (clear Boss Rush 13 times), Trident Tobias (30000 enemies) and Star Dragon Iggy (450-hit combo) are challenge fighters. Packs 20 and 21: Banjo Blix, Elf Holly, Weightlifter Ivan, Jetski Joey, Noodle Nora, Roller Skater Rosa, Walrus Wes, Yoga Yara, Zebra Zane and Crocodile Cruz are unlocked right away; Dragon Knight Drake (Arcade wave 130), Flame Dancer Farrah (470-hit combo), Quasar Quin (33000 enemies), Diamond Devi (500 bosses), Omega Orion (50 Versus wins), Cyber Wolf Cyrus (500 supers), Paladin Prue (900 power-ups), Bone Mage Brix (clear Boss Rush 15 times), Seraph Serena (35000 enemies) and Cosmo King Kaz (500-hit combo) are challenge fighters. Packs 22 and 23: Beaver Baxter, Seal Sadie, Bunny Blossom, Otter Oakley, Flamingo Fifi, Lemur Luca, Moose Mac, Pelican Paxton, Camel Camila and Skunk Spud are unlocked right away; Jaguar Jade (Arcade wave 140), Basilisk Basil (520-hit combo), Pegasus Pearl (38000 enemies), Cerberus Cerb (550 bosses), Mammoth Maxine (55 Versus wins), Sabertooth Saba (550 supers), Qilin Qi (1000 power-ups), Roc Rory (clear Boss Rush 17 times), Salamander Zuri (40000 enemies) and Dragon Turtle Domo (550-hit combo) are challenge fighters. Packs 24 and 25: Tailor Tamsin, Librarian Libby, Potter Paz, Taxi Driver Toni, Kayaker Kekoa, Judo Jun, Rugby Ruben, Baseball Bailey, Climber Camden and Park Ranger Ravi are unlocked right away; Djinn Davi (Arcade wave 150), Kaiju Koji (570-hit combo), Frost Wyrm Fenn (43000 enemies), Sun Knight Solon (600 bosses), Moon Witch Mira (60 Versus wins), Sky Whale Wynn (600 supers), Forest Guardian Fauna (1100 power-ups), Clockwork Knight Casper (clear Boss Rush 19 times), Nova Wolf Nyx (45000 enemies) and Eternal Empress Elara (600-hit combo) are challenge fighters. Packs 26 and 27: Violinist Violet, Inventor Huxley, Nurse Niko, Harpist Amara, Prince Pierre, Granny Gretel, Barber Bryn, Sculptor Suki, Officer Remy and Goldfish Goldie are unlocked right away; Cyclops Cyd (Arcade wave 160), Gorgon Gwyn (620-hit combo), Centaur Corvin (48000 enemies), Harpy Harlow (650 bosses), Siren Soleil (65 Versus wins), Faun Finnegan (650 supers), Treant Oaken (1200 power-ups), Banshee Bree (clear Boss Rush 21 times), Manticore Manny (50000 enemies) and Wyvern Voss (650-hit combo) are challenge fighters. Packs 28 and 29: Tortoise Tucker, Meerkat Millie, Platypus Plato, Armadillo Arnie, Kiwi Kaia, Axolotl Alby, Chinchilla Chico, Iguana Ignacio, Capybara Cappy and Quokka Quince are unlocked right away; Magma Queen Magda (Arcade wave 170), Gale Guardian Galen (670-hit combo), Quake Knight Kade (53000 enemies), Frost Emperor Frey (700 bosses), Crystal Dragon Cress (70 Versus wins), Thunder Tiger Tavi (700 supers), Shadow Samurai Shiro (1300 power-ups), Starlight Stag Stellan (clear Boss Rush 23 times), Ocean Titan Orla (55000 enemies) and Chaos Cat Kaos (700-hit combo) are challenge fighters. Your progress toward each challenge shows on the select screen, which scrolls when you move past the bottom row. Locked fighters show as a padlock on the select screen with the chapter that unlocks them. Progress is saved in your browser. In online play, the host's unlocks are used.

| Fighter | Style | Special | Skill (Down + Light) |
|---|---|---|
| Scribble | All-rounder | Ink Burst: blasts everything around you | Ink Uppercut: rising launcher |
| Bolt | Speedster, triple jump, fragile | Thunderclap: lightning hits 8 foes | Lightning Dash: invincible zap-through dash |
| Boulder | Tank, heavy attacks can't be interrupted | Earthquake: hits every grounded foe | Rock Toss: lobs a huge boulder |
| Inkblade | Always holds the Pencil Blade | Crescent Slash: giant piercing slashes | Rising Crescent: an upward flying slash |
| Doodle Witch | Ranged, heavy attack fires ink bolts | Meteor Rain | Hex Bolts: two homing bolts |
| Shade | Ninja, 2 air dashes, 1.5x crits from behind | Shadow Strike: teleports through 6 foes | Shadow Step: teleports behind the nearest foe and strikes |
| Robo | Robot, heavy attack fires piercing lasers, takes 20% less damage | Mega Laser across the screen | Rocket Punch: fires his fist |
| Halo | Healer, slowly regenerates health | Healing Light: heals the team and revives a downed partner | Halo Ring: a holy ring that heals you a little |
| Slugger | Swings a bat, heavy hits send foes flying, wall splats hurt extra | Fastball Fury | Line Drive: a screaming fast baseball |
| Hopper | Four jumps, huge leap, extra-wide Meteor Slam | Mega Stomp shakes the whole floor | Tongue Lash: long-reach tongue that pulls foes in |
| Whiskers | Cat-quick, attacks 30% faster | Claw Storm shreds everything in front | Pounce: leaping claw dive |
| Chef | Heavy attack throws a boomerang frying pan | Food Fight: a barrage of pies | Pie Toss: three pies in an arc |
| Frosty | Every hit briefly freezes enemies | Blizzard freezes everyone on screen | Icicle Fan: three freezing icicles |
| Ghostly | Hold jump to float down slowly; dashes pass through attacks | Haunt: untouchable for 4 seconds, and touching enemies hurts them | Spook Dash: phase through foes and scare them stiff |
| DJ Beats | Heavy attack fires growing sound waves that push enemies away | Drop the Bass: three screen-wide shockwaves | Beat Drop: shockwaves both ways |
| Bubbles | Heavy attack blows bubbles that trap enemies | Bubble Storm fills the air with trapping bubbles | Bubble Hop: jumps and leaves trapping bubbles |
| Jetpack Jo | Hold jump in the air to fly; heavy attack fires a homing rocket | Air Strike: rockets rain from the sky | Afterburner: boost forward, flames out the back |
| Presto | Magician: dash is a short teleport; heavy attack throws three cards | Abracadabra turns every regular enemy into loot (bosses take damage) | Vanish: card burst, then teleport forward |
| El Doodlo | Wrestler: heavy attack grabs an enemy and throws it into others | Doodlo Drop: a screen-shaking body slam | Suplex: throws a foe over his head behind him |
| Mimic | Heavy attack is a random move borrowed from other fighters | Mimic: a random special every time | Copycat: a random other fighter's skill |
| Blaze | Every hit sets enemies on fire; heavy attack throws a fireball | Inferno: walls of flame roll out both ways | Flame Wall: a rolling wall of fire |
| Captain Ink | Pirate: heavy attack fires an arcing, exploding cannonball | Broadside: a cannonball barrage | Recoil Blast: cannon fires backward and rockets him forward |
| Gravity Gus | Heavy attack makes a gravity well that pulls enemies in | Zero-G: enemies float helplessly, then slam down | Gravity Pull: yanks nearby foes toward him |
| Gemma | Heavy attack makes crystal spikes burst out of the floor ahead | Crystal Prison freezes every enemy | Crystal Armor: blocks the next 2 hits |
| Kickflip Kai | Rides a skateboard (very fast); heavy attack is a board-slam ram | Grind Rush: zooms back and forth across the screen | Kickflip: flipping launcher kick |
| Buzzy Bea | Heavy attack releases bees that chase the nearest enemy | Hive Mind: a giant swarm of bees | Stinger Dive: poison sting lunge |
| Samurai Sam | Heavy attack is a parry stance: block a hit and counter for big damage | Thousand Cuts: a flurry that hits every enemy | Iai Draw: dashes through and slices everything in the path |
| Echo | A shadow twin behind you copies every attack | Phantoms: ghost copies strike every enemy at once | Mirror Wave: slashes fly both ways |
| Dynamite Dan | Heavy attack lobs a bouncing bomb that explodes after a fuse | Mega Blast: one giant bomb with a huge explosion | Mine Drop: plants a proximity mine |
| Picasso Pip | Heavy attack splats sticky paint that slows and hurts enemies standing in it | Masterpiece: paints the whole floor | Color Wheel: six paint bolts in every direction |
| Yoyo Yuki | Heavy attack flings a long-range yo-yo that zips back | Walk the Dog: the yo-yo orbits you, hitting everything nearby | Around the World: a wide yo-yo circle |
| Cactus Carl | Prickly: enemies that hit him get stung; heavy attack fires a fan of needles | Cactus Field: spikes burst out of the whole floor | Tumbleweed: a rolling spin dash |
| Fairy Fern | Triple jump, hold jump to float; heavy attack throws a homing sparkle | Wish: heals the team 40 HP and gives everyone a 2-hit shield | Pixie Dust: puts nearby enemies to sleep |
| Viking Vera | Tough berserker; heavy attack is a huge spinning axe swing | Ragnarok: 8 lightning bolts strike her enemies | War Cry: double damage for a few seconds and pushes foes back |
| Dr. Goo | Heavy attack lobs a flask that bursts into sticky, slowing goo | Mutate: turns giant, heals and regenerates | Acid Spray: short-range burning acid |
| Digger Dax | Dashes dig underground for a longer dodge; heavy attack is a power drill | Cave-In: rocks fall on the enemies | Pop-Up: burrows under the nearest enemy and uppercuts |
| Astro Ace | Low gravity, huge floaty jumps; heavy attack is a piercing ray gun | Satellite Strike: laser strikes from orbit | Gravity Flip: launches nearby enemies into the air |
| Chrono Claire | Attacks a bit faster; heavy attack throws a boomerang gear | Time Stop: freezes every enemy | Rewind: jumps back to where you were a second ago and heals a little |
| Lucky Lou | 25% chance to land critical hits; heavy attack rolls two random dice | Jackpot: a random prize (meteors, bomb, piñata, star power...) | Coin Flip: heads = big blast, tails = heal and ink |
| Magnet Max | Power-ups fly to him; heavy attack yanks nearby enemies in | Polarity: blasts every enemy far away | Magnet Snap: zips to the nearest enemy and hits |
| Boxer Bruno | Hits hard and fast; heavy attack is an unstoppable haymaker | K.O. Combo: a 5-hit flurry on the 3 closest enemies | Counter Stance: block a hit and punch back |
| Archer Anna | Heavy attack fires three fast arrows | Arrow Rain: arrows fall on the enemies | Piercing Shot: one big arrow through everything |
| Dragon Drew | Triple jump + float, every hit burns; heavy attack breathes fire | Dragon Roar: walls of fire both ways | Wing Gust: blows enemies away |
| Balloon Billie | Triple jump + float; heavy attack lobs a splashy water balloon | Balloon Parade: water balloons rain down | Balloon Pop: jumps and splashes everything nearby |
| Robo Rex | Huge, tough robot dinosaur; heavy attack is a crunching chomp | Tail Sweep: hits everything around him | Dino Roar: scares nearby enemies stiff |
| Paper Pia | Quick and light; heavy attack throws two homing paper planes | Paper Storm: a swarm of homing planes | Fold Away: an invisible, untouchable dash |
| Nova Nick | Flies (triple jump + float); heavy attack fires piercing laser eyes | Super Punch: flies across the whole screen punching everything | Hyper Dash: zips between the 3 closest enemies |
| Gardener Gil | Slowly heals; heavy attack grows vine spikes | Overgrowth: vines burst from the whole floor and heal the team | Bloom: heals a little and hits everything nearby |
| Builder Bob | Heavy attacks can't be interrupted; heavy attack is a nail gun | Wrecking Ball: a giant bouncing spiked ball | Toolbox Toss: lobs three tools |
| Wizard Wally | Heavy attack fires 3 homing magic missiles | Polymorph: shrinks every enemy | Blink: teleports away with a magic blast |
| Vampire Vlad | Every hit drains HP back to him; heavy attack is a bat swarm | Blood Moon: drains every enemy to heal himself | Bat Dash: zips through 2 enemies and heals |
| Clown Cleo | Bouncy high jumps; heavy attack is a giant HONK | Confetti Cannon: confetti everywhere and enemies freeze laughing | Cream Pie: a pie in the face that stops enemies |
| Webby | Triple jump; heavy attack shoots a trapping web | Web Net: traps every enemy | Web Swing: swings high into the air |
| Tank Tina | Slow but very tough; heavy attack fires a tank shell | Artillery: shells rain on the enemies | Tread Rush: an armored charge |
| Luna | Floaty; heavy attack throws a boomerang moon | Moonbeams: beams strike the enemies | Moonbeam: one beam that follows the nearest enemy |
| Magma Marv | Tough, every hit burns; heavy attack lobs a bursting lava ball | Eruption: lava shoots up under every enemy | Magma Stomp: fire walls both ways |
| Glitch Gabe | Dashes teleport; heavy attack fires glitch pixels | System Crash: freezes every enemy | Lag Spike: freezes nearby enemies and teleports |
| Pirate Peg | Heavy attack is a wide hook swipe | Plank Wave: three splashing waves | Grapple: zips onto the nearest enemy |
| Ninja Neko | Triple jump, two air dashes; heavy throws three shuriken | Smoke Bomb: freezes nearby foes and turns invisible | Shadow Claw: slashes through 2 enemies |
| Cowgirl Cassie | Heavy attack lassos enemies in close | Stampede: four waves of hooves | Quick Draw: two lightning-fast shots |
| Robo Pup | Small and speedy; heavy attack is a sonic bark | Fetch!: bouncing bones that come back | Zoomies: a super fast dash |
| Ice Skater Ivy | Fast, every hit chills; heavy is a spinning ice slash | Frozen Rink: freezes every enemy | Triple Axel: a spinning jump attack |
| Gladiator Gia | Tough; heavy attack is a long trident thrust | Net Toss: traps the 3 closest enemies | Shield Wall: blocks the next 2 hits |
| Alien Zorp | Low gravity; heavy fires two homing probes | Abduct: lifts every enemy into the air | Beam Me Up: teleports up and forward |
| Mermaid Maren | Floats; heavy blows trapping bubbles | Tidal Wave: three big waves | Splash: jumps and splashes everything nearby |
| Rockstar Roxy | Heavy is a power chord that blasts both ways | Encore: lightning on the enemies | Stage Dive: a flying jump attack |
| Zombie Zed | Slow and tough, hits drain HP back | Grave Rise: hands burst up under enemies | Shamble: an unstoppable lunge |
| Baker Benny | Heavy attack lobs two pies | Cake Bomb: a giant exploding cake | Sugar Rush: a speed boost |
| Lumberjack Lars | Strong; heavy throws an axe that spins back | TIMBER!: logs crash down on enemies | Chop: a big overhead axe hit |
| Firefighter Finn | Heavy sprays a fire hose that pushes foes back | Flood: washes every enemy away | Axe Cleave: a heavy axe hit |
| Detective Dot | 25% crit chance; heavy is a magnifying beam | Case Closed: a combo on the 4 closest enemies | Clue: extra luck for a few seconds |
| Mecha Mika | Heavy can't be interrupted; fires a rocket fist | Missile Swarm: 8 homing missiles | Booster: a rocket-powered dash |
| Genie Geo | Floats; heavy fires a homing wish orb | Three Wishes: three random prizes | Lamp Dash: vanishes in smoke and reappears |
| Sumo Sato | Huge and very tough; heavy is a mighty slap | Sumo Stomp: a giant quake | Belly Bump: a charging belly hit |
| Mime Mimi | Heavy pushes an invisible wall that shoves foes | Invisible Box: traps every enemy | Tug of War: pulls the nearest enemy in |
| Butterfly Bella | Triple jump + float; heavy scatters pollen bolts | Butterfly Effect: two twisters | Flutter: flies up and hits everything nearby |
| King Kongo | Huge; heavy is a ground pound with shockwaves | Barrel Roll: three rolling barrels | Chest Beat: double damage and pushes foes back |
| Doctor Dolly | Medic; heavy throws syringe darts | Healing Wave: heals the team and pushes foes away | First Aid: heals the team a little |
| Spartan Spike | Tough; heavy throws a piercing spear | Phalanx: 3-hit shield and shockwaves | Spear Lunge: a long charging stab |
| Cheer Chloe | Bouncy; heavy is a megaphone blast both ways | Team Spirit: ink and speed for the team | Backflip Kick: a flipping kick |
| Pizza Paulo | Heavy throws a boomerang pizza | Pizza Party: heals the team and rains pizza | Dough Spin: a wide spinning hit |
| Kangaroo Kip | Huge jumps; heavy is a massive double kick | Pouch Power: two random power-ups | Hop Kick: a leaping kick |
| Viper Val | Every hit poisons; heavy spits venom | Snake Pit: venom spikes under enemies | Strike: a lightning-fast poison lunge |
| Prism Pam | Heavy fires three rainbow beams | Rainbow: a burst of colored bolts | Flash: blinds nearby enemies |
| Scarecrow Scott | Heavy sends homing crows | Murder of Crows: a swarm of crows | Straw Decoy: leaves a decoy and slips away |
| Yeti Yuri | Huge, hits freeze; heavy hurls a giant snowball | Avalanche: snowballs rain down | Belly Slide: a sliding charge |
| Racer Rita | Super fast; heavy launches a bouncing spiked tire | Pit Stop: heals and boosts the team | Nitro: a rocket-fast dash |
| Skeleton Skip | Light; heavy throws a boomerang bone | Bone Zone: bone spikes under enemies | Rattle: scares nearby enemies stiff |
| Golfer Gary | Heavy drives a screaming golf ball | Hole in One: a black hole on the nearest enemy | Chip Shot: lobs two golf balls |
| Unicorn Uma | Floats; heavy is a charging horn attack | Rainbow Dash: dashes through 5 enemies | Sparkle Heal: heals the team a little |
| Basketball Bri | Great jumper; heavy throws a bouncing ball | Buzzer Beater: 5 bouncing balls | Slam Dunk: a leaping slam |
| Hockey Hank | Tough; heavy is a piercing slap-shot puck | Power Play: shockwaves that freeze grounded foes | Body Check: a shoulder charge |
| Octopus Ollie | Heavy sprays four ink blobs | Tentacles: tentacles burst up under enemies | Ink Cloud: turns invisible and stuns nearby foes |
| Wind Wendy | Floaty; heavy is a gust that blows foes away | Cyclone: two twisters | Tailwind: a speed boost and a hop |
| Monk Mo | Quick; heavy fires a glowing palm blast | Hundred Hands: a flurry on the 3 closest enemies | Meditate: heals and adds a 1-hit shield |
| Jester Jax | Tricky; heavy juggles three balls | Jack-in-the-Box: a surprise explosion | Cartwheel: a spinning roll |
| Pop Star Poppy | Heavy is a mic blast both ways | Fan Frenzy: a swarm of homing fan mail | Spotlight: double damage for a few seconds |
| Turtle Toby | Super tough; heavy is a wide shell spin | Shell Shock: a rolling spiked shell | Hide: 2-hit shield |
| Penguin Penny | Hits freeze; heavy is a belly slide | Iceberg: ice spikes under enemies | Snowball: lobs a snowball |
| Paintball Pax | Heavy fires five paintballs | Splat Attack: paint bolts in every direction | Splat Mine: a slowing paint puddle |
| Toaster Ted | Heavy pops out two hot toasts | Breakfast Blast: toast rains down | Pop Up: jumps and fires toast |
| Firework Fiona | Heavy launches a homing firework | Sky Show: 10 homing fireworks | Sparkler: a spinning sparkle hit |
| Toadstool Tom | Hits poison; heavy puffs floating spores | Spore Cloud: poisons and stuns nearby foes | Mushroom Bounce: a big bounce attack |
| Vac Viv | Power-ups fly to her; heavy sucks enemies in | Mega Suck: pulls every enemy in | Blow: blasts nearby enemies away |
| Beetle Bruce | Armored; heavy horn-tosses foes high | Beetle Bash: quake and spikes | Shell Charge: an armored charge |
| Gumdrop Gigi | Heavy blows a trapping gum bubble | Sticky Trap: traps every nearby enemy | Bubblegum Pop: sticky burst |
| Ballerina Blair | Triple jump; heavy is a wide pirouette | Swan Lake: homing paper swans | Grand Jete: a leaping kick |
| Raccoon Rico | Sneaky; heavy tosses a trash can lid | Dumpster Dive: junk rains down | Snatch: a quick grab that steals ink |
| Shark Shelby | Fierce; heavy is a huge bite | Feeding Frenzy: bites the 4 closest enemies | Fin Dash: a fast dash |
| Drummer Dani | Heavy is a drum roll of three shockwaves | Bass Drum: a quake | Cymbal Crash: stuns nearby foes |
| Fox Felix | Fast; heavy throws homing foxfire | Fox Illusion: leaves a decoy and strikes | Phase Dash: teleports forward |
| Gravel | Giant rock golem; heavy is a rock fist | Landslide: rocks rain down | Stone Skin: half damage for a while |
| Pilot Petra | Floats; heavy fires a machine-gun burst | Bomb Run: a line of bombs | Loop: a flying loop attack |
| Druid Dara | Slowly heals; heavy fires a thorny vine | Nature's Wrath: vines and team heal | Bear Form: turns giant |
| Karate Kim | Fast fists; heavy is a karate chop | Dragon Kick: flies across the screen kicking | Counter: block and strike back |
| Jellyfish Jill | Floats; heavy is a zap that jumps between foes | Shock Field: zaps everything nearby | Sting: a stunning lunge |
| Lightning Liz | Heavy fires a piercing bolt | Storm Call: lightning strikes | Spark Dash: an electric dash |
| Astronomer Astrid | Heavy fires three homing stars | Constellation: star strikes | Comet Dash: a blazing dash |
| Blacksmith Bram | Very tough; heavy is a sparking hammer slam | Anvil Drop: anvils rain down | Forge: next 3 hits are extra strong |
| Farmer Frank | Heavy is a long pitchfork jab | Chicken Stampede: four waves | Egg Toss: lobs three eggs |
| Hot Dog Hal | Heavy squirts burning mustard | BBQ!: fire rains down | Ketchup Slip: a slippery puddle |
| Ice Cream Izzy | Hits freeze; heavy lobs two scoops | Sundae Storm: scoops rain and freeze | Brain Freeze: freezes nearby foes |
| Mail Carrier Mia | Heavy sends three homing letters | Package Bomb: a parcel that explodes | Express: a fast dash |
| Panda Pei | Tough; heavy is a wide bamboo spin | Bamboo Forest: bamboo spikes | Panda Roll: a rolling attack |
| Trucker Tammy | Sturdy; heavy is a huge HONK | Eighteen Wheeler: a rolling truck | Big Rig: an armored charge |
| Ski Skyler | Fast, hits freeze; heavy sprays snow | Avalanche Rush: snow waves and snowballs | Slalom: a super fast dash |
| Soccer Gio | Heavy is a rocket power kick | Penalty Shots: three hard kicks | Bicycle Kick: a flipping kick |
| Camera Cam | Heavy is a flash that freezes foes in front | Photo Bomb: an exploding photo | Selfie: heal and a 1-hit shield |
| Lifeguard Lana | Heavy throws a boomerang rescue ring | Tidal Rescue: waves and team heal | Whistle: stuns nearby foes |
| Owl Oscar | Floats; heavy throws a fan of feathers | HOOT!: sonic waves both ways | Night Eyes: extra luck |
| Scuba Sia | Heavy fires a piercing harpoon | Deep Dive: waves that trap foes | Bubble Net: a ring of trapping bubbles |
| Werewolf Will | Fast and fierce; heavy is a claw swipe | Full Moon Frenzy: claws the 4 closest foes | Howl: double damage and push |
| Chemist Chen | Heavy lobs an exploding potion | Reaction: four potion bombs | Antidote: heals |
| Treasure Tess | Lucky crits; heavy is a pulling whip | Booby Trap: three mines | Coin Toss: three golden coins |
| Cyborg Cy | Heavy is a big piercing arm cannon | Target Lock: 6 homing rockets | Shield Matrix: 2-hit shield |
| Sushi Sora | Heavy rolls a bouncing sushi roll | Conveyor Sushi: sushi rains down | Wasabi: a spicy burning burst |
| Tennis Tia | Heavy is a blazing serve | Ace!: four hard serves | Return: block and strike back |
| Butler Benson | Heavy flings a boomerang tea tray | Afternoon Tea: heal team and push foes away | Dust Off: spinning sweep |
| Snowman Stu | Heavy lobs a big snowball; hits freeze | Snow Day: snowball rain, freezes grounded foes | Melt Away: turn invisible and slide back |
| Dino Dex | Heavy is a tail whip both ways | Dino Stomp: earthquake | Rawr: roar that pulls foes in |
| BMX Ben | Very fast; heavy throws a wheel | Big Air!: jump and launch nearby foes | Wheelie: dash attack |
| Cookie Kay | Heavy throws a boomerang cookie | Cookie Jar: cookie rain plus a small heal | Crumbs: ring of crumbs |
| Mechanic Molly | Heavy lobs a wrench | Build a Turret: auto-firing turret | Quick Fix: heal yourself |
| Koala Kobi | Tough; heavy throws three leaves | Nap Time: big heal and shield | Bear Hug: stunning grab |
| Monkey Miko | Triple jump; heavy throws a banana boomerang | Banana Barrage: bananas in every direction | Peel Drop: leave a banana peel |
| Knight Kate | Can block; heavy is a shield charge | Rally: team shield plus a shockwave | Sword Spin: spinning slash |
| Beatbox Bo | Heavy is a bass-boom blast | Drop the Beat: quake plus sound waves | Scratch: pull foes in |
| Comet Cora | Floaty; heavy fires a comet | Shooting Stars: comet rain | Light Speed: invincible dash |
| Spooky Sue | Floats; heavy sends homing spirits | Boo!: hits and freezes every foe | Vanish: turn invisible |
| Spy Spencer | Backstabs; heavy is a laser watch | Gadget Barrage: rockets plus mines | Smoke Bomb: go invisible and pull foes in |
| Sandy Samir | Heavy blasts a stream of sand | Sandstorm: twin tornadoes | Sand Wall: shield |
| Rainbow Ruby | Heavy fires seven rainbow beams | Prism Burst: rainbow ring | Rainbow Shield: shield and invincibility |
| Mummy Milo | Tough; heavy is a pulling bandage whip | Wrap Up: trap five foes | Curse: stun and burn nearby foes |
| UFO Uzi | Floats; heavy is a tractor beam that pulls | Abduction!: launch every foe up | Warp: teleport forward and up |
| Dolphin Dell | Heavy fires a sonar ping | Tsunami Splash: waves both ways | Dolphin Flip: flipping launcher |
| Eagle Eddie | Triple jump; heavy throws three feathers | Dive Bomb: swoop onto a foe and slam | Talon Grab: dash that launches |
| Clay Claude | Tough; heavy lobs sticky clay | Clay Golem: grow giant, heal, quake | Squish: uppercut launcher |
| Caveman Cal | Tough; heavy is a big club slam | Stone Age: rock rain | Rock Toss: lob a rock |
| Surfer Skye | Heavy sends a wave along the floor | Big Kahuna: waves both ways | Hang Ten: dash attack |
| Frog Freddy | Triple jump; heavy is a pulling tongue | Lily Pad Leap: jump and quake | Hop Splash: hopping launcher |
| Chicken Chuck | Floats; heavy lobs an egg bomb | Egg Barrage: a line of egg bombs | Feather Flurry: spin attack |
| Bowler Betty | Heavy rolls a bowling ball | Strike!: two giant balls both ways | Spare: spin attack |
| Professor Paige | Heavy throws three chalk pieces | Homework Storm: book rain | Pop Quiz: stun nearby foes |
| Rhino Rhea | Very tough; heavy is a horn charge | Stampede!: flurry of charges | Horn Toss: launcher |
| Chameleon Cami | Backstabs; heavy is a tongue lash | Color Swap: hits and freezes everyone | Blend In: turn invisible |
| Dancer Diego | Heavy is a windmill kick both ways | Dance Battle: big burst | Headspin: spin attack |
| Lion Leo | Heavy is a clawed pounce | Mighty Roar: push and stun nearby foes | Claw Swipe: quick strike |
| Phoenix Phil | Floats; heavy shoots a burning fireball | Rebirth: big heal plus a burst | Fire Dive: invincible dash |
| Volcano Vic | Giant and tough; heavy hurls lava | Eruption: lava rock rain | Magma Step: burning stomp |
| Queen Quinn | Heavy throws a boomerang crown | Royal Guard: team shield and arrows | Scepter Zap: magic bolt |
| Goblin Grix | Small and sneaky; heavy throws three bombs | Goblin Gang: four mines | Sneak Attack: teleport behind a foe |
| Frost Faye | Floats; chilly hits; heavy shoots icicles | Snowflake Spin: ice ring | Frost Nova: freeze nearby foes |
| Space Knight Sol | Can block; heavy is a laser sword wave | Star Shield: shield plus slash waves | Plasma Spin: spin attack |
| Tiger Tara | Very fast; heavy is a claw slash | Tiger Fury: flurry | Pounce: dash attack |
| Sorcerer Sid | Heavy fires three spells | Arcane Storm: lightning strikes | Blink: teleport forward |
| Bat Becky | Four jumps; heavy is a piercing screech | Bat Swarm: homing bats | Drain Bite: bite that heals |
| Dragon Queen Draca | Floats; heavy is fire breath | Dragon Wings: fly up and rain fire | Wing Gust: blow foes away |
| Graffiti Gwen | Heavy sprays a cloud of paint | Mural: paint rain | Paint Drip: freeze nearby foes |
| Hamster Hammy | Tiny and fast; heavy is a rolling hamster ball | Wheel Spin: flurry | Snack Time: heal yourself |
| Rodeo Rick | Heavy is a lasso that pulls foes in | Round-Up: pull everyone close | Bucking Kick: strong kick |
| Parrot Polly | Triple jump; heavy is a squawk wave | Polly Wants a Cracker: cracker rain | Feather Dart: two darts |
| Gnome Norm | Small and tough; heavy is a shovel smack | Mushroom Ring: trap nearby foes | Plant Pot: lob a pot |
| Fencer Fleur | Very quick; heavy is a long rapier lunge | Riposte Flurry: flurry | Parry: shield and invincibility |
| Puppet Penn | Heavy throws a puppet that comes back | Marionette: freeze and lift foes | Strings: pull and stun nearby foes |
| Squirrel Sunny | Triple jump; heavy throws three acorns | Acorn Storm: acorn rain | Nut Stash: heal and gain ink |
| Electrician Ella | Heavy is a spark that chains between foes | Power Surge: lightning strikes | Live Wire: zap nearby foes |
| Llama Lola | Heavy is a spit that slows foes | Llama Drama: big burst | Fluff Kick: kick behind you |
| Mecha Samurai Ryu | Can block; heavy is an energy blade arc | Iaido Flash: hits every foe at your height | Rocket Step: invincible dash |
| Glacier Greta | Giant and frosty; heavy hurls an ice boulder | Glacier Wall: team shield and ice spikes | Frozen Stomp: freezing stomp |
| Stormhawk Harper | Triple jump; heavy throws lightning feathers | Thunder Dive: swoop and call lightning | Gale Force: blow foes away |
| Archmage Aria | Heavy fires a homing orb | Meteor Spell: meteor rain | Mana Shield: shield and ink |
| Plasma Priya | Heavy is a long plasma whip that pulls | Plasma Cyclone: big burst | Plasma Dash: dash attack |
| Cyber Ninja Kira | Backstabs; heavy throws four laser stars | Glitch Strike: flurry | Cloak: turn invisible |
| Sea Serpent Sera | Heavy is a tail whip both ways | Whirlpool: pull foes in plus waves | Water Jet: wave along the floor |
| Titan Taj | The biggest fighter; heavy is a double fist | Titan Stomp: earthquake | Boulder Throw: lob a boulder |
| Star Guardian Stella | Floats; heavy fires five stars | Starfall Shield: team shield and star rain | Wishing Star: heal the team |
| Shadow King Shax | Heavy sends shadow hands along the floor | Dark Throne: freeze plus homing shadows | Shadow Step: teleport next to a foe |
| Zookeeper Zara | Heavy throws three fish | Zoo Break: homing bees and rolling rhinos | Whistle: freeze nearby foes |
| Plumber Pedro | Heavy is a plunger smack | Pipe Burst: geysers under foes | Water Spray: wave along the floor |
| Juggler Juno | Heavy juggles three balls | Big Finale: ball rain | Pin Toss: boomerang pin |
| Sailor Sven | Heavy swings an anchor both ways | Cannon Salute: a line of cannon blasts | Life Ring: shield |
| Dragonfly Daisy | Four jumps; heavy fires darts | Swarm Dive: homing bugs | Hover: float up, briefly invincible |
| Peacock Piper | Heavy fans out five feathers | Rainbow Fan: nine magic bolts | Dazzle: freeze nearby foes |
| Sloth Sloane | Super tough but slow; long claw swing | Big Yawn: puts every foe to sleep | Snooze: heal yourself |
| Hedgehog Hugo | Very fast; heavy is a rolling spike ball | Quill Storm: ring of quills | Spin Dash: dash attack |
| Narwhal Nia | Heavy is a horn charge | Tusk Torpedo: piercing torpedo | Bubble Burst: trapping bubble |
| Toucan Tiki | Triple jump; heavy throws fruit | Fruit Salad: fruit rain | Beak Peck: quick strike |
| Minotaur Moro | Giant; heavy is a bull rush | Labyrinth Rage: flurry | Hoof Stomp: stomp grounded foes |
| Griffin Gray | Triple jump; heavy is a swooping claw | Sky Roar: big burst | Feather Gust: three feathers |
| Kitsune Koha | Floats; heavy throws homing fox fire | Nine Tails: nine homing flames | Illusion: go invisible and slip back |
| Oni Onyx | Giant; heavy is a spiked club | Thunder Drum: lightning strikes | Oni Roar: freeze nearby foes |
| Warlock Wren | Heavy fires a curse bolt | Shadow Pact: homing curses plus a heal | Life Drain: steal health |
| Valkyrie Vida | Floats and can block; heavy throws a spear | Valhalla Charge: flurry | Shield Wall: big shield |
| Sphinx Sefa | Heavy is a golden sand blast | Desert Sun: lightning strikes | Riddle: freeze nearby foes |
| Aurora Ami | Floats; heavy is a light wave | Aurora Curtain: team shield plus waves | Glimmer: heal the team |
| Nebula Noor | Floaty; heavy fires a mini galaxy | Big Bang: big burst | Stardust: ring of sparkles |
| Chimera Chi | Heavy breathes fire | Triple Roar: big burst | Snake Bite: burning bite |
| Florist Flora | Heavy throws a bouquet of petals | Petal Storm: petal rain | Bloom: heal the team |
| Barista Boris | Heavy splashes burning hot coffee | Coffee Break: team heal plus Hyper Speed | Espresso Dash: super-fast dash |
| Kite Flyer Kiki | Floats; heavy throws a boomerang kite | Gust Front: blows foes away | Updraft: fly up and launch foes |
| Acrobat Archie | Four jumps; heavy is a cartwheel kick | Human Cannonball: fly at a foe | Backflip: flip away, briefly invincible |
| Angler Angus | Heavy is a hook that reels foes in | Big Catch: reel in five foes | Bait: drop a trap |
| Wombat Willa | Tough digger; heavy tosses dirt | Tunnel Ambush: spikes under foes | Burrow: pop up under a foe |
| Goat Gideon | Triple jump; heavy is a headbutt | Avalanche Butt: flurry plus snow rain | Goat Scream: freeze nearby foes |
| Polar Bear Percy | Giant; chilly hits; heavy is a bear swipe | Ice Floe Slam: freezing quake | Bear Hug: stunning grab |
| Hippo Hazel | Huge and tough; heavy is a belly flop | Mud Bath: sticky mud waves plus a heal | Chomp: big bite |
| Lobster Lex | Heavy is a stunning claw pinch | Claw Crusher: pinch four foes | Shell Guard: shield |
| Storm Giant Jasper | Giant; heavy throws a thunderbolt | Mega Storm: lightning strikes | Thunder Step: stomp grounded foes |
| Crystal Knight Quincy | Can block; heavy fires a crystal lance | Prism Wall: team shield and crystal spikes | Gem Spin: spin attack |
| Solar Queen Delia | Floats; heavy fires a burning sunbeam | Solar Flare: burning burst | Sunburst: burn nearby foes |
| Void Walker Vex | Heavy opens a rift that pulls foes | Black Hole: pull everyone in, then boom | Phase: teleport forward |
| Lunar Lancer Zion | Floaty; heavy is a long spear thrust | Crescent: giant moon slashes | Moon Hop: hopping launcher |
| Phantom Thief Nico | Backstabs; heavy throws calling cards | Grand Heist: flurry and steal ink | Smoke & Mirrors: turn invisible |
| Time Keeper Eliot | Heavy throws a boomerang clock hand | Time Stop: freeze every foe | Rewind: heal yourself |
| Tempest Margo | Floats; heavy throws a mini tornado | Hurricane: twin tornadoes | Gale: blow foes away |
| Trident Tobias | Heavy throws a piercing trident | Poseidon Wave: waves both ways | Tidal Shield: shield plus a wave |
| Star Dragon Iggy | Floats; heavy breathes star fire | Galaxy Breath: fan of star bolts | Tail Comet: spin attack |
| Banjo Blix | Heavy strums a sound wave | Hoedown: quake that freezes foes | Banjo Bonk: strong hit |
| Elf Holly | Small; heavy throws three popping gifts | Present Pile: gift bomb rain | Jingle: freeze nearby foes |
| Weightlifter Ivan | Very strong; heavy throws a dumbbell | Barbell Slam: earthquake | Flex: shield |
| Jetski Joey | Very fast; heavy sprays a wake wave | Wake Rider: flurry | Boost: super-fast dash |
| Noodle Nora | Heavy is a noodle whip that pulls | Ramen Rain: noodle rain | Hot Broth: burn nearby foes |
| Roller Skater Rosa | Very fast; heavy is a spinning skate kick | Roller Derby: flurry | Glide: dash attack |
| Walrus Wes | Huge and tough; heavy is a tusk stab | Belly Slide: flurry | Flipper Slap: strong slap |
| Yoga Yara | Heavy is a palm push wave | Inner Peace: team heal plus freeze | Tree Pose: shield and heal |
| Zebra Zane | Fast; heavy kicks both ways | Stripe Stampede: flurry | Gallop: dash attack |
| Crocodile Cruz | Heavy is a stunning chomp | Death Roll: flurry | Tail Swipe: spin attack |
| Dragon Knight Drake | Can block; heavy is a flame sword arc | Dragon Dive: dive and quake | Flame Guard: shield plus burn |
| Flame Dancer Farrah | Heavy spins a ring of flame | Fire Waltz: ring of fireballs | Fire Twirl: small fire ring |
| Quasar Quin | Floaty; heavy fires twin lasers | Pulsar Pulse: burst that freezes | Warp Step: teleport forward |
| Diamond Devi | Super tough; heavy throws diamonds | Diamond Dome: big team shield | Gem Shield: shield |
| Omega Orion | Heavy fires a piercing star arrow | Constellation: arrow rain | Star Trap: drop a trap |
| Cyber Wolf Cyrus | Very fast; heavy is a laser claw | Pack Hunt: homing robot wolves | Howl: freeze nearby foes |
| Paladin Prue | Can block; heavy is a hammer slam | Blessing: big team heal and shield | Holy Light: heal the team |
| Bone Mage Brix | Heavy throws three bones | Bone Storm: ring of bones | Bone Wall: shield plus spike |
| Seraph Serena | Floats; heavy fires holy feathers | Halo Burst: burst plus heal | Guardian: team shield |
| Cosmo King Kaz | Floats; heavy fires a planet orb | Solar System: homing planets | Orbit: ring of mini-planets |
| Beaver Baxter | Heavy is a tail slap | Timber!: logs fall on foes | Log Wall: shield plus spike |
| Seal Sadie | Heavy throws a beach ball | Seal Show: ball rain | Belly Bounce: bouncing launcher |
| Bunny Blossom | Triple jump; heavy is a double kick | Carrot Barrage: fan of carrots | Bunny Hop: hopping launcher |
| Otter Oakley | Heavy throws a skipping rock | River Rush: waves both ways | Back Float: heal, briefly invincible |
| Flamingo Fifi | Floats; heavy is a long leg kick | Pink Flurry: ring of feathers | Wing Flap: blow foes away |
| Lemur Luca | Triple jump; heavy is a tail whip | Jungle King: flurry | Leap Frog: hopping launcher |
| Moose Mac | Giant; heavy is an antler charge | Antler Storm: flurry | Hoof Kick: kick behind you |
| Pelican Paxton | Floats; heavy spits three fish | Beak Scoop: grab three foes | Dive: dash attack |
| Camel Camila | Tough; heavy is a slowing spit | Oasis: big team heal plus a wave | Sand Kick: kick sand behind you |
| Skunk Spud | Heavy sprays a stink cloud that freezes | Big Stink: freeze everyone nearby | Tail Flick: quick hit |
| Jaguar Jade | Very fast; backstabs; heavy is a claw combo | Shadow Prowl: invisible flurry | Pounce: dash attack |
| Basilisk Basil | Heavy is a burning venom spit | Stone Gaze: freezes every foe in front | Coil: shield plus freeze |
| Pegasus Pearl | Floats; heavy is a sky kick | Cloud Charge: flurry | Wing Gust: blow foes away |
| Cerberus Cerb | Heavy is a triple chomp | Hellhound Howl: burning burst | Fire Bark: three fireballs |
| Mammoth Maxine | Biggest and toughest; heavy is a tusk sweep | Ice Age Stomp: freezing quake | Trunk Blast: water wave |
| Sabertooth Saba | Fast; heavy is a leaping fang slash | Primal Roar: burst that stuns | Fang Dash: dash attack |
| Qilin Qi | Floats; heavy fires homing flames | Fortune: team heal, points and flames | Cloud Step: float up |
| Roc Rory | Giant bird; heavy is a huge wing gust | Talon Drop: dive and quake | Feather Rain: four feathers |
| Salamander Zuri | Heavy spits a lava ball | Magma Pool: burns every grounded foe | Lava Dive: pop up under a foe |
| Dragon Turtle Domo | Huge, tough and can block; heavy is steam | Shell Quake: quake plus shield | Shell Spin: spin attack |
| Tailor Tamsin | Heavy throws three needles | Stitch Up: trap five foes | Measure Up: freeze nearby foes |
| Librarian Libby | Heavy throws a heavy book | Book Avalanche: book rain | Shush: freeze nearby foes |
| Potter Paz | Heavy throws a shattering clay pot | Kiln Blast: burning burst | Pottery Wheel: spin attack |
| Taxi Driver Toni | Fast; heavy is a honking horn blast | Rush Hour: flurry | Cab Dash: big dash attack |
| Kayaker Kekoa | Heavy is a paddle spin both ways | Whitewater: waves both ways | Splash: wave along the floor |
| Judo Jun | Heavy is a shoulder throw | Ippon!: slam four foes | Counter: shield, briefly invincible |
| Rugby Ruben | Tough; heavy is a charging tackle | Scrum: flurry | Rugby Pass: throw the ball |
| Baseball Bailey | Heavy throws a blazing fastball | Strikeout: three fastballs | Curveball: lobbed ball |
| Climber Camden | Four jumps; heavy is a grappling hook | Rockslide: rock rain | Chalk Up: heal and gain ink |
| Park Ranger Ravi | Heavy throws three pinecones | Wildlife: homing animal pals | Whistle Call: freeze nearby foes |
| Djinn Davi | Floats; heavy fires a homing magic bolt | Three Wishes: heal, ink and lightning | Vanish: turn invisible |
| Kaiju Koji | Huge; heavy is an atomic beam | Kaiju Stomp: earthquake | Tail Smash: spin attack |
| Frost Wyrm Fenn | Floats; chilly hits; heavy is frost breath | Glacier Breath: freeze everything in front | Ice Scales: shield plus freeze |
| Sun Knight Solon | Can block; heavy is a blazing sword wave | Dawn Strike: lightning strikes | Sun Shield: shield plus burn |
| Moon Witch Mira | Floats; heavy fires two crescent moons | Lunar Eclipse: freeze every foe | Moonwalk: slip backward |
| Sky Whale Wynn | Huge and floaty; heavy is a blowhole blast | Whale Song: sound waves plus heal | Belly Flop: big launcher |
| Forest Guardian Fauna | Heavy throws a thorn spear | Overgrowth: vines under foes | Blossom: heal the team |
| Clockwork Knight Casper | Can block; heavy throws two gears | Overwind: Hyper Speed plus flurry | Tick Tock: freeze nearby foes |
| Nova Wolf Nyx | Very fast; heavy is a starlight claw | Star Howl: burst that stuns | Comet Dash: invincible dash |
| Eternal Empress Elara | Floats; heavy is a royal light beam | Royal Decree: freeze plus lightning | Royal Ward: team shield |
| Violinist Violet | Heavy plays a piercing note | Symphony: sound waves both ways | Lullaby: puts nearby foes to sleep |
| Inventor Huxley | Heavy fires a spring boxing glove | Robot Helper: auto-firing turret | Gadget: drop a trap |
| Nurse Niko | Heavy throws a boomerang bandage | Recovery Room: huge team heal | First Aid: heal the team |
| Harpist Amara | Floats; heavy plucks three notes | Angel Chorus: team heal plus waves | Soothe: heal plus freeze |
| Prince Pierre | Heavy is a sword lunge | Royal Flourish: flurry | Parry: shield, briefly invincible |
| Granny Gretel | Heavy throws tangling yarn balls | Cozy Sweater: team shield plus heal | Knitting Needles: two needles |
| Barber Bryn | Fast; heavy is a scissor slash | Fresh Cut: flurry | Hairspray: spray that freezes |
| Sculptor Suki | Heavy throws a chisel | Stone Garden: stone spikes under foes | Statue Pose: big shield |
| Officer Remy | Heavy is a whistle blast | Roadblock: team shield plus barriers | Handcuffs: trap the nearest foe |
| Goldfish Goldie | Tiny; floats; heavy blows a trapping bubble | Fishbowl: ring of trapping bubbles | Fin Flip: hopping launcher |
| Cyclops Cyd | Huge; heavy fires an eye laser | Boulder Bash: boulder rain | Club Stomp: stomp grounded foes |
| Gorgon Gwyn | Heavy is a burning snake bite | Stone Stare: freezes every foe | Hiss: freeze nearby foes |
| Centaur Corvin | Fast; heavy fires three arrows | Stampede Volley: arrow rain | Gallop: dash attack |
| Harpy Harlow | Four jumps; heavy is a feather storm | Screech Dive: dive and stun | Talon Swipe: dash that launches |
| Siren Soleil | Floats; heavy is a song that pulls foes | Siren Song: pull everyone in, stunned | Tide Call: wave along the floor |
| Faun Finnegan | Triple jump; heavy is a pan flute wave | Woodland Dance: freeze foes plus heal | Hoof Hop: hopping launcher |
| Treant Oaken | Huge and super tough; heavy is a branch swing | Root Prison: trap foes in roots | Bark Skin: big shield |
| Banshee Bree | Floats; heavy is a piercing wail | Haunting Wail: burst that freezes | Fade: turn invisible |
| Manticore Manny | Triple jump; heavy fires burning tail spikes | Venom Storm: spike rain | Pounce: dash attack |
| Wyvern Voss | Floats; heavy is fire breath | Sky Inferno: fireball rain | Wing Buffet: blow foes away |
| Tortoise Tucker | Super tough but slow; heavy is a shell spin | Shell Fortress: team shield plus quake | Hide: big shield, briefly invincible |
| Meerkat Millie | Tiny and fast; heavy throws a dirt clod | Burrow Ambush: spikes under foes | Lookout: invincible plus ink |
| Platypus Plato | Heavy is a tail slap | Venom Spur: poison four foes | Spy Gadget: turn invisible |
| Armadillo Arnie | Tough; heavy is a rolling charge | Bowling Ball: rolls both ways | Armor Up: shield |
| Kiwi Kaia | Tiny and very fast; heavy is a beak jab | Kiwi Stampede: flurry | Sprint: super-fast dash |
| Axolotl Alby | Heavy blows three bubbles | Regenerate: big team heal | Gill Wiggle: heal yourself |
| Chinchilla Chico | Fluffy; floats; heavy is a dust cloud | Fluff Storm: freeze nearby foes | Hop Hop: hopping launcher |
| Iguana Ignacio | Heavy is a tail whip both ways | Lizard Leap: leap and quake | Sun Warm: heal and gain ink |
| Capybara Cappy | Tough and chill; heavy is a belly bump | Chill Vibes: team heal plus freeze | Orange Hat: shield plus heal |
| Quokka Quince | Triple jump; heavy is a double kick | Big Smile: freeze nearby foes plus heal | Pouch Snack: heal yourself |
| Magma Queen Magda | Heavy throws a burning lava orb | Eruption Crown: meteor rain | Lava Step: burning stomp |
| Gale Guardian Galen | Floats; heavy is a pushing gust | Hurricane Wall: twin tornadoes | Updraft: fly up |
| Quake Knight Kade | Can block; heavy is a ground slam | Fault Line: earthquake | Stone Skin: big shield |
| Frost Emperor Frey | Chilly hits; heavy fires an ice spear | Absolute Winter: freeze every foe | Ice Throne: shield plus freeze |
| Crystal Dragon Cress | Floats; heavy breathes crystal shards | Prism Breath: fan of crystals | Gem Armor: shield, briefly invincible |
| Thunder Tiger Tavi | Very fast; heavy is a shocking claw | Storm Pounce: pounce plus lightning | Bolt Dash: invincible dash |
| Shadow Samurai Shiro | Backstabs; heavy is a shadow slash | Thousand Cuts: flurry | Shadow Step: teleport next to a foe |
| Starlight Stag Stellan | Floats; heavy is an antler charge | Star Meadow: team heal plus star rain | Moonlight: heal the team |
| Ocean Titan Orla | Huge; heavy is a tidal punch | Mega Tsunami: giant waves | Whirlpool: pull foes in |
| Chaos Cat Kaos | Every heavy is a random attack | Mischief: a random special | Nine Lives: heal, briefly invincible |
| Sir Doodle | Knight: hold DOWN to block attacks from the front; heavy attack is a charging lance | Royal Whirl: a spinning blade attack | Shield Bash: charging bash that raises a 1-hit guard |

## Modes

After picking fighters you choose a mode:

- **Story:** an 8-chapter adventure to stop **the Grand Eraser**, who wants to wipe the whole notebook clean. Each chapter has a wave of enemies, a mini-boss and a boss, with comic-style cutscenes before the chapter, before the boss and after you win, plus an ending. Press J / A to advance the text, Enter / + to skip a scene. Progress is saved, and you can replay any chapter you've reached.
- **Arcade:** endless waves of enemies. Pick a starting stage, or a random one.
- **Boss Rush:** fight all 293 mini-bosses and bosses back to back against the clock. You heal a little and get 2 power-ups between rounds, and your best time is saved.
- **Versus:** P1 vs P2 on any stage. Best of 3 rounds, 99 seconds per round (if time runs out, whoever has more health wins the round). Mystery boxes still fall, so power-ups are in play. Needs both players.

All modes work online.

## Stages

120 stages of five waves each: Notebook Heights, Graph City, Chalkboard Arena, Sticky Note Jungle, Blueprint Factory (moving platforms), Midnight Sketchbook (moving platforms), Crayon Canyon (bobbing platforms), Comic Panels, Lava Doodle (lava geysers erupt from the floor: watch for the glowing warning circles; geysers hurt enemies too), Ice Rink (slippery floor), Space Doodle (low gravity), Windy Worksheet (wind gusts push everyone sideways after a warning), The Blank Page (home of the final boss), Toy Box (bouncy springs launch you into the air), Haunted Sketch (the lights go out and only spotlights around the players remain; enemy eyes glow in the dark) Assembly Line (floor conveyor belts that reverse direction after a warning), **Storm Sketch** (lightning strikes where the flashing yellow lines appear; it hits enemies too), **Deep Sea Doodle** (underwater: you sink slowly and can tap jump to swim up), **Crumbling Castle** (cracked platforms collapse if you stand on them too long, then rebuild) **Neon Arcade** (laser beams sweep across the floor or the platforms after a warning: jump over the floor ones), **Subway Sketch** (a train roars along the floor after a warning: get up on a platform!), **Desert Doodle** (quicksand pits slow you down and weaken your jumps), **Toxic Swamp** (glowing green puddles appear and hurt anyone standing in them) **Clock Tower** (a giant pendulum swings through the middle of the arena), **Candy Land** (giant gumballs come bouncing across the floor after a warning), **Beach Doodle** (high tide washes over the floor and pushes everyone sideways), **Rooftop Rumble** (two gaps in the roof: fall in and you lose 12 HP and drop back in from the top) **Disco Doodle** (three dance floor tiles flash red, then zap anyone standing on them), **Jungle Temple** (dart traps fire from the walls: jump over low darts, stay on the ground for high ones), **Mirror Maze** (shots bounce off the mirror walls once, so aim for the rebound!), **Pirate Ship** (red X marks appear, then cannonballs crash down on them) **Power Plant** (the floor sparks, then electrifies: get up on a platform!), **Haunted Library** (flying books swoop across the room after a warning), **Sky Islands** (glowing updrafts lift anyone standing in them high into the air), **Galaxy Core** (a black hole slowly pulls everyone to the middle, then surges: dash away!) **Pinball Palace** (giant bumpers bounce players and enemies across the arena), **Teleport Lab** (step into a portal to warp across the arena; shots go through too), **Windmill Farm** (giant windmill blades spin through the middle), **Twister Valley** (a huge tornado roams back and forth, lifting and flinging anyone it catches) **Honey Hive** (sticky honey slows you down and bee swarms chase you after a warning), **Volcano Summit** (lava rocks crash down on the red X marks), **Arctic Base** (slippery ice and falling icicles), **Big Top Circus** (springy trampolines and falling juggling pins), **Sewer Tunnels** (the tunnel floods: tap jump to swim until it drains), **Space Station** (gravity switches off for a while after a warning), **Gem Mine** (runaway mine carts roll along the floor), **Bowling Alley** (a giant bowling ball rolls across: jump over it), **Art Museum** (security lasers sweep the room), **Cheese Moon** (floaty low gravity and falling space rocks), **Roller Coaster** (a coaster zooms along the floor: jump over it), **Flooded City** (the streets flood: tap jump to swim), **Bank Vault** (security lasers), **Snowball Fort** (slippery ice and a rain of snowballs), **Pizza Kitchen** (a food fight drops toppings on you), **Dino Valley** (a dino stampede runs across the floor), **Zero-G Gym** (gravity switches off for a while), **Mars Base** (gravity glitches and falling space rocks), **Crystal Cave** (slippery crystal floor and runaway mine carts), **Toy Train Town** (a toy train chugs along the floor: jump over it), **Monsoon Market** (falling fruit and floods), **Junkyard** (junk falls from the sky), **Cloud Kingdom** (floaty jumps and lightning strikes), **Gumball Factory** (a gumball avalanche and springy floors), **Ninja Dojo** (ninja stars rain down), **Robot Arena** (security lasers and flying junk), **Ghost Ship** (ghostly cannon fire, and gravity floats away), **Skate Park** (a giant skateboard rolls across: jump it), **Frozen Waterfall** (slippery ice and floods), **Tesla Tower** (lightning strikes and lasers), **Donut Shop** (a sprinkle storm and springy floors), **Meteor Crater** (meteors and runaway mine carts), **Alien Jungle** (floaty jumps and falling alien spores), **Spooky Carnival** (a ghost coaster and flying pins), **Space Highway** (floaty jumps and a speeding space bus), **Rainforest** (lightning and floods), **Ice Palace** (slippery ice, icicles and lasers), **Giant Bathtub** (the whole stage is underwater, plus falling bubbles), **Star Observatory** (gravity switches and falling stars), **Pirate Cove** (cannon fire and the tide comes in), **Fireworks Festival** (falling fireworks and springy floors), **Pyramid** (lasers and falling sand blocks), **Candy Volcano** (a gumball eruption and springy floors), **Atlantis** (underwater, with lightning strikes), **Bullet Train** (a super-fast train zooms across: jump!), **Autumn Forest** (falling acorns), **Glitch World** (glitchy gravity and lasers), **Rock Concert** (lasers and fireworks), **Black Hole Station** (floaty jumps and space rocks), **Chocolate Factory** (falling candy and chocolate floods), **Mountain Peak** (slippery ice and snowballs), **Neon Subway** (the neon express and lasers), **Haunted Forest** (spooky lightning and floaty gravity), **Asteroid Mine** (floaty jumps, ore carts and space rocks), **Beach Volleyball** (volleyballs and springy floors), **Castle Siege** (arrow volleys), **Dragon Lair** (dragon embers and lightning), **Sushi Bar** (a sushi storm and springy floors), **Wild West Town** (a steam train roars through: jump!), **Ice Cream Parlor** (a slippery floor and falling scoops), **Coral Reef** (underwater, with falling bubbles), **Space Port** (floaty jumps and lasers), **Magma Forge** (molten sparks and lasers), **Candy Clouds** (floaty jumps and gumball rain), **Thunder Peak** (lightning, snowballs and ice), **Lighthouse** (lightning and a rising tide), **Hot Springs** (bubbles and floods), **Jungle River** (falling spores and floods), **Board Game** (giant falling dice and springy floors), **Bamboo Grove** (spinning bamboo leaves), **Saturn Rings** (floaty jumps and ice chunks), **Haunted Manor** (lightning and floaty gravity), **Lava Express** (a lava train and falling embers), **Gold Mine** (gold carts and raining coins), **Music Hall** (falling music notes and lasers), **Arctic Sea** (an icy underwater stage with icicles), **Desert Oasis** (falling sand and floods), **Treehouse** (falling acorns and springy floors), **Pixel Planet** (floaty jumps and lasers), **Mushroom Forest** (spores and springy floors) and **Royal Palace** (arrow volleys and lightning).

## Bosses

Every stage has a mini-boss on wave 3 and a boss on wave 5, and each one has its own set of moves:

| Stage | Mini-boss | Boss |
|---|---|---|
| Notebook Heights | Eraser Knight | The Scribble King |
| Graph City | Compass Captain | Graphzilla |
| Chalkboard Arena | The Chalk Duster | Professor Chalk |
| Sticky Note Jungle | Paperclip Pirate | The Sticky Bandit |
| Blueprint Factory | Gear Grinder | Blueprint Golem |
| Midnight Sketchbook | Night Owl | The Midnight Smudge |
| Crayon Canyon | Crayon Cowpoke | The Wax Titan |
| Comic Panels | Captain Kapow | Doctor Inkspot |
| Lava Doodle | Magma Imp | The Eruptor |
| Ice Rink | Snow Goon | The Abominable Scribble |
| Space Doodle | Comet Kid | Galaxy Gobbler |
| Windy Worksheet | Kite Bandit | The Tempest |
| The Blank Page | Paper Dragon | The Grand Eraser |
| Toy Box | Jack-in-the-Box | The Wind-Up Tyrant |
| Haunted Sketch | Poltergeist Pete | The Phantom Pencil |
| Assembly Line | Forklift Fred | Mega Assembler |
| Storm Sketch | Sparky | The Storm King |
| Deep Sea Doodle | Puffer Pete | Kraken Scrawl |
| Crumbling Castle | Gargoyle Gus | Sir Crumblemore |
| Neon Arcade | High Score Hank | The Glitch Lord |
| Subway Sketch | Ticket Taker | The Conductor |
| Desert Doodle | Scorpion Stan | Pharaoh Scrawl |
| Toxic Swamp | Toadstool Ted | The Bog Beast |
| Clock Tower | Cuckoo Clyde | Father Time |
| Candy Land | Gummy Bear Bob | The Candy King |
| Beach Doodle | Surfer Sid | King Crab |
| Rooftop Rumble | Pigeon Paul | The Night Hawk |
| Disco Doodle | DJ Scratch | Disco Devil |
| Jungle Temple | Temple Guard | The Stone Idol |
| Mirror Maze | Shard | The Mirror Queen |
| Pirate Ship | Powder Monkey | Captain Blackink |
| Power Plant | Spark Plug | Megawatt |
| Haunted Library | Bookworm Bill | The Librarian |
| Sky Islands | Cloud Kid | Thunderbird |
| Galaxy Core | Stardust | The Void |
| Pinball Palace | Flipper Fin | Pinball Wizard |
| Teleport Lab | Lab Rat | Dr. Warp |
| Windmill Farm | Angry Goat | Farmer Fury |
| Twister Valley | Dust Devil | The Cyclone |
| Honey Hive | Drone Bee | Queen Bee |
| Volcano Summit | Lava Lizard | Molten Monarch |
| Arctic Base | Ice Pick | Frost Giant |
| Big Top Circus | Strongman Sal | The Ringmaster |
| Sewer Tunnels | Sewer Gator | The Sewer King |
| Space Station | Robo Guard | Commander Nova |
| Gem Mine | Mole Miner | The Foreman |
| Bowling Alley | Gutter Ball | King Pin |
| Art Museum | Marble Statue | The Curator |
| Cheese Moon | Moon Rover | The Moon Mouse |
| Roller Coaster | Carnival Clown | The Coaster King |
| Flooded City | Crab Crusher | The Tide Titan |
| Bank Vault | Safe Cracker | The Mastermind |
| Snowball Fort | Abominable | The Snow Queen |
| Pizza Kitchen | Meatball Monster | Chef Supreme |
| Dino Valley | Raptor | The T-Rex |
| Zero-G Gym | Gym Bro | Coach Max |
| Mars Base | Martian Scout | The Martian Major |
| Crystal Cave | Crystal Bat | The Gem Golem |
| Toy Train Town | Wind-Up Soldier | The Conductor Bot |
| Monsoon Market | Market Thief | The Monsoon Monk |
| Junkyard | Junk Robot | The Scrap King |
| Cloud Kingdom | Storm Cloud | The Sky Sultan |
| Gumball Factory | Bubblegum Blob | The Gumball Goblin |
| Ninja Dojo | Shadow Ninja | The Shogun |
| Robot Arena | Battle Bot | The Bolt Baron |
| Ghost Ship | Ghost Deckhand | Captain Ghostly |
| Skate Park | Skater Punk | The Skate King |
| Frozen Waterfall | Icicle Imp | The Ice Titan |
| Tesla Tower | Coil Crawler | Doctor Volt |
| Donut Shop | Sprinkles | The Donut Duke |
| Meteor Crater | Rock Hopper | The Crater Colossus |
| Alien Jungle | Pod Person | The Spore Queen |
| Spooky Carnival | Creepy Clown | The Phantom Ringleader |
| Space Highway | Space Biker | The Road Warrior |
| Rainforest | Poison Frog | The Jungle Titan |
| Ice Palace | Ice Guard | The Frost Empress |
| Giant Bathtub | Rubber Duckzilla | The Kraken King |
| Star Observatory | Comet Imp | The Astronomer |
| Pirate Cove | Parrot Pirate | Captain Goldtooth |
| Fireworks Festival | Roman Candle | The Firework Fiend |
| Pyramid | Mummy Guard | The Pharaoh King |
| Candy Volcano | Candy Golem | The Gummy Giant |
| Atlantis | Angler Fish | The Sea Emperor |
| Bullet Train | Train Robber | The Bullet Baron |
| Autumn Forest | Hay Golem | The Harvest King |
| Glitch World | Pixel Bug | The Error King |
| Rock Concert | Roadie | The Rock Star |
| Black Hole Station | Space Squid | The Void Lord |
| Chocolate Factory | Gummy Worm | The Chocolatier |
| Mountain Peak | Snow Goat | The Mountain King |
| Neon Subway | Turnstile Bot | The Neon Ninja |
| Haunted Forest | Will-o-Wisp | The Headless Horseman |
| Asteroid Mine | Rock Mite | The Asteroid Golem |
| Beach Volleyball | Beach Crab | The Volley King |
| Castle Siege | Castle Archer | The Warlord |
| Dragon Lair | Kobold | The Elder Dragon |
| Sushi Bar | Tuna Terror | The Sushi Shogun |
| Wild West Town | Desperado | The Outlaw |
| Ice Cream Parlor | Sprinkle Sprite | The Sundae King |
| Coral Reef | Pufferfish | The Coral Queen |
| Space Port | Alien Tourist | The Starport Admiral |
| Magma Forge | Anvil Bot | The Forge Giant |
| Candy Clouds | Candy Bird | The Cotton Candy King |
| Thunder Peak | Thunder Imp | The Storm Titan |
| Lighthouse | Foghorn | The Lightkeeper |
| Hot Springs | Steam Sprite | The Onsen Ogre |
| Jungle River | Piranha | The River Serpent |
| Board Game | Dice Goblin | The Game Master |
| Bamboo Grove | Red Panda | The Panda King |
| Saturn Rings | Ice Chunk | The Ring Lord |
| Haunted Manor | Armor Ghost | The Count |
| Lava Express | Coal Golem | The Engineer |
| Gold Mine | Gold Digger | The Gold Baron |
| Music Hall | Piano Mimic | The Maestro |
| Arctic Sea | Sea Lion | The Ice Whale |
| Desert Oasis | Sand Scorpion | The Mirage |
| Treehouse | Squirrel Scout | The Tree King |
| Pixel Planet | Pixel Ghost | The Pixel King |
| Mushroom Forest | Spore Sprite | The Mushroom Monarch |
| Royal Palace | Palace Knight | The Royal Guard |

Plus **Ink Hydra**, a three-headed boss you meet in Story mode and Boss Rush.

**Wild bosses:** from stage 3 on, about 1 in 3 Arcade boss waves is crashed by a wild boss instead (the banner says **WILD BOSS!**). All of them are in Boss Rush too:

| Wild boss | Signature moves |
|---|---|
| Twister Tom | Tornadoes, triple charge |
| The Comet Queen | Meteor shower, lightning |
| Bubble Baron | Trapping bubbles, vortex |
| Cactus Colossus | Spike lines, triple quake |
| Rhino Rampage | Triple charge, spike lines, eraser sweep |
| The Omega Eraser | Almost every move in the game (shows up from stage 7) |
| Missile Major | Homing missiles, minefield, triple charge |
| Dynamo Duke | Minefield, lightning, spike lines |
| The Mummy | Burrow, tornadoes, shadow clones |
| Giga Golem | Triple quake, triple stomp, minefield |
| Captain Stormbeard | Homing missiles, meteor shower, boomerangs |
| The Ink Emperor | The ultimate boss: almost everything (shows up from stage 13, and is the final Boss Rush fight) |
| The Yeti King | Icefall, triple stomp, triple charge |
| The Phoenix | Lava rain, tornadoes, meteor shower |
| The Clown Prince | Shadow clones, boomerangs, minefield |
| Mecha Overlord | Laser walls, missiles, electrify, gravity well (shows up from stage 10) |
| The Space Pirate | Cannons, lava rain, missiles, gravity well (shows up from stage 11) |
| The Giant Robot Chef | Food fight, laser walls, missiles (shows up from stage 11) |
| The Blizzard Beast | Snowstorm, icefall, vortex (shows up from stage 12) |
| The Dino King | Triple quake, lava rain, snowstorm, triple stomp (shows up from stage 12) |
| The Alien Queen | Bee swarm, lava rain, laser walls, gravity well (shows up from stage 11) |
| The Candy Crusher | Gumball avalanche, food fight, triple quake (shows up from stage 11) |
| The Storm Dragon | Lightning, tornadoes, meteor shower, ink beam (shows up from stage 12) |
| The Grandmaster | Ninja star storm, shadow clones, teleport, snowstorm (shows up from stage 12) |
| The Mega Mech | Laser walls, missiles, cannons, electrify (shows up from stage 11) |
| The Phantom Pirate | Cannons, shadow clones, ink rain, pin rain (shows up from stage 11) |
| The Thunder King | Lightning, electrify, tornadoes, ink beam (shows up from stage 12) |
| The Hive Mind | Spore storm, bee swarm, shadow clones, meteors (shows up from stage 12) |
| The Nightmare Jester | Pin rain, shadow clones, fireworks show (shows up from stage 11) |
| The Glacier Queen | Icefall, snowstorm, laser walls, vortex (shows up from stage 11) |
| The Leviathan | Bubble storm, vortex, ink rain, triple quake (shows up from stage 12) |
| The Cosmic Emperor | Meteors, gravity well, fireworks show, ninja star storm (shows up from stage 12) |
| The Sphinx Titan | Sand blast, laser walls, triple quake (shows up from stage 11) |
| The Candy Tyrant | Gumball avalanche, food fight, shadow clones (shows up from stage 11) |
| The Glitch Dragon | Teleport, shadow clones, laser walls, electrify (shows up from stage 12) |
| The Event Horizon | Black hole, meteors, ninja star storm, acorn fall (shows up from stage 12) |
| The Candy Baron | Food fight, gumball avalanche, bubble storm (shows up from stage 11) |
| The Avalanche | Snowstorm, icefall, triple quake, vortex (shows up from stage 11) |
| The Siege Engine | Arrow storm, cannons, missiles (shows up from stage 12) |
| The Dragon Emperor | Ember storm, lightning, meteors, ink beam (shows up from stage 12) |
| The Ghost Sheriff | Triple charge, missiles, shadow clones, minefield (shows up from stage 11) |
| The Brain Freeze | Scoop storm, snowstorm, icefall, vortex (shows up from stage 11) |
| The Iron Colossus | Ember storm, laser walls, cannons, missiles (shows up from stage 12) |
| The Tempest King | Lightning, tornadoes, snowstorm, sushi roll (shows up from stage 12) |
| The Storm Kraken | Lightning, bubble storm, vortex, ink rain (shows up from stage 11) |
| The Lucky Seven | Dice roll, shadow clones, boomerangs, minefield (shows up from stage 11) |
| The Bamboo Warrior | Leaf storm, ninja star storm, shadow clones (shows up from stage 12) |
| The Phantom Conductor | Ember storm, triple charge, lightning, missiles (shows up from stage 12) |
| The Treasure Dragon | Coin shower, ember storm, meteors, ink beam (shows up from stage 11) |
| The Symphony Ghost | Note rain, shadow clones, laser walls (shows up from stage 11) |
| The Fungus Colossus | Spore storm, triple quake, vortex (shows up from stage 12) |
| The High King | Arrow storm, lightning, coin shower, note rain (shows up from stage 12) |

Boss moves: charge (dazed if it hits a wall), leap slam, ink barrage, **ink beam** (jump over it), **ink rain** (watch the red markers), **teleport slam**, **spin attack** (dizzy afterwards), **vortex** (pulls you in, then explodes), **shadow clones**, **eraser sweep** (a low dash across the floor: jump over it), **black hole** (pulls everyone toward it), **triple stomp**, **boomerangs** (they come back!), **triple quake** (three floor shockwaves to jump) **burrow** (digs underground and bursts up under you: watch the dirt mound), **lightning call** (bolts strike the flashing lines), **laser wall** (laser beams sweep across the arena: jump or get off the platform), **tornado** (a twister that bounces between the walls), **meteor shower** (flaming meteors fall at an angle), **trapping bubbles** (get caught and you are stuck for a moment), **spike line** (crystal spikes erupt along the floor toward you: watch the dust) and **triple charge** (charges, turns around at the wall and charges again, three times, then gets dazed), **homing missiles** (they chase you: keep moving), **minefield** (bombs drop where you stand and blow up a moment later), **cannon volley** (red X marks, then cannonballs) **electrify** (the whole floor zaps: get up on a platform), **book storm** (flying books from both sides) **gravity well** (pulls everyone toward the boss: dash out) **bee swarm** (homing bees chase you), **lava rain** (lava rocks fall on the red X marks), **icefall** (icicles drop on the red X marks), **snowstorm** (giant snowballs fall on the red X marks), **food fight** (pizza toppings rain down on the red X marks), **gumball avalanche** (gumballs bounce down on the red X marks), **ninja star storm** (ninja stars drop on the red X marks), **spore storm** (alien spores float down on the red X marks), **pin rain** (juggling pins fall on the red X marks), **bubble storm** (big bubbles float down on the red X marks), **fireworks show** (fireworks rain down on the red X marks), **sand blast** (sand blocks fall on the red X marks), **acorn fall** (acorns drop on the red X marks), **arrow storm** (arrows rain on the red X marks), **ember storm** (dragon embers fall on the red X marks), **scoop storm** (ice cream scoops fall on the red X marks), **sushi roll** (sushi rains on the red X marks), **dice roll** (giant dice fall on the red X marks), **leaf storm** (spinning leaves fall on the red X marks), **coin shower** (gold coins fall on the red X marks) and **note rain** (music notes fall on the red X marks).

## Power-ups

Enemies drop them, and **mystery boxes** fall from the sky during fights.

| Power-up | Effect |
|---|---|
| Heart | +30 health |
| Ink jar | +50 special meter |
| Pencil Blade | Longer reach, 1.5x damage |
| Hyper Speed | Faster movement and attacks |
| Shield | Blocks the next 3 hits |
| Mega Size (XL) | Grow 1.5x bigger, 1.4x damage |
| Fire Ink | Your hits set enemies on fire |
| Freeze | Freezes every enemy on screen |
| Star | Invincible for 8 seconds; touching enemies hurts them |
| Ink Bomb | Big explosion around you |
| Doodle Drone | A little helper that shoots the nearest enemy |
| Ink Clone | A shadow copy behind you copies your attacks and guards your back |
| Tornado | A whirlwind that roams the floor, pulling in and hitting enemies |
| Storm Cloud | A cloud follows you and zaps the nearest enemy with lightning |
| Regeneration | Steadily heals you for 10 seconds |
| Double Damage | Your hits deal 2x damage |
| Rocket Boots | Unlimited jumps and air dashes |
| Ink Magnet | Pulls every power-up on screen toward you |
| Ink Mines | Drops 3 mines that blow up when enemies step near |
| Thorn Armor | Enemies that hit you take damage back |
| Mega Hammer | Heavy attacks send shockwaves along the floor |
| Slow-Mo Clock | Enemies move at half speed for 8 seconds (in Versus it slows your opponent) |
| Shrink Ray | Regular enemies shrink and hit half as hard (in Versus it shrinks your opponent) |
| Lucky Clover | 40% of your hits become 1.5x crits, and enemies drop more power-ups |
| Ink Turret | Places a turret that shoots the nearest enemy |
| Vampire Fangs | Heals you for a quarter of the damage you deal |
| Invisibility | Enemies can't find you for 8 seconds |
| Pocket Black Hole | A black hole that sucks in and damages enemies |
| Healing Aura | Heals you and a nearby partner for 8 seconds |
| Jetpack | Hold jump to fly for 12 seconds |
| Ink Decoy | A cardboard copy of you that every enemy chases instead of you |
| Meteor Call | Meteors rain down on the enemies |
| Lightning Rod | Lightning strikes the nearest enemy every second or so (10 s) |
| Moon Boots | 2 extra jumps and higher jumps (12 s) |
| Mirror Shield | Enemy shots bounce back at double damage (10 s) |
| Earthquake | Hits every enemy standing on the ground |
| Piñata | Bursts into 4 random power-ups |
| Zero-G Bomb | Launches every enemy into the air |
| Medkit | Heals the team 50 HP and revives a downed partner |
| Super Ink | Fills everyone's ink meter: time for a super move! |
| Spike Ball | A spiky ball that bounces around the arena hitting enemies (8 s) |
| Banana Peels | Drops 3 peels; enemies that step on them slip and fall |
| Max HP Up | +20 max health until you go down (up to +60) |
| Boxing Glove | Hits deal 25% more damage and send enemies flying (10 s) |
| Fireworks | 8 homing firework rockets |
| Quake Boots | Every landing sends out shockwaves (10 s) |
| Orbit Shield | Three orbs circle you and smack enemies they touch (10 s) |
| Chain Lightning | Lightning jumps between up to 6 enemies |
| Ink Storm | Ink rain hurts every enemy for 6 seconds |
| Bubble Shield | Blocks the next hit completely and traps whoever hit you |
| Gold Star | Double points for 15 seconds |
| Power Fist | Your next 6 hits do extra damage and send enemies flying |
| Feather | Float (hold jump) and get an extra jump (12 s) |
| Dash Blades | Your dashes slice through enemies (12 s) |
| Hot Floor | The floor burns every enemy standing on it (6 s) |
| Thunderstorm | 10 lightning bolts strike your enemies one after another |
| Fire Trail | Running leaves burning flames behind you (10 s) |
| Iron Skin | Take half damage (10 s) |
| Bee Hive | Plants a hive that keeps sending homing bees |
| Mega Laser | A huge laser beam across the screen |
| Boomerang Buddy | Throws a boomerang at the nearest enemy every second (10 s) |
| Ink Tidal Wave | Three giant ink waves both ways |
| Piggy Bank | +5000 points |
| Super Heal | Full health |
| Blizzard | Freezes and hurts every enemy |
| Shockwave | A big blast all around you |
| Rocket Barrage | Six rockets at once |
| Escape Rope | Teleports you to the safest spot |
| Spike Strip | Spikes burst across the whole floor |
| Magic Wand | Your next 8 attacks also shoot a homing magic star |
| Healing Rain | Heals the team a little at a time (6 s) |
| Pumpkin Bomb | A big exploding pumpkin |
| Starfall | Stars rain down on the enemies |
| Team Shield | 2-hit shield for everyone |
| Ink Fountain | Your ink meter fills up fast (8 s) |
| Twin Tornadoes | Two tornadoes, one each way |
| Snowball Fight | 12 snowballs at once |
| Banana Rain | Banana peels fall on the enemies |
| Laser Ring | Lasers shoot out in every direction |
| Sunbeam | Beams of sunlight strike the 3 closest enemies |
| Earth Spikes | Spikes burst up under every enemy |
| Ice Cage | Traps every enemy in ice |
| Whirlwind | A spinning wind hurts everything near you (5 s) |
| Dragon Breath | Breathe fire forward (5 s) |
| Megaton Bomb | A gigantic explosion |
| Rainbow Mode | Invincible and extra ink |
| Saw Blades | Three boomerang saw blades |
| Pogo Stick | Bounce on every landing and stomp enemies (10 s) |
| Sniper Shot | One huge piercing shot at the nearest enemy |
| Acid Rain | Acid rain hurts every enemy (6 s) |
| Implosion | Pulls enemies together, then blows them up |
| Decoy Bomb | A decoy of you that explodes |
| Sonic Boom | Three sonic waves both ways |
| Freeze Ray | An ice beam that freezes everything in a line |
| Air Strike | Rockets rain down on the enemies |
| Boulder Roll | A giant rolling boulder |
| Comet Crash | Three comets slam into enemies |
| Ground Pound | An earthquake hits every grounded enemy |
| Bubble Trap | Five trapping bubbles |
| Party Popper | A ring of colorful sparks |
| Chain Lightning | Lightning jumps between the 5 nearest enemies |
| Honey Pot | Sticky honey freezes nearby enemies |
| Surprise Gift | Drops 2 random power-ups |
| Boomerang Blitz | Four boomerangs that fly back |
| Giant Fist | A huge piercing punch |
| Mini Gun | Rapid-fire bullets (4 s) |
| Flame Ring | A ring of burning fireballs |
| Tidal Wave | Big waves both ways along the floor |
| Cupcake Party | Heals your whole team |
| Magic Mirror | Bounces every enemy shot back at them |
| Cluster Bomb | Five bombs in an arc |
| Ghost Squad | Six homing ghosts |
| Shark Attack | Sharks zoom both ways along the floor |
| Dodgeballs | Six dodgeballs in a spread |
| Ninja Stars | Eight throwing stars both ways |
| Lava Boots | Leave burning lava wherever you run (6 s) |
| Rocket Boots | Blast up high and launch nearby enemies |
| Hailstorm | Hailstones rain down on the enemies |
| Piano Drop | A piano falls on the nearest enemy |
| Anvils | Three anvils drop on enemies |
| Glitter Bomb | A sparkly bomb that also freezes enemies |
| Rubber Ducks | Five bouncy rubber ducks |
| Paper Planes | Five homing paper planes |
| Toxic Cloud | Floating clouds that hurt enemies inside them |
| Vine Whip | A line of vines bursts from the floor |
| Star Beam | A powerful beam of starlight |
| Spider Web | Traps every nearby enemy |
| Quake Hammer | A big earthquake that stuns |
| Robot Pal | A little turret that shoots for you |
| Supercharge | Full ink meter plus Hyper Speed |
| Thunderclap | A burst that hits and stuns nearby enemies |
| Bubble Bath | Heals the team and blows trapping bubbles |
| Laser Drill | Three piercing laser blasts |
| Meteor Shower | Meteors rain down on enemies |
| Stink Bomb | Freezes nearby enemies in a smelly cloud |
| Water Balloons | Six splashing water balloons |
| Snow Globe | Freezes every enemy |
| Sledgehammer | One giant smash in front of you |
| Jelly Rain | Jelly blobs rain on the enemies |
| Laser Blade | Two huge laser slashes both ways |
| Confetti Bomb | A big party bomb |
| Wormhole | Launches nearby enemies into the air |
| Rainbow Bridge | Rainbow lasers both ways |
| Cheese Wheel | A giant rolling cheese wheel |
| Fish Slap | Slaps nearby enemies far away |
| Bubblegum | Four sticky trapping bubbles |
| Popcorn | Popcorn bursts everywhere |
| Ice Cubes | Freezes enemies in front of you |
| Drum Roll | A quake plus sound waves |
| Pillow Fight | Five fluffy pillows |
| Plunger Pull | Yanks the 4 nearest enemies to you |
| Yo-Yo Blast | Two yo-yos that fly back |
| Magnet Pull | Pulls every enemy toward you |
| Ghost Light | Heals the team and turns you invisible |
| Star Blast | A ring of stars |
| Giga Gloves | A huge flying punch |
| Lava Lamp | Burning lava blobs rain down |
| Trampoline | Bounce high and launch grounded enemies |
| Bowling Pins | Five flying bowling pins |
| Spaceship | A UFO zaps the 3 nearest enemies |
| Dragon Egg | Hatches into a ring of fireballs |
| Thunder Hammer | Lightning strikes plus a small quake |
| Slime Ball | Three sticky trapping slime balls |
| Crystal Shards | Five piercing crystal shards |
| Firecrackers | Six popping firecrackers |
| Frost Storm | Freezes enemies and drops icicles |
| Golden Coin | Big score, half an ink meter and a small heal |
| Heart Burst | Heals your whole team a lot |
| Shadow Clone | Turn invisible and strike twice |
| Sand Wave | Sand waves both ways along the floor |
| Mushroom Bomb | A huge explosion |
| Big Bell | A loud gong that stuns nearby enemies |
| Tornado Trap | Twin tornadoes |
| Rocket Fist | A piercing rocket punch |
| Sparkler | A spray of sparks |
| Moon Beam | A beam that freezes enemies in a line |
| Catapult | Launches three boulders |
| Frost Breath | Icy breath that freezes enemies in front |
| Honeycomb | Eight homing bees |
| Pinballs | Four bouncing pinballs |
| Jack-in-the-Box | Launches nearby enemies sky-high |
| Tumbleweed | Rolling tumbleweeds both ways |
| Snow Plow | Shoves and freezes enemies in front |
| Laser Pointer | A huge zap on the nearest enemy |
| Gummy Bears | A spray of gummy bears |
| Big Wave | One giant wave both ways |
| Meteor Hammer | A giant meteor on the nearest enemy |
| Comet Shower | Comets rain on the enemies |
| Ball Lightning | A slow ball of lightning that zaps everything it touches |
| Thorn Vines | Thorns burst up under enemies |
| Tea Party | Heals the team and adds ink |
| Zap Gun | Five quick zaps |
| Soap Bubbles | A ring of trapping bubbles |
| Acorn Storm | Acorns rain on the enemies |
| Ink Bomb | A bomb that also freezes enemies |
| Jet Stream | Blows enemies away as you zoom forward |
| Hot Sauce | Fire Ink power plus a small heal |
| Boomerang Bat | A big bat that flies back |
| Lava Burst | Lava spikes burst around you |
| Crystal Ball | Six homing magic orbs |
| Pumpkin Patch | Four exploding pumpkins |
| Rubber Band | Snaps the 3 nearest enemies away |
| Snow Cone | Heals the team and freezes nearby enemies |
| Thunder Drum | Lightning strikes |
| Magic Beans | Beanstalks burst up under enemies |
| Pirate Cannon | Three cannonballs |
| Gear Storm | A ring of spinning gears |
| Rainbow Blast | Six rainbow bolts |
| Puddle Jump | Jump high and splash a wave |
| Tide Pool | Heals the team and sends waves |
| Confetti Rain | Confetti rains on the enemies |
| Sunflower | Heals the team and shoots sun bolts |
| Banana Bunch | Four boomerang bananas |
| Windmill Spin | Spin and smash nearby enemies |
| Ice Nova | Freezes nearby enemies with ice shards |
| Stardust | Fills ink and scatters sparkles |
| Bouncy Ball | A giant bouncing ball |
| Cyclone | A big tornado rolls forward |
| Ice Arrow | A piercing arrow that freezes |
| Storm Cloud | Lightning strikes |
| Squirt Gun | A stream of water |
| Donut | Heals your whole team |
| Chili Pepper | Spicy fire breath |
| Fireflies | Six homing fireflies |
| Lantern | Heal, turn invisible and flash nearby enemies |
| Pinwheel | Spinning pinwheels that fly back |
| Maracas | Shake and stun nearby enemies |
| Trumpet | A huge sound wave both ways |
| Kazoo | Freezes nearby enemies |
| Cymbals | A crash that stuns enemies right next to you |
| Tambourine | A ring of sound |
| Glow Sticks | Five glowing lasers |
| Yarn Ball | A rolling yarn ball that tangles enemies |
| Snowman Pal | A snowman turret that shoots for you |
| Cupcake Bomb | A sweet explosion plus a small heal |
| Magma Lamp | A ring of burning lava blobs |
| Waffle | Heals the team and adds ink |
| Pogo Ball | Bounce up and launch nearby enemies |
| Whoopee Cushion | Stuns and pushes nearby enemies |
| Lollipop | A giant lollipop plus a small heal |
| Slingshot | Three fast stones |
| Boombox | A sound wave plus a small quake |
| Snowboard | Zoom forward and knock enemies over |
| Tornado Ball | A tornado rolls forward |
| Honey Jar | Heals the team and freezes nearby enemies |
| Starfish | Two boomerang starfish |
| Geyser | Water geysers burst under enemies |
| Magic Staff | Five homing magic bolts |
| Crystal Rain | Crystals rain on the enemies |
| Shock Ring | A ring of zaps |
| Jelly Beans | Jelly beans burst everywhere |
| Frisbee | A frisbee that flies back |
| Pretzel | Heals the team and gives you a shield |
| Marbles | Slippery marbles that trip enemies |
| Hourglass | Freezes every enemy |
| Bubble Guard | Shields your whole team |
| Pizza Slice | Heals your whole team |
| Balloon Pop | Balloons drop and pop on enemies |
| Sandcastle | Team shield plus sand walls |
| Umbrella | Shield yourself and wipe out nearby enemy shots |
| Comet | A giant comet on the nearest enemy |
| Laser Sword | One big laser slash in front |
| Bubble Wand | Six trapping bubbles |
| Rocket Pack | Blast up high and spray fire |
| Spinning Top | A spinning top that rolls through enemies |
| Mega Yo-Yo | A giant yo-yo that flies back |
| Battle Kite | Two boomerang kites |
| War Drum | An earthquake |
| Bellows | Blows enemies far away |
| Flashlight | Freezes enemies in front |
| Compass | Arrows in every direction |
| Telescope | A big lightning strike on the nearest enemy |
| Magnifying Glass | A stream of piercing sun beams |
| Blizzard Globe | Freezes nearby enemies and drops snowballs |
| Gold Trophy | Big score and a full ink meter |
| Paper Squadron | Five homing paper planes |
| Mystery box | A random power-up |

## Features

- **Co-op mechanics:** hit an enemy your partner just hit for a **TEAM COMBO x2**. Stand next to a downed partner to **revive** them. When both ink meters are full and you're standing close, press Special to fire the **DOUBLE INK** screen-clearing team super.
- **Combat:** combo chains, juggles, launcher into jump-cancel into air attacks, dash cancels, wall splats, and **projectile reflects**. Hit-stop, screen shake, slow-mo finishers and controller rumble give every hit weight.
- **Enemies:** Grunts, Ninjas, Eraser-Throwers, armored Brutes with shockwave slams, and a two-phase boss, **The Scribble King**, every 5th wave.
- **Endless:** after stage 16 the stages loop and the waves keep getting harder.
- **Audio:** procedural soundtrack and sound effects, all synthesized live with Web Audio.
- **Saved high score:** your best team score is kept between sessions.
