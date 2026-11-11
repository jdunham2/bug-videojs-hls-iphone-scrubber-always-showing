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
|---|---|---|---|
| Move | W A S D | Left stick / D-pad |
| Jump (double jump) | L (or Space) | B |
| Light attack (3-hit chain) | J | Y |
| Heavy attack | K | X |
| Launcher | W + K | Up + X |
| Meteor slam | K in the air | X in the air |
| Dash (invincible) | U (or Shift) | ZR / R / ZL / L |
| Unique skill (2.5 s cooldown) | S + J | Down + Y |
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

Thirty-two fighters, each with their own stats, look, special move and a **unique skill** on Down + Light (S + J on keyboard, Down + Y on a controller) with a 2.5-second cooldown. The skill name and cooldown show in the HUD next to your score.

**Unlocking fighters:** you start with the first 8 fighters (Scribble to Halo). Every Story chapter you beat unlocks the next 3, so beating all 8 chapters unlocks all 32. Locked fighters show as a padlock on the select screen with the chapter that unlocks them. Progress is saved in your browser. In online play, the host's unlocks are used.

| Fighter | Style | Special | Skill (Down + Light) |
|---|---|---|---|
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
| Sir Doodle | Knight: hold DOWN to block attacks from the front; heavy attack is a charging lance | Royal Whirl: a spinning blade attack | Shield Bash: charging bash that raises a 1-hit guard |

## Modes

After picking fighters you choose a mode:

- **Story:** an 8-chapter adventure to stop **the Grand Eraser**, who wants to wipe the whole notebook clean. Each chapter has a wave of enemies, a mini-boss and a boss, with comic-style cutscenes before the chapter, before the boss and after you win, plus an ending. Press J / A to advance the text, Enter / + to skip a scene. Progress is saved, and you can replay any chapter you've reached.
- **Arcade:** endless waves of enemies. Pick a starting stage, or a random one.
- **Boss Rush:** fight all 33 mini-bosses and bosses back to back against the clock. You heal a little and get 2 power-ups between rounds, and your best time is saved.
- **Versus:** P1 vs P2 on any stage. Best of 3 rounds, 99 seconds per round (if time runs out, whoever has more health wins the round). Mystery boxes still fall, so power-ups are in play. Needs both players.

All modes work online.

## Stages

Sixteen stages of five waves each: Notebook Heights, Graph City, Chalkboard Arena, Sticky Note Jungle, Blueprint Factory (moving platforms), Midnight Sketchbook (moving platforms), Crayon Canyon (bobbing platforms), Comic Panels, Lava Doodle (lava geysers erupt from the floor: watch for the glowing warning circles; geysers hurt enemies too), Ice Rink (slippery floor), Space Doodle (low gravity) Windy Worksheet (wind gusts push everyone sideways after a warning) The Blank Page (home of the final boss), Toy Box (bouncy springs launch you into the air), Haunted Sketch (the lights go out and only spotlights around the players remain; enemy eyes glow in the dark) and Assembly Line (floor conveyor belts that reverse direction after a warning).

## Bosses

Every stage has a mini-boss on wave 3 and a boss on wave 5, and each one has its own set of moves:

| Stage | Mini-boss | Boss |
|---|---|---|---|
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

Plus **Ink Hydra**, a three-headed boss you meet in Story mode and Boss Rush.

Boss moves: charge (dazed if it hits a wall), leap slam, ink barrage, **ink beam** (jump over it), **ink rain** (watch the red markers), **teleport slam**, **spin attack** (dizzy afterwards), **vortex** (pulls you in, then explodes), **shadow clones**, **eraser sweep** (a low dash across the floor: jump over it), **black hole** (pulls everyone toward it), **triple stomp**, **boomerangs** (they come back!), **triple quake** (three floor shockwaves to jump) and **burrow** (digs underground and bursts up under you: watch the dirt mound).

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
| Mystery box | A random power-up |

## Features

- **Co-op mechanics:** hit an enemy your partner just hit for a **TEAM COMBO x2**. Stand next to a downed partner to **revive** them. When both ink meters are full and you're standing close, press Special to fire the **DOUBLE INK** screen-clearing team super.
- **Combat:** combo chains, juggles, launcher into jump-cancel into air attacks, dash cancels, wall splats, and **projectile reflects**. Hit-stop, screen shake, slow-mo finishers and controller rumble give every hit weight.
- **Enemies:** Grunts, Ninjas, Eraser-Throwers, armored Brutes with shockwave slams, and a two-phase boss, **The Scribble King**, every 5th wave.
- **Endless:** after stage 16 the stages loop and the waves keep getting harder.
- **Audio:** procedural soundtrack and sound effects, all synthesized live with Web Audio.
- **Saved high score:** your best team score is kept between sessions.
