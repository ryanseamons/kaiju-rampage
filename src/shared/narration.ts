// ─────────────────────────────────────────────────────────────────────────────
// NARRATION: the one file to tune the "BREAKING NEWS" layer.
//
//  • RunStats          – what the game reports at the end of each wave
//  • describeStats()   – the stats → prompt mapping (what the model is told)
//  • SYSTEM_PROMPT     – the anchor-desk persona and output contract
//  • parseBulletin()   – validates the model's JSON
//  • bankBulletin()    – the DEFAULT: a large templated bank (./bank.ts) filled in from the same stats
//  • SYSTEM_PROMPT / describeStats() – only used by the optional live-model path (needs a key)
//
// Imported by both the local server (server/index.ts) and the client
// (src/news.ts). It contains no secrets; the API key only exists server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { ANCHORS as ANCHORS_, HEADLINES as HEADLINES_, TICKERS as TICKERS_, eligible, render, slotsFor, type Template } from './bank';

export const CITY = 'Shiokaze Bay';
export const CHANNEL = 'KBN-7 NIGHT DESK';
export const KAIJU_NAME = 'TIDEMAW';
// Ryan's call (overrides BRIEF.md's Haiku default): Opus 5.5 at medium effort. Override with NARRATION_MODEL / NARRATION_EFFORT.
export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_EFFORT = 'medium';

export type Tier = 1 | 2 | 3;

export interface RunStats {
  wave: number;
  totalWaves: number;
  outcome: 'wave-cleared' | 'victory' | 'defeat';
  tier: Tier;
  level: number;
  /** District the kaiju is standing in right now. */
  district: string;
  /** District that took the most damage this wave. */
  hardestHitDistrict: string;
  buildingsDestroyed: number;
  waveBuildingsDestroyed: number;
  housesDestroyed: number;
  towersDestroyed: number;
  carsCrushed: number;
  soldiersDefeated: number;
  tanksDestroyed: number;
  bossDefeated: boolean;
  /** Times HP dropped below 25% and recovered or not. */
  nearDeathMoments: number;
  lowestHpPct: number;
  hpPct: number;
  upgrades: string[];
  newUpgradesThisWave: string[];
  stompsUsed: number;
  elapsedSec: number;
  previousHeadline?: string;
}

export interface Bulletin {
  headline: string;
  anchor: string;
  ticker: string[];
  source: 'ai' | 'bank';
}

// ── Stats → prompt mapping ───────────────────────────────────────────────────

export const TIER_FLAVOR: Record<Tier, { size: string; threat: string }> = {
  1: { size: 'roughly the size of a delivery van', threat: 'a pest-control problem, according to the Defense Ministry' },
  2: { size: 'taller than a three-storey house', threat: 'a regional emergency; armored divisions deployed' },
  3: { size: 'skyscraper-scale, visible from the next prefecture', threat: 'an existential threat; the city is being evacuated' },
};

function severity(n: number): string {
  if (n === 0) return 'no buildings lost (so far)';
  if (n < 10) return 'scattered property damage';
  if (n < 40) return 'whole blocks flattened';
  if (n < 120) return 'entire districts in ruins';
  return 'a city skyline that no longer exists';
}

/** Turns raw run stats into the fact sheet the model sees. Tune freely. */
export function describeStats(s: RunStats): string {
  const t = TIER_FLAVOR[s.tier];
  const lines = [
    `City: ${CITY}. Channel: ${CHANNEL}. Creature codename: ${KAIJU_NAME}.`,
    `Report after wave ${s.wave} of ${s.totalWaves} (${Math.round(s.elapsedSec / 60)} min since first sighting).`,
    `Event: ${
      s.outcome === 'victory'
        ? 'the military\'s giant mech has been destroyed; the creature is unopposed'
        : s.outcome === 'defeat'
          ? 'the creature has collapsed and is not moving'
          : 'the military has pulled back to regroup'
    }.`,
    `Creature size: ${t.size}. Official threat level: ${t.threat}.`,
    `Creature last seen in: ${s.district}. Hardest-hit district this wave: ${s.hardestHitDistrict}.`,
    `Destruction: ${s.buildingsDestroyed} buildings total (${s.waveBuildingsDestroyed} this wave) — ${severity(s.buildingsDestroyed)}. ` +
      `${s.housesDestroyed} homes, ${s.towersDestroyed} towers, ${s.carsCrushed} vehicles crushed.`,
    `Military losses: ${s.soldiersDefeated} infantry routed, ${s.tanksDestroyed} tanks destroyed${s.bossDefeated ? ', and the flagship mech' : ''}.`,
    s.nearDeathMoments > 0
      ? `The military came close: the creature was badly hurt ${s.nearDeathMoments} time(s), at one point down to ${s.lowestHpPct}% strength.`
      : `The military has not managed to seriously wound the creature (lowest point ${s.lowestHpPct}% strength).`,
    s.newUpgradesThisWave.length
      ? `Witnesses report new abilities: ${s.newUpgradesThisWave.join(', ')}.`
      : 'No new abilities observed this wave.',
    s.upgrades.length ? `All abilities observed so far: ${s.upgrades.join(', ')}.` : '',
    `Seismic "stomp" events recorded: ${s.stompsUsed}.`,
    s.previousHeadline ? `Your previous headline was: "${s.previousHeadline}" — do not repeat it.` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export const SYSTEM_PROMPT = `You write on-screen copy for a late-night TV news channel in a retro Japanese-style monster game.
A kaiju is rampaging through a fictional coastal city. You react to the player's actual run.
Tone: deadpan broadcast gravitas that slides into panic, dry humor, short punchy lines. PG. No real people, brands or places.
Always mention at least two concrete facts from the fact sheet (numbers, district names, ability names, size).
Reply with ONLY a JSON object, no prose, no code fences:
{"headline": "<ALL CAPS, max 7 words>", "anchor": "<one spoken sentence, max 30 words>", "ticker": ["<max 12 words>", "<max 12 words>", "<max 12 words>", "<max 12 words>"]}`;

export function buildUserPrompt(s: RunStats): string {
  return `FACT SHEET\n${describeStats(s)}\n\nWrite the bulletin JSON now.`;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const clip = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseBulletin(text: string): Omit<Bulletin, 'source'> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    const headline = clip(raw.headline, 60).toUpperCase();
    const anchor = clip(raw.anchor, 220);
    const ticker = Array.isArray(raw.ticker) ? raw.ticker.map((t: unknown) => clip(t, 110)).filter(Boolean).slice(0, 6) : [];
    if (!headline || !anchor || ticker.length === 0) return null;
    return { headline, anchor, ticker };
  } catch {
    return null;
  }
}

// ── Shipped bank (default, no key) ───────────────────────────────────────────
// The templates themselves live in ./bank.ts; selection lives here with the rest of the tuning.
export { ANCHORS, HEADLINES, TICKERS } from './bank';

/**
 * Builds a bulletin from the shipped bank. Deterministic for (stats, seed); `used` carries the lines
 * already shown this run so five waves never repeat one. Stat-reactive (gated) lines are preferred.
 */
export function bankBulletin(s: RunStats, used: Set<string> = new Set(), seed = s.wave * 7919 + s.buildingsDestroyed * 31 + s.soldiersDefeated): Bulletin {
  let x = seed >>> 0 || 1;
  const r = () => {
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
  const slots = slotsFor(s, { kaiju: 'Tidemaw', size: TIER_FLAVOR[s.tier].size, threat: TIER_FLAVOR[s.tier].threat });
  const take = (list: Template[], n: number, preferReactive: number): string[] => {
    const el = eligible(list, s);
    const fresh = el.filter((t) => !used.has(t.t));
    const pool = fresh.length >= n ? fresh : el;
    const reactive = pool.filter((t) => t.when || t.tiers);
    const out: Template[] = [];
    while (out.length < n && out.length < pool.length) {
      const src = reactive.some((t) => !out.includes(t)) && r() < preferReactive ? reactive : pool;
      const cand = src.filter((t) => !out.includes(t));
      out.push(cand[Math.floor(r() * cand.length) % cand.length]);
    }
    for (const t of out) used.add(t.t);
    return out.map((t) => render(t.t, slots));
  };
  const [headline] = take(HEADLINES_, 1, 0.75);
  const [anchor] = take(ANCHORS_, 1, 0.8);
  const ticker = take(TICKERS_, 4, 0.7);
  return { headline: headline.toUpperCase().slice(0, 60), anchor, ticker: ticker.map((t) => t.toUpperCase()), source: 'bank' };
}
