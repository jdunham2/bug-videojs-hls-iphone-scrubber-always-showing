# Pinecone Prowler — roadmap

An original cozy stealth game: you are **Moss**, a shy forest giant raiding Hollowpine Campground for snacks while a developer, **Gideon Grube**, plans to pave it into a resort. Single file: `index.html` (HTML + canvas + vanilla JS, no build step). `window.__pp` exposes game state for headless testing.

## Done — Slice 1: core loop
- Top-down open world: den, forest, lake, 5 campsites, Snack Shack, Ranger Station
- Stealth: vision cones, line of sight, suspicion, bushes, noisy sprinting
- Ranger AI (patrol → investigate → chase → search); caught = drop backpack, sent home
- Raiding coolers, baskets, bins; backpack, hunger, stamina; den fridge and bed
- Day/night with lighting; raincoat disguise; coins and Snack Shack
- Pip the crow and a 6-step quest chain; autosave; keyboard and touch

## Done — Slice 2: the Town and the first job
- **3/4 tilted "diorama" camera** (closer to the original's look): ground is foreshortened, and pines, rocks, tents, tables, cars, lamps and buildings are drawn with height, walls and roofs, all depth-sorted with characters. Characters have legs, arms and walk cycles; trees fade when Moss walks behind them
- **Pinewick town** east of the campground: Main Street, sidewalks, crosswalk, the Stack 'Em Diner, Brambles General Store, Post Office, parking lot (with Grube's gold car), street lamps, bus stop, flagpole
- **Deputy Ruiz** patrols Main Street; townsfolk and pedestrians report an undisguised Moss to the nearest guard
- **Job system — Diner Line Cook**: 60-second ticket mini-game (9 ingredients, 7 recipes, harder ones unlock), tips for speed, accuracy bonus, grade, once per day, number-key shortcuts
- **Wardrobe** in the den + outfits from the store: Sweater & cap (silent running), Ranger-ish vest (guards barely notice)
- **Named townsfolk**: Dot Pickering (diner), Walt Brambles (store), Iris Okafor (post office), plus side quest *Special Delivery* (carry Iris's parcel to Gus at the Big Stump campsite)
- **Story**: eavesdrop on Grube and his assistant Kendra on the diner patio (11 AM–2 PM) → 30-day council-vote countdown in the HUD
- Save format v2 with automatic migration of Slice 1 saves

## Done — Slice 3: Proof, vehicles and the golf course
- **Drag-to-eat**: eating opens a close-up of Moss's face; drag food from the table into his mouth (mouth opens as food gets close, chomp animation). Picnic tables at every campsite now hold food you can feast on in place or drag into your backpack. Q / tapping a snack opens the same screen for backpack food
- **Camera & photo proof**: Iris sells a disposable camera. Photo mode (C) with a moving viewfinder; E snaps a real cropped photo of the scene. Evidence photos (footprints on the east lakeshore, mossy nest in the forest, fur tuft on the Elk Ridge fence) are scored on framing + distance (stars, /100), spoiled if someone sees you, and kept in a photo album on the desk in the den
- **Dr. Anita Holm** visits the Ranger Station 9–5; delivering the album triggers the species review and Grube's escalation
- **Hank Voss**, Grube's private eye, prowls the campground at dusk with a flashlight; if he photographs undisguised Moss the council vote moves up 2 days (once per day)
- **Vehicles**: bicycle (Brambles, 15 coins) and Walt's pickup (side quest *Truck Trouble*: fetch his tackle box from the lakeshore). E to get on/off, momentum, honk (H), noisy and more noticeable when undisguised
- **Pinewick Golf Club** north of town: 3-hole golf mini-game (aim, oscillating power meter, wind, sand, water penalties), 5-coin entry, prizes, best-score board
- **Caddy job**: 8 timed shots, hand Mrs. Thistlewood the right club for the lie and distance, once per day
- Save format v3 with migration from v1/v2 saves; touch controls gained a Cam button and Run becomes Honk while riding

## Next prompt (Slice 4)
Copy this into the next session:

> Continue building Pinecone Prowler in `pinecone-prowler/index.html` (read `ROADMAP.md` first). Add **Slice 4: Fishing, foraging and a dog**.
> 1. **Fishing**: buy a rod at Brambles. Cast from the lakeshore or a new wooden dock (hold to cast farther, wait for a bite, a timing/tension mini-game to reel in). 8 fish species with sizes and rarity that depend on time of day and weather; sell fish at a new bait shop by the lake or cook them.
> 2. **Mushroom foraging**: mushrooms spawn daily in the forest (chanterelles, morels, a poisonous look-alike). Collect into a basket; a forager's guidebook in the den fills in as you find species; sell to Dot for the diner's specials.
> 3. **Adopt a dog**: a stray dog named Biscuit hangs around the campground; befriend it over 3 days with food. Once adopted it follows Moss, can be told to sit/stay, barks to distract campers (lures their sight cones away), and sniffs out buried truffles (a hot/cold mini-game) worth lots of coins.
> 4. **Weather**: rain days (darker, campers stay in tents more, fish bite better, footprints vanish), with a rain particle effect and puddles in the 3/4 renderer.
> 5. **Story**: Grube hires a bulldozer crew that starts clearing a corner of the forest; sabotage them at night (hide their keys, swap their lunch) to delay construction and win back days on the council countdown.
> Keep the 3/4 diorama renderer, the drag-to-eat screen, art style, HUD, save format (bump to v4 with migration) and touch controls. Test it in a headless browser and give me the prompt for Slice 5 when done.

## Later slices (ideas)
- Slice 5: Ski hill and lake activities (canoe, swimming, scuba)
- Slice 6: More jobs (doctor's office, police desk), arcade cabinets in town
- Slice 7: Birdwatching with photo scoring (reuse the camera); badge collection
- Slice 8: Council vote finale and save Hollowpine
