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
  { tier: 2, name: 'BEHEMOTH', massToReach: 140, zoom: 1.15, scaleMin: 2.3, scaleMax: 3.0, maxHp: 180, speed: 185 },
  { tier: 3, name: 'CITY-ENDER', massToReach: 520, zoom: 0.6, scaleMin: 4.6, scaleMax: 5.6, maxHp: 300, speed: 225 },
];

export const MASS_MULT = FAST ? 2.6 : 1;
export const XP_MULT = FAST ? 1.6 : 1;

/** Size class of things in the city: crushed on contact if <= tier, damageable by attacks if <= tier + 1, otherwise solid. */
export const SIZE = { car: 1, soldier: 1, house: 2, tank: 3, tower: 3, mech: 4 } as const;

export const REWARDS = {
  car: { mass: 2, xp: 1 },
  house: { mass: 7, xp: 2 },
  tower: { mass: 24, xp: 5 },
  soldier: { mass: 1, xp: 1 },
  tank: { mass: 6, xp: 4 },
  mech: { mass: 80, xp: 30 },
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
  { wave: 1, duration: 80, soldierRate: 1.3, soldierMax: 45, tankRate: 0, tankMax: 0, boss: false },
  { wave: 2, duration: 105, soldierRate: 1.6, soldierMax: 60, tankRate: 0.12, tankMax: 6, boss: false },
  { wave: 3, duration: 120, soldierRate: 1.4, soldierMax: 60, tankRate: 0.22, tankMax: 10, boss: false },
  { wave: 4, duration: 130, soldierRate: 1.2, soldierMax: 55, tankRate: 0.32, tankMax: 14, boss: false },
  { wave: 5, duration: 150, soldierRate: 0.8, soldierMax: 40, tankRate: 0.15, tankMax: 8, boss: true },
];

/** When (fraction of the wave) to start fetching the bulletin so the break never waits. */
export const BULLETIN_PREFETCH_AT = 0.85;
/** Max ms the wave break waits for an in-flight AI bulletin before showing the canned one. */
export const BULLETIN_WAIT_MS = 1500;

export const XP_TO_LEVEL = (level: number) => Math.round((6 + level * 5) / XP_MULT);
