/**
 * Key art for the Voyage Labs store card (no lettering; the title is typeset over it by
 * scripts/render-cover.ts). GPT Image 2.5 Flare edit on fal.ai, conditioned on the game's own
 * screenshots so the kaiju stays on-model. Writes marketing/cover-art-<n>.png (~$0.08 each).
 * The key is read in-process from ~/.config/claude-agents/.env and never printed.
 */
import fs from 'node:fs';
import os from 'node:os';

const env = Object.fromEntries(
  fs.readFileSync(`${os.homedir()}/.config/claude-agents/.env`, 'utf8').split('\n').flatMap((l) => {
    const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    return m ? [[m[1], m[2].replace(/^['"]|['"]$/g, '')]] : [];
  }),
);
const dataUri = (p: string) => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;

const PROMPT = `Playful retro 1960s Japanese monster-movie poster key art, painted, wide 16:10 composition, dramatic and fun, family friendly.
CENTER (focal point, upper two-thirds, inside a central square): a colossal friendly-fierce reptilian monster wading out of a night harbor, mouth open in a mighty roar, seen from a low heroic angle. It is the creature in the references: deep green scaly hide, a pale yellow belly, a row of glowing CYAN crystal spines down its back, one bright glowing RED eye, short arms.
AROUND IT: a neon-lit Japanese harbor city at night in comic chaos: leaning office towers and tiled-roof houses, a red-and-white lattice broadcast tower, a five-storey red pagoda, dust clouds and glowing orange embers, little toy-like helicopters sweeping searchlight beams across the sky. The bay below reflects neon pink and cyan.
STYLE: painterly vintage poster illustration, bold rim light, halftone dot texture and subtle film grain; palette of deep navy night, warm orange glow, neon cyan and magenta, with the creature's cyan spine-glow as the brightest accent.
COMPOSITION: keep the lower third dark and calm (rippling dark water and mist) for a title, and the very top band dark. No text, no letters, no logos, no watermark.`;

const refs = ['screenshots/tier3.png', 'screenshots/title.png'].filter((p) => fs.existsSync(p));
let made = 0;
for (let i = 1; i <= Number(process.argv[2] ?? 2); i++) {
  const out = `marketing/cover-art-${i}.png`;
  if (fs.existsSync(out)) continue;
  const r = await fetch('https://fal.run/openai/gpt-image-2.5/flare/edit', {
    method: 'POST',
    headers: { Authorization: `Key ${env.FAL_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: PROMPT, image_urls: refs.map(dataUri), image_size: { width: 1600, height: 1000 }, quality: 'high', output_format: 'png', num_images: 1 }),
  });
  if (!r.ok) throw new Error(`fal HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const units = r.headers.get('x-fal-billable-units');
  const j = (await r.json()) as { images: { url: string }[] };
  const img = await fetch(j.images[0].url);
  fs.writeFileSync(out, Buffer.from(await img.arrayBuffer()));
  made++;
  console.log(`${out} (billable units: ${units ?? '?'})`);
}
console.log(`made ${made}`);
