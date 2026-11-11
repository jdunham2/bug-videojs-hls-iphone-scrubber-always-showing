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

## Fighters

Seventy-eight fighters, each with their own stats, look, special move and a **unique skill** on Down + Light (S + J on keyboard, Down + Y on a controller) with a 2.5-second cooldown. The skill name and cooldown show in the HUD next to your score.

**Super moves:** with a full ink meter, hold Up and press Special (W + I, or Up + A on a controller) for your fighter's screen-shaking super move, with a cinematic cut-in. **Scribble:** Ink Tsunami · **Bolt:** Storm Surge · **Boulder:** Meteor Slam · **Inkblade:** Thousand Blades · **Doodle Witch:** Hex Storm · **Shade:** Shadow Dance · **Robo:** Orbital Laser · **Halo:** Sanctuary · **Slugger:** Grand Slam · **Hopper:** Leap Frog · **Whiskers:** Nine Lives · **Chef:** Feast · **Frosty:** Absolute Zero · **Ghostly:** Poltergeist · **DJ Beats:** Subwoofer · **Sir Doodle:** Excalibur · **Bubbles:** Bubble Prison · **Jetpack Jo:** Carpet Bomb · **Presto:** Grand Finale · **El Doodlo:** Piledriver · **Mimic:** Copycat (a random super) · **Blaze:** Supernova · **Captain Ink:** Full Broadside · **Gravity Gus:** Singularity · **Gemma:** Diamond Storm · **Kickflip Kai:** 900 Spin · **Buzzy Bea:** Killer Swarm · **Samurai Sam:** Final Cut · **Echo:** Echo Chamber · **Dynamite Dan:** Nuke · **Picasso Pip:** Mural · **Yoyo Yuki:** Yoyo Storm · **Cactus Carl:** Needle Nova · **Fairy Fern:** Fairy Ring · **Viking Vera:** Valhalla · **Dr. Goo:** Goo-pocalypse · **Digger Dax:** Earth Shatter · **Astro Ace:** Big Bang · **Chrono Claire:** Time Fracture · **Lucky Lou:** All In · **Magnet Max:** Super Magnet · **Boxer Bruno:** Knockout · **Archer Anna:** Storm of Arrows · **Dragon Drew:** Dragon Form · **Balloon Billie:** Water Park · **Robo Rex:** Extinction · **Paper Pia:** Origami Dragon · **Nova Nick:** Nova Blast · **Gardener Gil:** Jungle Fury · **Builder Bob:** Demolition · **Wizard Wally:** Armageddon · **Vampire Vlad:** Nightfall · **Clown Cleo:** Big Top · **Webby:** Spider Storm · **Tank Tina:** Shock and Awe · **Luna:** Full Moon · **Magma Marv:** Volcano · **Glitch Gabe:** Blue Screen · **Pirate Peg:** Kraken Call · **Ninja Neko:** Nine Tails · **Cowgirl Cassie:** High Noon · **Robo Pup:** Good Boy · **Ice Skater Ivy:** Blizzard Ballet · **Gladiator Gia:** Colosseum · **Alien Zorp:** Mothership · **Mermaid Maren:** Ocean's Wrath · **Rockstar Roxy:** Sold Out Show · **Zombie Zed:** Apocalypse · **Baker Benny:** Bake Off · **Lumberjack Lars:** Forest Fury · **Firefighter Finn:** Rescue · **Detective Dot:** Elementary · **Mecha Mika:** Mecha Mode · **Genie Geo:** Grand Wish · **Sumo Sato:** Yokozuna · **Mime Mimi:** Silent Show · **Butterfly Bella:** Metamorphosis · **King Kongo:** Jungle King.

**Unlocking fighters:** you start with the first 20 fighters (Scribble to Mimic). Every Story chapter you beat unlocks the next 3 (24 in all). The last 4 are **challenge fighters**: Balloon Billie (defeat 10 bosses), Robo Rex (reach wave 20 in Arcade), Paper Pia (win 2 Versus matches) and Nova Nick (clear Boss Rush or defeat 40 bosses). The 10 newest are challenge fighters too: Gardener Gil (defeat 100 enemies), Builder Bob (use 5 super moves), Wizard Wally (collect 20 power-ups), Vampire Vlad (reach Arcade wave 10), Clown Cleo (win a Versus match), Webby (defeat 20 bosses), Tank Tina (defeat 300 enemies), Luna (use 20 super moves), Magma Marv (beat Story mode) and Glitch Gabe (reach Arcade wave 30). Of the 20 newest fighters, 10 are unlocked right away (Pirate Peg, Ninja Neko, Cowgirl Cassie, Robo Pup, Ice Skater Ivy, Gladiator Gia, Alien Zorp, Mermaid Maren, Rockstar Roxy and Zombie Zed) and 10 are tough challenge fighters: Baker Benny (500 enemies), Lumberjack Lars (30 bosses), Firefighter Finn (50 power-ups), Detective Dot (3 Versus wins), Mecha Mika (40 supers), Genie Geo (Arcade wave 40), Sumo Sato (1000 enemies), Mime Mimi (50 bosses), Butterfly Bella (5 Versus wins) and King Kongo (clear Boss Rush). Your progress toward each challenge shows on the select screen, which scrolls when you move past the bottom row. Locked fighters show as a padlock on the select screen with the chapter that unlocks them. Progress is saved in your browser. In online play, the host's unlocks are used.

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
| Sir Doodle | Knight: hold DOWN to block attacks from the front; heavy attack is a charging lance | Royal Whirl: a spinning blade attack | Shield Bash: charging bash that raises a 1-hit guard |

## Modes

After picking fighters you choose a mode:

- **Story:** an 8-chapter adventure to stop **the Grand Eraser**, who wants to wipe the whole notebook clean. Each chapter has a wave of enemies, a mini-boss and a boss, with comic-style cutscenes before the chapter, before the boss and after you win, plus an ending. Press J / A to advance the text, Enter / + to skip a scene. Progress is saved, and you can replay any chapter you've reached.
- **Arcade:** endless waves of enemies. Pick a starting stage, or a random one.
- **Boss Rush:** fight all 69 mini-bosses and bosses back to back against the clock. You heal a little and get 2 power-ups between rounds, and your best time is saved.
- **Versus:** P1 vs P2 on any stage. Best of 3 rounds, 99 seconds per round (if time runs out, whoever has more health wins the round). Mystery boxes still fall, so power-ups are in play. Needs both players.

All modes work online.

## Stages

Twenty-eight stages of five waves each: Notebook Heights, Graph City, Chalkboard Arena, Sticky Note Jungle, Blueprint Factory (moving platforms), Midnight Sketchbook (moving platforms), Crayon Canyon (bobbing platforms), Comic Panels, Lava Doodle (lava geysers erupt from the floor: watch for the glowing warning circles; geysers hurt enemies too), Ice Rink (slippery floor), Space Doodle (low gravity), Windy Worksheet (wind gusts push everyone sideways after a warning), The Blank Page (home of the final boss), Toy Box (bouncy springs launch you into the air), Haunted Sketch (the lights go out and only spotlights around the players remain; enemy eyes glow in the dark) Assembly Line (floor conveyor belts that reverse direction after a warning), **Storm Sketch** (lightning strikes where the flashing yellow lines appear; it hits enemies too), **Deep Sea Doodle** (underwater: you sink slowly and can tap jump to swim up), **Crumbling Castle** (cracked platforms collapse if you stand on them too long, then rebuild) **Neon Arcade** (laser beams sweep across the floor or the platforms after a warning: jump over the floor ones), **Subway Sketch** (a train roars along the floor after a warning: get up on a platform!), **Desert Doodle** (quicksand pits slow you down and weaken your jumps), **Toxic Swamp** (glowing green puddles appear and hurt anyone standing in them) **Clock Tower** (a giant pendulum swings through the middle of the arena), **Candy Land** (giant gumballs come bouncing across the floor after a warning), **Beach Doodle** (high tide washes over the floor and pushes everyone sideways), **Rooftop Rumble** (two gaps in the roof: fall in and you lose 12 HP and drop back in from the top) and **Disco Doodle** (three dance floor tiles flash red, then zap anyone standing on them).

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

Boss moves: charge (dazed if it hits a wall), leap slam, ink barrage, **ink beam** (jump over it), **ink rain** (watch the red markers), **teleport slam**, **spin attack** (dizzy afterwards), **vortex** (pulls you in, then explodes), **shadow clones**, **eraser sweep** (a low dash across the floor: jump over it), **black hole** (pulls everyone toward it), **triple stomp**, **boomerangs** (they come back!), **triple quake** (three floor shockwaves to jump) **burrow** (digs underground and bursts up under you: watch the dirt mound), **lightning call** (bolts strike the flashing lines), **laser wall** (laser beams sweep across the arena: jump or get off the platform), **tornado** (a twister that bounces between the walls), **meteor shower** (flaming meteors fall at an angle), **trapping bubbles** (get caught and you are stuck for a moment), **spike line** (crystal spikes erupt along the floor toward you: watch the dust) and **triple charge** (charges, turns around at the wall and charges again, three times, then gets dazed), **homing missiles** (they chase you: keep moving) and **minefield** (bombs drop where you stand and blow up a moment later).

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
| Mystery box | A random power-up |

## Features

- **Co-op mechanics:** hit an enemy your partner just hit for a **TEAM COMBO x2**. Stand next to a downed partner to **revive** them. When both ink meters are full and you're standing close, press Special to fire the **DOUBLE INK** screen-clearing team super.
- **Combat:** combo chains, juggles, launcher into jump-cancel into air attacks, dash cancels, wall splats, and **projectile reflects**. Hit-stop, screen shake, slow-mo finishers and controller rumble give every hit weight.
- **Enemies:** Grunts, Ninjas, Eraser-Throwers, armored Brutes with shockwave slams, and a two-phase boss, **The Scribble King**, every 5th wave.
- **Endless:** after stage 16 the stages loop and the waves keep getting harder.
- **Audio:** procedural soundtrack and sound effects, all synthesized live with Web Audio.
- **Saved high score:** your best team score is kept between sessions.
