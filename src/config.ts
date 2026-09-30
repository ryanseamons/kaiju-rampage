// Tuning knobs and URL params. Everything a designer would poke lives here.
const params = new URLSearchParams(location.search);

/** `?fast=1` compresses wave length and growth curves for automated tests. Gameplay rules are unchanged. */
export const FAST = params.get('fast') === '1';
export const SEED = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));
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

export const TIME_SCALE = FAST ? 0.4 : 1;

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
export const MASS_MULT = FAST ? 2.5 : 1;
export const XP_MULT = FAST ? 2.5 : 1;

/** Size class of things in the city: crushed on contact if <= tier, damageable by attacks if <= tier + 1, otherwise solid. */
export const SIZE = { car: 1, soldier: 1, house: 2, tank: 3, tower: 3, mech: 4 } as const;

export const REWARDS = {
  car: { mass: 1.5, xp: 0 },
  house: { mass: 6, xp: 1 },
  tower: { mass: 18, xp: 3 },
  soldier: { mass: 0.5, xp: 1 },
  tank: { mass: 5, xp: 5 },
  mech: { mass: 0, xp: 0 },
};

export interface WaveDef {
  wave: number;
  duration: number; // seconds, before TIME_SCALE
  soldierRate: number; // spawns per second
  soldierMax: number;
  tankRate: number;
  tankMax: number;
  boss: boolean;
}

export const WAVES: WaveDef[] = [
  { wave: 1, duration: 80, soldierRate: 0.8, soldierMax: 18, tankRate: 0, tankMax: 0, boss: false },
  { wave: 2, duration: 105, soldierRate: 1.1, soldierMax: 30, tankRate: 0.1, tankMax: 4, boss: false },
  { wave: 3, duration: 120, soldierRate: 1.2, soldierMax: 40, tankRate: 0.2, tankMax: 8, boss: false },
  { wave: 4, duration: 130, soldierRate: 1.1, soldierMax: 45, tankRate: 0.3, tankMax: 12, boss: false },
  { wave: 5, duration: 150, soldierRate: 0.8, soldierMax: 30, tankRate: 0.15, tankMax: 6, boss: true },
];

/**
 * Start fetching the bulletin this many real seconds before the wave ends, so the break never waits.
 * Opus 5.5 at medium effort measured ~14s per bulletin. Never earlier than BULLETIN_MIN_FRACTION of the wave.
 */
export const BULLETIN_LEAD_S = 22;
export const BULLETIN_MIN_FRACTION = 0.4;
/** Max ms the wave break waits for an in-flight AI bulletin before showing the canned one. */
export const BULLETIN_WAIT_MS = 2000;

export const XP_TO_LEVEL = (level: number) => Math.max(2, Math.round((4 + 3 * level + 0.35 * level * level) / XP_MULT));
