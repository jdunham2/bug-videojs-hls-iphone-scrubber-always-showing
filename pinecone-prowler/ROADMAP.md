# Pinecone Prowler — roadmap

An original cozy stealth game: you are **Moss**, a shy forest giant raiding Hollowpine Campground for snacks while a developer, **Gideon Grube**, plans to pave it into a resort. Single file: `index.html` (HTML + canvas + vanilla JS, no build step).

## Done — Slice 1: core loop (vertical slice)
- Top-down open world (2600×1800): den, forest, lake, 5 campsites, Snack Shack, Ranger Station
- Stealth: vision cones (campers, ranger, shop clerk), line-of-sight blocked by trees, tents, buildings; suspicion meter; hiding in bushes; sprinting makes noise
- Ranger AI: patrol → investigate → chase → search; getting caught drops your backpack and sends you home
- Raiding coolers, picnic baskets, trash bins; 6-slot backpack; hunger and stamina
- Den with fridge (stash) and bed (sleep after 6 PM → next day, restock, save)
- Day/night cycle with lighting; campers sleep at night; ranger uses a flashlight
- Disguise (raincoat and hat): campers ignore you, rangers are slower to notice
- Coins and Snack Shack shop
- Pip the crow and a 6-step quest chain ending in the Grube Resort story reveal
- Autosave (localStorage), keyboard and touch controls

## Next prompt (Slice 2)
Copy this into the next session:

> Continue building Pinecone Prowler in `pinecone-prowler/index.html` (read `ROADMAP.md` first). Add **Slice 2: the Town and the first job**.
> 1. Extend the map east with a small 1990s town: main street, diner, general store, post office, and a parking lot. Disguised Moss can walk the street; undisguised Moss gets reported.
> 2. Add a **job system** with the first job: **Diner Line Cook**. A timed mini-game where orders appear on tickets (e.g. burger, fries, pancakes) and you assemble them in the right order before a timer runs out. Pays coins based on accuracy; one shift per day.
> 3. Add a **wardrobe** in the den with 2 new outfits bought at the general store (e.g. a sweater-and-cap and a ranger-looking vest), each with a small perk (one lowers ranger suspicion, one lets you run without noise).
> 4. Add 3 named townsfolk with dialogue and a side quest that sends you back to the campground.
> 5. Story beat: overhear Gideon Grube at the diner and unlock a new goal toward stopping the resort (30-day countdown shown in the HUD).
> Keep the same art style, HUD, save format (migrate old saves), and touch controls. Test it in a headless browser and give me the prompt for Slice 3 when done.

## Later slices (ideas)
- Slice 3: Golf course and go-kart track mini-games; vehicles (bike, then car)
- Slice 4: Fishing and mushroom foraging; adopt a dog that sniffs out truffles
- Slice 5: Ski hill and lake activities (canoe, swimming, scuba)
- Slice 6: More jobs (doctor's office, police desk), arcade cabinets in town
- Slice 7: Birdwatching with a camera and photo scoring; badge collection
- Slice 8: Grube finale and save Hollowpine
