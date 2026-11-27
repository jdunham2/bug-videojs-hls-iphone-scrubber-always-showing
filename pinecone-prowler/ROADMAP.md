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

## Next prompt (Slice 3)
Copy this into the next session:

> Continue building Pinecone Prowler in `pinecone-prowler/index.html` (read `ROADMAP.md` first). Add **Slice 3: Proof, vehicles and the golf course**.
> 1. **Camera and photo proof**: Iris sells a disposable camera at the post office. Add a photo mode (aim a viewfinder, snap) and a 3-step main quest to gather "rare species" evidence for the environmental review without being recognised: photograph your own footprints by the lake, a mossy nest in the deep forest, and a hair tuft snagged on a fence. Each photo is scored (framing and distance) and saved to an album in the den. Deliver the album to a new character, a provincial biologist named Dr. Anita Holm who visits the Ranger Station.
> 2. **Vehicles**: a bicycle bought at Brambles, then a beat-up pickup truck (unlocked by a quest from Walt). Ride with E, faster movement, honking, parked anywhere; vehicles are noisy (guards notice) unless disguised.
> 3. **Pinewick Golf Course** north of town: a 3-hole top-down mini-golf/golf mini-game (aim + power meter, wind, sand traps), entry fee, coin prizes, best-score board. A disguised Moss can play.
> 4. **Second job: Golf Caddy**: carry clubs, follow a golfer, hand them the right club before each shot (timed choice mini-game).
> 5. **Grube escalates**: Grube hires a private investigator (Hank Voss) who roams the campground at dusk with a flashlight and camera; if he photographs undisguised Moss, the countdown drops by 2 days.
> Keep the 3/4 diorama renderer, art style, HUD, save format (bump to v3 with migration) and touch controls. Test it in a headless browser and give me the prompt for Slice 4 when done.

## Later slices (ideas)
- Slice 4: Fishing and mushroom foraging; adopt a dog that sniffs out truffles
- Slice 5: Ski hill and lake activities (canoe, swimming, scuba)
- Slice 6: More jobs (doctor's office, police desk), arcade cabinets in town
- Slice 7: Birdwatching with photo scoring; badge collection
- Slice 8: Council vote finale and save Hollowpine
