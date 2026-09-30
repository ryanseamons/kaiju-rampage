# Assets and provenance

Apart from CC0 sound clips from Kenney (below), this repo contains no image, audio or font files. Everything else you see is generated at runtime by code written for this project. The deployed site also carries licensed Epidemic Sound music (and, once added, effects) that are deliberately kept out of the repository.

| Asset | Where it comes from |
|---|---|
| Kaiju (3 frames), soldiers, tank hull and turret, mech boss (2 frames) | Drawn with Canvas 2D shapes in `src/textures.ts`, then alpha-thresholded and outlined to get a pixel-art look |
| Houses (6 variants), towers (6), warehouses (3), cars (6), trees (3), rubble | Same technique, `src/textures.ts`; lit windows and colours come from a seeded RNG |
| Ground tileset (lots, sidewalks, roads, crosswalks, park, sand, 2 water frames, docks) | `drawTiles()` in `src/textures.ts` |
| News anchor portrait | `src/textures.ts`: a generic, fictional figure, not based on any real person |
| Particles, glow, shockwave ring, beam, vignette, shadow | Canvas gradients and shapes in `src/textures.ts` |
| Sound effects: samples (`public/sfx/k/*.mp3`, 49 clips in 14 banks) | Kenney **CC0** packs (kenney.nl): Impact Sounds (`impactSoft_heavy`, `impactMetal_medium`, `impactPlank_medium`, `impactMining`, `impactPlate_heavy`, `impactPunch_heavy`, `impactPunch_medium`), RPG Audio (`knifeSlice`, `knifeSlice2`, `chop`, `metalLatch`), Interface Sounds (`glass_002/3/5/6`), Digital Audio (`powerUp1/2/7`, `phaserUp3`, `zap1/2`). Re-encoded to mono 96 kbps mp3; played by `src/audio/samples.ts` with alternates, pitch jitter and voice caps |
| Sound effects: synthesis | WebAudio oscillators and filtered noise in `src/sfx.ts`: sub-bass weight under the samples, gunfire, the news sting, combo ticks, and a full fallback when a sample bank is missing |
| Button hover and press sounds (`public/sfx/hover.mp3`, `public/sfx/press.mp3`) | Kenney Impact Sounds (soft impact) and Kenney UI Audio `click_002`, both **CC0** (kenney.nl), in the encodes auditioned for Voyage's UI sound pack |
| Music (deployed site) | 14 tracks from **Epidemic Sound**, licensed by the site owner for web use: The Flowing Force, Dynasty of Fire, Temple of Thunder, Red Phoenix (Yi Nantiro); Ferocious Fire, Swift Wind, Ikki Uchi, Unified Forest, Immovable Mountain, Total Bliss (Isaku Kageyama); Rise of the Sun God (Dream Cave); Ninja Skills (Ava Low); Press X Twice (Lexica); No One Escapes (Dian Shuai). Loudness-normalised to -16 LUFS, 128 kbps, in `public/music/` with `tracks.json`. **Not in the repository** (gitignored; the licence does not cover redistribution) |
| Music (fallback) | Composed live by `src/audio/composer.ts` and synthesized in `src/audio/instruments.ts` (Karplus–Strong strings, generated reverb); plays when `public/music/tracks.json` is absent, or with `?music=composed` |
| Font | None bundled. The UI uses the system `"Courier New", monospace` |
| News copy | Written for this project in `src/shared/bank.ts` (fictional city Shiokaze Bay, fictional channel KBN-7) |

Libraries: Phaser 3.90 (MIT) for rendering, physics and input; `@anthropic-ai/sdk` (MIT) server-side only, for the optional live narration path.

The game's inspiration is a genre reference only (see BRIEF.md). No art, names or designs were copied.
