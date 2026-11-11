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
| Special (full ink meter) | I | A |
| Pause | Esc / P | + (or −) |
| Music on/off | M | (none) |

### Nintendo Switch controllers

- **Pro Controller** and **Joy-Con pairs** work automatically in Chrome and Edge.
- **A single Joy-Con held sideways** works too, so two friends can each grab one Joy-Con.
- Controllers that report a raw layout or a "hat" D-pad (common in other browsers) are handled.
- If any button does the wrong thing, open **Controller Setup** from the title screen (press **C** or **−**) and press the button you want for each action. Your layout is saved.

## Fighters

Twelve fighters, each with their own stats, look and special move:

| Fighter | Style | Special |
|---|---|---|
| Scribble | All-rounder | Ink Burst: blasts everything around you |
| Bolt | Speedster, triple jump, fragile | Thunderclap: lightning hits 8 foes |
| Boulder | Tank, heavy attacks can't be interrupted | Earthquake: hits every grounded foe |
| Inkblade | Always holds the Pencil Blade | Crescent Slash: giant piercing slashes |
| Doodle Witch | Ranged, heavy attack fires ink bolts | Meteor Rain |
| Shade | Ninja, 2 air dashes, 1.5x crits from behind | Shadow Strike: teleports through 6 foes |
| Robo | Robot, heavy attack fires piercing lasers, takes 20% less damage | Mega Laser across the screen |
| Halo | Healer, slowly regenerates health | Healing Light: heals the team and revives a downed partner |
| Slugger | Swings a bat, heavy hits send foes flying, wall splats hurt extra | Fastball Fury |
| Hopper | Four jumps, huge leap, extra-wide Meteor Slam | Mega Stomp shakes the whole floor |
| Whiskers | Cat-quick, attacks 30% faster | Claw Storm shreds everything in front |
| Chef | Heavy attack throws a boomerang frying pan | Food Fight: a barrage of pies |

## Modes

- **Story:** pick a starting stage (or a random one) and fight wave after wave.
- **Boss Rush:** fight all 12 mini-bosses and bosses back to back against the clock. You heal a little and get 2 power-ups between rounds, and your best time is saved.

## Stages

Six stages of five waves each, and each one ends with its own boss:
Notebook Heights (The Scribble King), Graph City (Graphzilla), Chalkboard Arena (Professor Chalk), Sticky Note Jungle (The Sticky Bandit), Blueprint Factory (Blueprint Golem, with moving platforms) and Midnight Sketchbook (The Midnight Smudge, with moving platforms).

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

Boss moves: charge (dazed if it hits a wall), leap slam, ink barrage, **ink beam** (jump over it), **ink rain** (watch the red markers), **teleport slam**, **spin attack** (dizzy afterwards), **vortex** (pulls you in, then explodes) and **shadow clones**.

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
| Mystery box | A random power-up |

## Features

- **Co-op mechanics:** hit an enemy your partner just hit for a **TEAM COMBO x2**. Stand next to a downed partner to **revive** them. When both ink meters are full and you're standing close, press Special to fire the **DOUBLE INK** screen-clearing team super.
- **Combat:** combo chains, juggles, launcher into jump-cancel into air attacks, dash cancels, wall splats, and **projectile reflects**. Hit-stop, screen shake, slow-mo finishers and controller rumble give every hit weight.
- **Enemies:** Grunts, Ninjas, Eraser-Throwers, armored Brutes with shockwave slams, and a two-phase boss, **The Scribble King**, every 5th wave.
- **Endless:** after stage 6 the stages loop and the waves keep getting harder.
- **Audio:** procedural soundtrack and sound effects, all synthesized live with Web Audio.
- **Saved high score:** your best team score is kept between sessions.
