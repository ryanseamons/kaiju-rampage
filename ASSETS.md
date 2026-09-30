# Assets and provenance

Apart from two CC0 button sounds (below), this repo contains no image, audio or font files. Everything else you see and hear is generated at runtime by code written for this project.

| Asset | Where it comes from |
|---|---|
| Kaiju (3 frames), soldiers, tank hull and turret, mech boss (2 frames) | Drawn with Canvas 2D shapes in `src/textures.ts`, then alpha-thresholded and outlined to get a pixel-art look |
| Houses (6 variants), towers (6), warehouses (3), cars (6), trees (3), rubble | Same technique, `src/textures.ts`; lit windows and colours come from a seeded RNG |
| Ground tileset (lots, sidewalks, roads, crosswalks, park, sand, 2 water frames, docks) | `drawTiles()` in `src/textures.ts` |
| News anchor portrait | `src/textures.ts`: a generic, fictional figure, not based on any real person |
| Particles, glow, shockwave ring, beam, vignette, shadow | Canvas gradients and shapes in `src/textures.ts` |
| Sound effects (crunch, collapse, stomp, roar, pickups, alarm, news sting) | Synthesized with WebAudio oscillators and filtered noise in `src/sfx.ts` |
| Button hover and press sounds (`public/sfx/hover.mp3`, `public/sfx/press.mp3`) | Kenney Impact Sounds (soft impact) and Kenney UI Audio `click_002`, both **CC0** (kenney.nl), in the encodes auditioned for Voyage's UI sound pack |
| Music | Composed live by `src/audio/composer.ts` and synthesized in `src/audio/instruments.ts` (Karplus–Strong strings, generated reverb); no samples |
| Font | None bundled. The UI uses the system `"Courier New", monospace` |
| News copy | Written for this project in `src/shared/bank.ts` (fictional city Shiokaze Bay, fictional channel KBN-7) |

Libraries: Phaser 3.90 (MIT) for rendering, physics and input; `@anthropic-ai/sdk` (MIT) server-side only, for the optional live narration path.

The game's inspiration is a genre reference only (see BRIEF.md). No art, names or designs were copied.
