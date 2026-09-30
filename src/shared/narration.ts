// ─────────────────────────────────────────────────────────────────────────────
// NARRATION: the one file to tune the "BREAKING NEWS" layer.
//
//  • RunStats          – what the game reports at the end of each wave
//  • describeStats()   – the stats → prompt mapping (what the model is told)
//  • SYSTEM_PROMPT     – the anchor-desk persona and output contract
//  • parseBulletin()   – validates the model's JSON
//  • cannedBulletin()  – offline fallback filled in from the same stats
//
// Imported by both the local server (server/index.ts) and the client
// (src/news.ts). It contains no secrets; the API key only exists server-side.
// ─────────────────────────────────────────────────────────────────────────────

export const CITY = 'Shiokaze Bay';
export const CHANNEL = 'KBN-7 NIGHT DESK';
export const KAIJU_NAME = 'TIDEMAW';
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

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
  source: 'ai' | 'fallback';
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

// ── Offline fallback ─────────────────────────────────────────────────────────

type Fill = (s: RunStats) => string;
const pick = <T>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length) % arr.length];

const HEADLINES: Fill[] = [
  (s) => `${KAIJU_NAME} LEVELS ${s.hardestHitDistrict.toUpperCase()}`,
  (s) => `${s.buildingsDestroyed} BUILDINGS AND COUNTING`,
  () => `MILITARY "REGROUPING," SOURCES SAY`,
  (s) => (s.tier === 3 ? 'SKYLINE REPORTED MISSING' : s.tier === 2 ? 'IT IS GETTING BIGGER' : 'SMALL MONSTER, BIG PROBLEM'),
  (s) => `WAVE ${s.wave}: CITY STILL STANDING (MOSTLY)`,
];

const ANCHORS: Fill[] = [
  (s) => `Good evening. ${KAIJU_NAME} has now destroyed ${s.buildingsDestroyed} buildings, and residents of ${s.hardestHitDistrict} are asking whether "regrouping" is a military term for running.`,
  (s) => `We go live to ${s.district}, where the creature — now ${TIER_FLAVOR[s.tier].size} — appears to be enjoying itself.`,
  (s) => `Officials insist the situation is under control, though ${s.tanksDestroyed} tanks and ${s.soldiersDefeated} soldiers might disagree.`,
  (s) => `Breaking tonight: ${s.carsCrushed} vehicles crushed, ${s.housesDestroyed} homes flattened, and the mayor has stopped answering the phone.`,
  (s) =>
    s.nearDeathMoments > 0
      ? `For a moment the creature was down to ${s.lowestHpPct}% strength. Then, witnesses say, it got angry.`
      : `After wave ${s.wave}, the military has yet to leave a scratch. Experts recommend "being somewhere else."`,
];

const TICKERS: Fill[] = [
  (s) => `${s.hardestHitDistrict.toUpperCase()} RESIDENTS URGED TO EVACUATE "IMMEDIATELY, OR SOONER"`,
  (s) => `DEFENSE MINISTRY: ${s.soldiersDefeated} INFANTRY "REASSIGNED TO RUNNING AWAY"`,
  (s) => `SEISMOLOGISTS LOG ${s.stompsUsed} STOMP EVENTS; RICHTER SCALE FILES COMPLAINT`,
  (s) => `INSURERS REDEFINE "ACT OF GOD" TO INCLUDE ${KAIJU_NAME}`,
  (s) => `TRAFFIC UPDATE: ${s.carsCrushed} CARS NOW SIGNIFICANTLY FLATTER`,
  (s) => `CITY PLANNERS CALL ${s.towersDestroyed} LOST TOWERS "AN OPPORTUNITY"`,
  () => `SHIOKAZE BAY FERRY SERVICE SUSPENDED, FERRY ALSO SUSPENDED IN A BUILDING`,
  () => `LOCAL NOODLE SHOP STAYS OPEN, "WE'VE SEEN WORSE"`,
  (s) => `SIZE ESTIMATE REVISED: ${TIER_FLAVOR[s.tier].size.toUpperCase()}`,
  (s) => `ARMORED DIVISIONS REPORT ${s.tanksDestroyed} TANKS "TEMPORARILY UPSIDE DOWN"`,
  () => `WEATHER: CLEAR SKIES, SCATTERED DEBRIS, CHANCE OF ROAR`,
];

const UPGRADE_TICKERS: Fill[] = [
  (s) => `EYEWITNESSES DESCRIBE NEW ABILITY: "${s.newUpgradesThisWave[0]?.toUpperCase()}"`,
  (s) => `SCIENTISTS BAFFLED BY CREATURE'S ${s.newUpgradesThisWave[0]?.toUpperCase()}`,
];

/** Deterministic-ish fallback: same stats + seed produce the same bulletin. */
export function cannedBulletin(s: RunStats, seed = s.wave * 7919 + s.buildingsDestroyed): Bulletin {
  let x = seed >>> 0 || 1;
  const r = () => {
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
  let headline = pick(HEADLINES, r)(s);
  if (s.outcome === 'victory') headline = `${KAIJU_NAME} DEFEATS FLAGSHIP MECH`;
  if (s.outcome === 'defeat') headline = `${KAIJU_NAME} DOWN — CITY EXHALES`;
  if (headline === s.previousHeadline) headline = HEADLINES[s.wave % HEADLINES.length](s);

  const pool = [...TICKERS];
  const ticker: string[] = [];
  if (s.newUpgradesThisWave.length) ticker.push(pick(UPGRADE_TICKERS, r)(s));
  if (s.nearDeathMoments > 0) ticker.push(`MILITARY BRIEFLY DECLARES VICTORY AT ${s.lowestHpPct}% — RETRACTS STATEMENT`);
  while (ticker.length < 4 && pool.length) {
    const i = Math.floor(r() * pool.length);
    ticker.push(pool.splice(i, 1)[0](s));
  }
  return { headline: headline.slice(0, 60), anchor: pick(ANCHORS, r)(s), ticker, source: 'fallback' };
}
