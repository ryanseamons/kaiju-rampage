// Tuning knobs and URL params. Everything a designer would poke lives here.
const params = new URLSearchParams(location.search);

/** `?fast=1` compresses wave length and growth curves for automated tests (`?fast=2` compresses harder, for the
 * playthrough spec). Gameplay rules are unchanged. */
const FAST_LEVEL = params.get('fast') === '2' ? 2 : params.get('fast') === '1' ? 1 : 0;
export const FAST = FAST_LEVEL > 0;
/** Local calendar date, YYYY-MM-DD: the key for the daily rampage. */
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dailySeed = (key: string) => {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 1_000_000_000;
};
/** `?daily=1`: everyone gets the same city and upgrade rolls today. */
export const DAILY = params.get('daily') === '1' ? todayKey() : null;
export const SEED = DAILY ? dailySeed(DAILY) : Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));
export const RENDERER = params.get('renderer') === 'canvas' ? 'canvas' : 'auto';
/** Debug: start at a later wave (e.g. `?startWave=5` to see the boss). Also grants that wave's expected tier. */
export const START_WAVE = Math.max(1, Math.min(5, Number(params.get('startWave') ?? 1)));
export const MUTED = params.get('mute') === '1';

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const TILE = 32;
export const MAP_W = 144; // tiles
export const MAP_H = 108;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;
/** Tile row where land ends and the bay begins. */
export const COAST_ROW = 92;
export const LAND_H = COAST_ROW * TILE;

export const TIME_SCALE = FAST_LEVEL === 2 ? 0.25 : FAST_LEVEL === 1 ? 0.4 : 1;

export interface TierDef {
  tier: 1 | 2 | 3;
  name: string;
  massToReach: number;
  zoom: number;
  scaleMin: number; // sprite scale at start of tier
  scaleMax: number; // sprite scale when about to tier up
  maxHp: number;
  speed: number;
}

export const TIERS: TierDef[] = [
  { tier: 1, name: 'HATCHLING', massToReach: 0, zoom: 2.1, scaleMin: 1.0, scaleMax: 1.4, maxHp: 100, speed: 150 },
  { tier: 2, name: 'BEHEMOTH', massToReach: 450, zoom: 1.15, scaleMin: 2.3, scaleMax: 3.0, maxHp: 180, speed: 185 },
  { tier: 3, name: 'CITY-ENDER', massToReach: 3000, zoom: 0.6, scaleMin: 4.6, scaleMax: 5.6, maxHp: 300, speed: 225 },
];

// Fast mode compresses time by TIME_SCALE, so growth/xp income is scaled by the inverse to keep wave-relative pacing.
export const MASS_MULT = 1 / TIME_SCALE;
export const XP_MULT = 1 / TIME_SCALE;

/** Size class of things in the city: crushed on contact if <= tier, damageable by attacks if <= tier + 1, otherwise solid. */
export const SIZE = { car: 1, soldier: 1, house: 2, tank: 3, tower: 3, mech: 4 } as const;

export const REWARDS = {
  car: { mass: 1.5, xp: 0, score: 10 },
  house: { mass: 6, xp: 1, score: 50 },
  tower: { mass: 18, xp: 3, score: 200 },
  soldier: { mass: 0.5, xp: 1, score: 20 },
  rocket: { mass: 0.8, xp: 2, score: 40 },
  heli: { mass: 3, xp: 6, score: 200 },
  tank: { mass: 5, xp: 5, score: 150 },
  cannon: { mass: 6, xp: 8, score: 250 },
  walker: { mass: 40, xp: 25, score: 1500 },
  mech: { mass: 0, xp: 0, score: 10000 },
};

export interface WaveDef {
  wave: number;
  duration: number; // seconds, before TIME_SCALE
  soldierRate: number; // infantry spawns per second (ramps up through the wave)
  soldierMax: number;
  /** Share of infantry that are rocket teams. */
  rocketShare: number;
  tankRate: number;
  tankMax: number;
  heliRate: number;
  heliMax: number;
  cannonRate: number;
  cannonMax: number;
  /** Jet bombing runs every ~20 s. */
  jets: boolean;
  /** A heavy walker mid-boss arrives partway through. */
  walker: boolean;
  /** An encirclement ring closes in at the halfway point. */
  ring: boolean;
  boss: boolean;
  endless?: boolean;
}

export const WAVES: WaveDef[] = [
  { wave: 1, duration: 80, soldierRate: 0.55, soldierMax: 14, rocketShare: 0, tankRate: 0, tankMax: 0, heliRate: 0, heliMax: 0, cannonRate: 0, cannonMax: 0, jets: false, walker: false, ring: false, boss: false },
  { wave: 2, duration: 105, soldierRate: 1.1, soldierMax: 30, rocketShare: 0.2, tankRate: 0.1, tankMax: 4, heliRate: 0, heliMax: 0, cannonRate: 0, cannonMax: 0, jets: false, walker: false, ring: true, boss: false },
  { wave: 3, duration: 120, soldierRate: 1.2, soldierMax: 40, rocketShare: 0.3, tankRate: 0.2, tankMax: 8, heliRate: 0.05, heliMax: 3, cannonRate: 0, cannonMax: 0, jets: false, walker: true, ring: true, boss: false },
  { wave: 4, duration: 130, soldierRate: 1.1, soldierMax: 45, rocketShare: 0.35, tankRate: 0.3, tankMax: 12, heliRate: 0.08, heliMax: 4, cannonRate: 0.05, cannonMax: 3, jets: true, walker: false, ring: true, boss: false },
  { wave: 5, duration: 150, soldierRate: 0.8, soldierMax: 30, rocketShare: 0.35, tankRate: 0.15, tankMax: 6, heliRate: 0.06, heliMax: 3, cannonRate: 0.04, cannonMax: 2, jets: true, walker: false, ring: false, boss: true },
];

/** Wave n (1-based). Waves past 5 are endless: wave 4's mix, scaled up, with a mech every other wave. */
export function waveDef(n: number): WaveDef {
  if (n <= WAVES.length) return WAVES[n - 1];
  const k = n - WAVES.length; // 1, 2, 3...
  const base = WAVES[3];
  const f = 1 + 0.18 * k;
  return {
    ...base,
    wave: n,
    duration: 100,
    soldierRate: base.soldierRate * f,
    soldierMax: Math.round(base.soldierMax * f),
    tankRate: base.tankRate * f,
    tankMax: Math.round(base.tankMax * f),
    heliRate: base.heliRate * f,
    heliMax: Math.round(base.heliMax * f),
    cannonRate: base.cannonRate * f,
    cannonMax: Math.round(base.cannonMax * f),
    walker: k % 2 === 1,
    boss: k % 2 === 0,
    endless: true,
  };
}

/**
 * Start fetching the bulletin this many real seconds before the wave ends, so the break never waits.
 * Opus 5.5 at medium effort measured ~14s per bulletin. Never earlier than BULLETIN_MIN_FRACTION of the wave.
 */
export const BULLETIN_LEAD_S = 22;
/** Seconds at the start of wave 1 with no spawns: time to read the HUD and take a first step. */
export const WAVE1_GRACE_S = 8;
export const BULLETIN_MIN_FRACTION = 0.4;
/** Max ms the wave break waits for an in-flight AI bulletin before showing the canned one. */
export const BULLETIN_WAIT_MS = 2000;

/** Enemy HP and damage multipliers for wave n (endless waves keep climbing). */
export const waveHpMult = (n: number) => 1 + 0.15 * (n - 1) + 0.12 * Math.max(0, n - WAVES.length);
export const waveDmgMult = (n: number) => 1 + 0.08 * (n - 1) + 0.06 * Math.max(0, n - WAVES.length);

/** Combo: each kill or destruction within COMBO_WINDOW seconds extends the chain. */
export const COMBO_WINDOW = 2.2;
export const comboMult = (combo: number) => 1 + Math.min(4, Math.floor(combo / 15) * 0.5);

export const XP_TO_LEVEL = (level: number) => Math.max(2, Math.round((4 + 3 * level + 0.35 * level * level) / XP_MULT));
