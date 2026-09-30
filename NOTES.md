# Notes: building the Kaiju Rampage slice

## What took the most time

1. **Balance and pacing against a scripted player.** The first playable build let the bot reach tier 3 inside wave 1 and level 24 by wave 3 without dropping below 97% HP. Pacing took three passes: mass thresholds (tier 2 at 140 → 240 → 450, tier 3 at 520 → 1000 → 3000), split rewards so destruction mostly grows you and the military mostly levels you, a steeper XP curve, and harder infantry and tanks. The fixed-seed test run now reaches tier 2 in wave 2 and tier 3 in wave 3, with min HP around 35–45% (see `screenshots/playthrough-summary.json`).
2. **A test bot that survives on keyboard input alone.** The bot reads a read-only `window.__kaiju.state()` snapshot and steers with W/A/S/D and Space. The hard parts were sliding around walls it's too small to crush, getting unstuck, not chasing rifle squads at tier 1 on low HP, and keeping screenshots from racing the level-up modal.
3. **The narration layer changed direction twice mid-build** (see Decisions below): first to a larger model, then to no key at all with a large shipped bank as the default. The bank (34 headlines, 123 anchor lines, 123 ticker fragments) and its grammar tests (zero counts, plurals, unfilled slots, no repeats) took longer than the original prompt did.
4. **Procedural pixel art.** Every sprite is drawn with Canvas shapes, then alpha-thresholded and outlined. Cheap to iterate on, but getting a readable 3/4 view for buildings (roof plus lit facade, bottom-aligned collision footprints, depth-sorted by y) took a few passes.

## Rough AI cost

- **Playing the game: $0 by default.** Bulletins come from the shipped bank, so no key or network is needed.
- **Optional live-model path** (`claude-opus-5-5`, effort `medium`, at $4 in / $20 out per MTok): two real calls measured about 600–660 input and 1.17–1.22k output tokens (about 890 of those are adaptive thinking), with **12–14s latency**. That's roughly **$0.025 per bulletin, about $0.13 per 5-wave run**. Those two calls (about $0.05) are the only real API spend in this build. The automated "with key" test uses a local mock of the Messages API and costs nothing.
- **Building it:** the game was built in one long Claude Code session (Opus 5.5, with a stronger model reviewing plans and done gates). At API list prices that is an estimated $20–40; this is an estimate, not a metered number.

## Measured

**Frame rate** was measured in the Claude desktop browser pane (Chromium, WebGL) on this laptop, a MacBook Pro (Apple M4 Pro) whose display runs at about 144 Hz. The game renders at the display's refresh rate:

| Scene | Avg FPS | Min FPS | Notes |
|---|---|---|---|
| Tier 1, wave 1 (normal speed) | 141 | 120 | Min includes the first second while the average warmed up |
| Tier 3, wave 4 (`?startWave=4`) | 144 | 142 | 191 buildings flattened in 30s: particles, collapse tweens, stomps |
| Boss wave (`?startWave=5`) | 138 | 121 | Mech laser, missiles and quake rings on screen |

In headless Playwright Chromium (SwiftShader software rendering, no GPU) the same game runs at about 15–30 FPS. The simulation's timestep is capped at 50 ms, so the tests still play correctly there.

**Normal-speed pacing** (`PACING=1 npx playwright test pacing`, seed 2024, wall-clock seconds including level-up and news pauses and headless slowdown):

| Wave 2 | Tier 2 | Wave 3 | Tier 3 | Wave 4 | Wave 5 | Mech destroyed |
|---|---|---|---|---|---|---|
| 132s | 203s | 272s | 396s | 511s | 703s | 860s |

The bot won the full run at level 22 with 1,141 buildings flattened, and its HP never dropped below 32%. The waves themselves add up to about 9.5 minutes of game time.

An earlier normal-speed run died in wave 1 at 113s (9 buildings, level 3). `?fast=1` had been hiding it: fast mode scales growth and XP per second by 2.5× but not enemy pressure, so it's **easier** than the real game. Wave 1–5 infantry caps and rates were cut (wave 1: 45 → 18 max riflemen) and tier-1 rifle damage went from 4 to 3. The normal-speed pacing run is now the evidence for the real game; the fast playthrough is the quick regression test.

## Pass 2: the deeper audit

A second pass played the game with a deliberately naive bot, read the code for edge cases, and stress-tested late-game performance. What it found, and what changed:

- **Port collision (bug).** The narration server read `PORT`, which IDE launchers also export for the web server. In the desktop app's browser pane both processes fought over :5173 and every `/api` call returned 502. It now reads `NARRATION_PORT`.
- **Tanks couldn't hit a moving target (bug).** Shells flew at 230 px/s toward where the kaiju *was*. At tier 2–3 keep-distance (260–420 px) the shell arrived a second or two later, and a moving kaiju was never there: a tier-3 stress run took zero tank damage in 48 s. Gunners now lead the target on its current velocity (with tier-scaled noise) and shells fly at 340 px/s: a straight-line runner gets hit, a sidestep still dodges. The test bot learned to sidestep.
- **No heal source in wave 1 (feel).** A non-dodging player bled from 34 HP to 0 over 24 s with a few riflemen around, and nothing at tier 1 dropped hearts. Level-ups now heal 15% and crushed cars drop a heart 4% of the time. The same non-dodging bot now clears wave 1 and dies 96 s in, during wave 2. A second look after a real first play: a hatchling that simply *stood still* at the spawn died in about 8 s, which reads like the game resetting itself. Wave 1 now opens with an 8-second grace period before the first squad, spawns fewer riflemen, and tier-1 rifles do 2 damage on a slower cadence; standing still now lasts about 38 s.
- **Enemies walked through buildings.** Infantry and tanks now collide with buildings and sidestep along the perpendicular that leans toward you; spawn points are snapped to road centrelines so nothing spawns inside a wall. The mech ignores buildings and flattens houses as it walks (collateral, not credited to you).
- **Quality of life.** P/Esc pauses, M mutes (remembered), the title shows your best run, a white flash marks each growth spurt, projectiles scale up when the camera zooms out, towers and warehouses keep burning after they fall (one shared emitter, capped at 12 fires).
- **Music.** A minimal procedural loop: a bass pulse and soft hat whose tempo rises with your tier, a low drone, a key change for the boss, ducked under menus. It is quiet by design; M mutes it.
- **Narration never touches the network without a key.** The run checks `/api/health` once; unless the server reports a key, no bulletin request is made (the tests now assert zero requests without a key and at least one with).
- **Perf was fine and stayed fine:** 144 FPS at 400 buildings destroyed with a 60–80 MB heap. The rubble-as-tilemap refactor that was on the table was not needed.

**Normal-speed pacing after pass 2** (same opt-in spec, seed 2024, dodging bot, wall-clock seconds): wave 2 at 169 s, tier 2 at 259 s, wave 3 at 445 s, tier 3 at 568 s, wave 4 at 835 s; the bot was alive at level 19 with 998 buildings flattened when the spec's 15-minute limit ended the run, and its HP never dropped below 65%. Wall-clock is inflated here because headless Chromium ran at 10–20 FPS during this run (the simulation caps each step at 50 ms, so slow frames slow the game rather than skipping); the spec now also logs simulated game seconds. A separate boss-only run (`START_WAVE=5`) destroyed the mech after 170 simulated seconds with the bot never below 68% HP, so the final wave is still beatable with leading shells and building collisions. The fast-mode regression run's minimum HP rose from about 40% to 92%, because level-up heals arrive 2.5× faster there; it remains a regression test, not balance evidence.

## Pass 3: publish, then audit again

Published as a public repo (github.com/ryanseamons/kaiju-rampage) and a Cloudflare Pages site (`npm run deploy`, wrangler 3; wrangler 4's `pages project create` rewrote package.json and vite.config.ts, so it's pinned back). What changed after the first real play ("I beat everything in my first run"):

- **Front page.** An HTML poster over the canvas (pattern from the tavern project), sized in canvas units so it lines up at any window size: the kaiju silhouette, EN/日本語, a "What is kaiju?" line, How to Play, a Mutations codex (all 16 upgrades and the evolutions), local high scores, settings, a now-playing plaque and a mute button that stays on screen during play.
- **More army, more reasons to move.** Rocket teams, helicopters, cannon batteries, a heavy walker mid-boss, jet bombing runs, elites, and an encirclement ring. Ground units follow a flow field (BFS from the kaiju over the tile grid), so they route around buildings instead of pressing into walls; riflemen close to 85% of their range instead of orbiting out of it.
- **Items and build.** Supply crates (from elites and the walker) open an evolution or a big upgrade; floor items (magnet, quake, rage); four evolutions from weapon + passive pairs; reroll and skip on level-up; the pause screen lists your build.
- **Score.** A destruction combo (×0.5 per 15 hits, up to ×5), a results screen with a grade, initials entry, all-time and daily top-10s, a daily seed, and endless mode after the mech.
- **Sound.** Music is 14 licensed Epidemic Sound tracks rotating per stage with 2.5 s crossfades, loudness-normalised and mixed under the effects (the procedural composer is the fallback in a clone). Effects: 22 licensed Epidemic clips for the big moments (roars, collapses, explosions, stomp booms, cannon, car crush, jet pass, siren, rifle bursts; deploy-only like the music) over Kenney CC0 samples in 15 banks (alternates, pitch jitter, voice caps, deeper crunches as you grow, an XP pickup tick that climbs in pitch while you hoover a stream of crystals) layered over the old synthesis for weight. Every HTML button has Voyage's hover and press sounds.
- **Landmarks.** The city was a uniform grid of houses and towers. It now has Shiokaze Castle in Old Town, the KBN-7 broadcast tower downtown, and five-storey pagodas with torii gates through the old quarters, each with its own art, HP, score and growth bonus, a banner when it falls, and news lines (topple the KBN-7 tower and the channel reports from a parking lot).
- **Weight.** Footfalls get slower and deeper as you grow; at City-Ender size every step shakes the camera and kicks up dust.
- **Difficulty.** Easy is the old tuning; Medium (the new default) and Hard multiply enemy HP, damage, spawn rates and caps, add elites and earlier, more frequent jets, field extra cannons and helicopters at tier 3, add tier-3 damage, and cut heals. See README for the table and `src/difficulty.ts` for the numbers.

**Difficulty evidence (pass 3).** Two measurements, both in game seconds so a loaded machine doesn't skew them:

| | Easy | Medium | Hard |
|---|---|---|---|
| Stationary kaiju, wave 2 (tier 2): damage/s (`difficulty.spec.ts`) | 7.5 | 9.0 | 9.2 |
| Stationary kaiju, wave 4 (tier 3): damage/s | 11.0 | 12.3 | 14.3 |
| Dodging bot, full normal-speed run: died at | 142 s | 124 s | 107 s |

The order is right on every row. The absolute numbers are not tuned to the bot. It dies in wave 2 at tier 1 on every setting, because since the flow-field change infantry reach it and it flattens too little (31–57 buildings) to grow. A human who beat Easy on the first run is a much stronger player than this bot, so the multipliers in `src/difficulty.ts` are set relative to Easy, which the one real player called "good easy". Improving the bot's growth routing is the next step for balance evidence.

## Decisions made during the build

- The optional live narration model is `claude-opus-5-5` at medium effort (BRIEF.md started from a smaller model), configurable via `NARRATION_MODEL` / `NARRATION_EFFORT`.
- The shipped bank is the default narration, so the game needs no key and no server; the live-model path is an optional extra that stays off without a key. This is also what lets the game run as a static site.
- Phaser pinned to 3.90 (npm `latest` is 4.x; the brief says Phaser 3).
- Rendering: 2D top-down pixel art in Phaser. It's the fastest way to "chunky destruction" juice (camera shake, hit-stop, particles, tweens) with zero art pipeline, and camera zoom-out per tier is trivial.

## What a full game would need next

- **Content:** the other kaiju (each with its own weapon tree), the other biomes (harbor at dawn, mountain lab, neon megacity), 3–4 more enemy types (jets, artillery, helicopters, mech variants), and a real boss moveset per biome. Around 60–100 upgrades with synergies and evolutions, survivor-like style.
- **Structure:** meta-progression between runs (unlocks, a DNA currency), a run map or district choice, save data, settings (volume, key rebinding, screen shake toggle, colorblind-safe palette).
- **Feel:** real audio (music stems that intensify with tier, layered destruction SFX), hand-authored or generated sprite art with more animation frames, per-building collapse variety, screen-space lighting, fire and smoke that persist in the ruins.
- **AI/tech:** pathfinding on the road graph for vehicles and infantry, object pooling for bullets and particles, a performance pass for 1000+ sprites on low-end GPUs (culling, static batching of the city), and a proper first-time user experience (tutorial wave, tooltip for stomp).
- **Narration:** a much larger bank written per biome and per kaiju, with "callback" lines that remember earlier events in the run. If the live model returns: a cheaper, faster model or lower effort, streaming the ticker in as it's generated, and caching the system prompt.
- **Production:** real playtesting with humans (the current balance is tuned against a bot), telemetry on death causes and upgrade pick rates, and platform builds (desktop wrapper, Steam Deck controls).
