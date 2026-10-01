// Stages: one city generator, six looks. The stage is fixed at load time (like the seed): the daily
// rampage uses the day's stage, `?stage=` picks one for testing, and normal runs are Shiokaze Bay.
// Textures (palettes), the city generator (block mix, extras) and the weather layer read STAGE_DEF.
import { DAILY } from './config';
import { STAGES, dailyConfig, type StageId } from './daily';

export interface StageDef {
  id: StageId;
  /** Ground tiles. */
  lot: string;
  sidewalk: string;
  road: string;
  roadLine: string;
  park: string;
  parkHi: string;
  sand: string;
  water: string;
  waterHi: string;
  /** Building colours. */
  roofs: string[];
  towerBodies: string[];
  windowLit: string[];
  leaves: string[];
  /** Snow caps on roofs and trees. */
  snow?: boolean;
  /** Fraction of towers carrying a neon sign. */
  neonSigns: number;
  /** Block patterns by district, overriding the bay's defaults where given. */
  blocks?: (district: string) => [string, number][] | null;
  /** Small extras placed along streets (instead of some cars) and in blocks. */
  extras?: 'stalls' | 'tanks' | null;
  weather?: 'rain' | 'snow' | 'lanterns' | 'neon' | null;
  /** Lightning strikes (Typhoon). */
  lightning?: boolean;
  /** Background clear colour. */
  bg: string;
}

const BAY: StageDef = {
  id: 'bay',
  lot: '#191c2c', sidewalk: '#2a2d42', road: '#12131c', roadLine: '#8a7424', park: '#132a20', parkHi: '#1a3a2a', sand: '#3d3a30', water: '#0a1c38', waterHi: '#1d3f6e',
  roofs: ['#7a2f38', '#2f4f7a', '#6b4b2f', '#3f6b4b', '#5a3f6b', '#6b6b6b'],
  towerBodies: ['#252a44', '#2d2440', '#1f3340', '#322a2a'],
  windowLit: ['#ffd66b', '#ffe9a8', '#7ef0ff', '#ff8adf'],
  leaves: ['#1f4a2e', '#24553a', '#2a4a24'],
  neonSigns: 0.33,
  bg: '#05060d',
};

export const STAGE_DEFS: Record<StageId, StageDef> = {
  bay: BAY,
  market: {
    ...BAY,
    id: 'market',
    lot: '#2a1c1e', sidewalk: '#3b2a26', road: '#1d1414', roadLine: '#b06a2a', park: '#1d2a1a', parkHi: '#2a3a22', sand: '#4a3a2a',
    roofs: ['#9a2a24', '#b0502a', '#6b2a2a', '#7a4a2a', '#3a2a2a', '#8a3a3a'],
    windowLit: ['#ffb24a', '#ffd38a', '#ff8a4a', '#ffe0a0'],
    neonSigns: 0.1,
    blocks: (d) => (d === 'the Harbor' ? null : [['houses', 0.62], ['stalls', 0.2], ['park', 0.1], ['mixed', 0.08]]),
    extras: 'stalls',
    weather: 'lanterns',
    bg: '#0d0606',
  },
  neon: {
    ...BAY,
    id: 'neon',
    lot: '#140f24', sidewalk: '#241a3a', road: '#0b0814', roadLine: '#d13fa0', park: '#10221e', parkHi: '#163a30',
    towerBodies: ['#1c1838', '#26163a', '#14243a', '#2a1630'],
    windowLit: ['#7ef0ff', '#ff8adf', '#c08aff', '#ffe9a8'],
    neonSigns: 0.85,
    blocks: (d) => (d === 'the Harbor' ? null : [['towers', 0.62], ['mixed', 0.3], ['park', 0.08]]),
    weather: 'neon',
    bg: '#07041a',
  },
  harbor: {
    ...BAY,
    id: 'harbor',
    lot: '#22221f', sidewalk: '#35342e', road: '#151513', roadLine: '#c8a02a', park: '#1b241c', parkHi: '#24302a', sand: '#3a3428',
    roofs: ['#5a5a52', '#6b4b2f', '#4a5a6b', '#7a6a3a', '#5a3a2a', '#3a4a4a'],
    towerBodies: ['#2c2c2a', '#33302a', '#2a3036', '#3a2e26'],
    neonSigns: 0.1,
    blocks: () => [['warehouse', 0.5], ['tanks', 0.25], ['houses', 0.15], ['towers', 0.1]],
    extras: 'tanks',
    bg: '#07070a',
  },
  snow: {
    ...BAY,
    id: 'snow',
    // moonlit snow: blue-grey rather than daylight white
    lot: '#7f8ba2', sidewalk: '#6d7890', road: '#2e3446', roadLine: '#c8b06a', park: '#8e9ab0', parkHi: '#b4c0d4', sand: '#7a8396', water: '#10243e', waterHi: '#2e5a86',
    roofs: ['#8a3a3a', '#3a4a7a', '#5a3a2a', '#3a6a4a', '#6a4a6a', '#5a5a5a'],
    leaves: ['#1c3a2a', '#20442e', '#183224'],
    snow: true,
    neonSigns: 0.1,
    blocks: (d) => (d === 'the Harbor' ? null : [['houses', 0.5], ['park', 0.42], ['mixed', 0.08]]),
    weather: 'snow',
    bg: '#0e1420',
  },
  typhoon: {
    ...BAY,
    id: 'typhoon',
    lot: '#141a24', sidewalk: '#202a38', road: '#0c1622', roadLine: '#5a7a8a', park: '#102420', parkHi: '#16302a', water: '#06162a', waterHi: '#2a5a8a',
    weather: 'rain',
    lightning: true,
    bg: '#03060c',
  },
};

const param = new URLSearchParams(location.search).get('stage') as StageId | null;
/** The stage for this page load. */
export const STAGE: StageId = DAILY ? dailyConfig(DAILY).stage : param && (STAGES as readonly string[]).includes(param) ? param : 'bay';
export const STAGE_DEF: StageDef = STAGE_DEFS[STAGE];
