# Notes: building the Kaiju Rampage slice

## What took the most time

1. **Balance and pacing against a scripted player.** The first playable build let the bot reach tier 3 inside wave 1 and level 24 by wave 3 without dropping below 97% HP. Pacing took three passes: mass thresholds (tier 2 at 140 → 240 → 450, tier 3 at 520 → 1000 → 3000), split rewards so destruction mostly grows you and the military mostly levels you, a steeper XP curve, and harder infantry and tanks. The fixed-seed test run now reaches tier 2 in wave 2 and tier 3 in wave 3, with min HP around 35–45% (see `screenshots/playthrough-summary.json`).
2. **A test bot that survives on keyboard input alone.** The bot reads a read-only `window.__kaiju.state()` snapshot and steers with W/A/S/D and Space. The hard parts were sliding around walls it's too small to crush, getting unstuck, not chasing rifle squads at tier 1 on low HP, and keeping screenshots from racing the level-up modal.
3. **The narration layer changed direction twice mid-build** (see Decisions below): Haiku → Opus 5.5 at medium effort, then no key at all with a large shipped bank as the default. The bank (34 headlines, 123 anchor lines, 123 ticker fragments) and its grammar tests (zero counts, plurals, unfilled slots, no repeats) took longer than the original prompt did.
4. **Procedural pixel art.** Every sprite is drawn with Canvas shapes, then alpha-thresholded and outlined. Cheap to iterate on, but getting a readable 3/4 view for buildings (roof plus lit facade, bottom-aligned collision footprints, depth-sorted by y) took a few passes.

## Rough AI cost

- **Playing the game: $0 by default.** Bulletins come from the shipped bank, so no key or network is needed.
- **Optional live-model path** (`claude-opus-5-5`, effort `medium`, at $4 in / $20 out per MTok): two real calls measured about 600–660 input and 1.17–1.22k output tokens (about 890 of those are adaptive thinking), with **12–14s latency**. That's roughly **$0.025 per bulletin, about $0.13 per 5-wave run**. Those two calls (about $0.05) are the only real API spend in this build. The automated "with key" test uses a local mock of the Messages API and costs nothing.
- **Building it (this Claude Code session):** it ran on a Max-plan subscription, so there's no marginal dollar cost. At API rates, one long Opus 5.5 session (about 340k context at the end, mostly cache reads across roughly 150 turns) plus a handful of advisor reviews comes to an **estimated $20–40 API-equivalent**. This is an estimate, not a metered number.

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

## Decisions made during the build (relayed via a peer session, to confirm)

- Narration model switched from BRIEF.md's Haiku default to `claude-opus-5-5` at medium effort, configurable via `NARRATION_MODEL` / `NARRATION_EFFORT`.
- Then: no API key. The shipped bank is the default and the "without a key" case. The live path stays as an optional extra and is off without a key.
- Phaser pinned to 3.90 (npm `latest` is 4.x; the brief says Phaser 3).
- Rendering: 2D top-down pixel art in Phaser. It's the fastest way to "chunky destruction" juice (camera shake, hit-stop, particles, tweens) with zero art pipeline, and camera zoom-out per tier is trivial.

## What a full game would need next

- **Content:** the other kaiju (each with its own weapon tree), the other biomes (harbor at dawn, mountain lab, neon megacity), 3–4 more enemy types (jets, artillery, helicopters, mech variants), and a real boss moveset per biome. Around 60–100 upgrades with synergies and evolutions, survivor-like style.
- **Structure:** meta-progression between runs (unlocks, a DNA currency), a run map or district choice, difficulty levels, save data, settings (volume, key rebinding, screen shake toggle, colorblind-safe palette).
- **Feel:** real audio (music stems that intensify with tier, layered destruction SFX), hand-authored or generated sprite art with more animation frames, per-building collapse variety, screen-space lighting, fire and smoke that persist in the ruins.
- **AI/tech:** pathfinding on the road graph for vehicles and infantry, object pooling for bullets and particles, a performance pass for 1000+ sprites on low-end GPUs (culling, static batching of the city), and a proper first-time user experience (tutorial wave, tooltip for stomp).
- **Narration:** a much larger bank written per biome and per kaiju, with "callback" lines that remember earlier events in the run. If the live model returns: a cheaper, faster model or lower effort, streaming the ticker in as it's generated, and caching the system prompt.
- **Production:** real playtesting with humans (the current balance is tuned against a bot), telemetry on death causes and upgrade pick rates, and platform builds (desktop wrapper, Steam Deck controls).
