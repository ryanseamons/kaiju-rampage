// The shipped news bank (default, no key): size, slot coverage and grammar across stat profiles.
import { test, expect } from '@playwright/test';
import { ANCHORS, HEADLINES, TICKERS, eligible, render, slotsFor, type Template } from '../src/shared/bank';
import { TIER_FLAVOR, bankBulletin, type RunStats } from '../src/shared/narration';

const base: RunStats = {
  wave: 1, totalWaves: 5, outcome: 'wave-cleared', tier: 1, level: 1, district: 'the Harbor', hardestHitDistrict: 'the Harbor',
  buildingsDestroyed: 0, waveBuildingsDestroyed: 0, housesDestroyed: 0, towersDestroyed: 0, carsCrushed: 0, soldiersDefeated: 0,
  tanksDestroyed: 0, bossDefeated: false, nearDeathMoments: 0, lowestHpPct: 100, hpPct: 100, upgrades: [], newUpgradesThisWave: [],
  stompsUsed: 0, elapsedSec: 30,
};
const PROFILES: Record<string, RunStats> = {
  zero: base,
  singles: { ...base, wave: 2, tier: 2, buildingsDestroyed: 1, waveBuildingsDestroyed: 1, housesDestroyed: 1, towersDestroyed: 1, carsCrushed: 1, soldiersDefeated: 1, tanksDestroyed: 1, nearDeathMoments: 1, lowestHpPct: 20, stompsUsed: 1, upgrades: ['Tail Spin'], newUpgradesThisWave: ['Tail Spin'] },
  mid: { ...base, wave: 2, tier: 2, level: 7, district: 'Downtown', hardestHitDistrict: 'Old Town', buildingsDestroyed: 58, waveBuildingsDestroyed: 31, housesDestroyed: 52, towersDestroyed: 6, carsCrushed: 74, soldiersDefeated: 88, tanksDestroyed: 5, nearDeathMoments: 2, lowestHpPct: 18, hpPct: 64, upgrades: ['Atomic Breath', 'Thick Hide', 'Tail Spin'], newUpgradesThisWave: ['Tail Spin'], stompsUsed: 14, elapsedSec: 310 },
  big: { ...base, wave: 4, tier: 3, level: 18, district: 'Neon Row', hardestHitDistrict: 'Downtown', buildingsDestroyed: 410, waveBuildingsDestroyed: 160, housesDestroyed: 300, towersDestroyed: 110, carsCrushed: 400, soldiersDefeated: 500, tanksDestroyed: 40, lowestHpPct: 55, hpPct: 90, upgrades: ['Atomic Breath', 'Frenzy', 'Spine Volley', 'Fallout Aura'], stompsUsed: 60, elapsedSec: 540 },
  quietT3: { ...base, wave: 3, tier: 3, buildingsDestroyed: 90, waveBuildingsDestroyed: 2, housesDestroyed: 80, towersDestroyed: 10, carsCrushed: 3, lowestHpPct: 70 },
  victory: { ...base, wave: 5, tier: 3, outcome: 'victory', bossDefeated: true, buildingsDestroyed: 520, housesDestroyed: 380, towersDestroyed: 140, tanksDestroyed: 60, soldiersDefeated: 700, elapsedSec: 640 },
  defeatEarly: { ...base, wave: 1, outcome: 'defeat', lowestHpPct: 0, hpPct: 0, nearDeathMoments: 1 },
  landmarks: { ...base, wave: 3, tier: 3, district: 'Downtown', hardestHitDistrict: 'Downtown', buildingsDestroyed: 200, waveBuildingsDestroyed: 60, housesDestroyed: 150, towersDestroyed: 30, landmarksDestroyed: ['Shiokaze Castle', 'the KBN-7 Tower'], elapsedSec: 400 },
  landmarksWin: { ...base, wave: 5, tier: 3, outcome: 'victory', bossDefeated: true, buildingsDestroyed: 500, housesDestroyed: 380, towersDestroyed: 120, landmarksDestroyed: ['the KBN-7 Tower'], elapsedSec: 640 },
  defeatLate: { ...base, wave: 4, tier: 3, outcome: 'defeat', buildingsDestroyed: 300, towersDestroyed: 50, housesDestroyed: 250, elapsedSec: 480, lowestHpPct: 0, hpPct: 0 },
};

const NOUN = '(buildings?|towers?|tanks?|soldiers?|vehicles?|homes?|stomps?|infantry)';
function problems(text: string): string[] {
  const p: string[] = [];
  if (/\{\w+\}/.test(text)) p.push('unfilled slot');
  if (/undefined|NaN|\[object/.test(text)) p.push('bad value');
  if (new RegExp(`\\b0 ${NOUN}\\b`, 'i').test(text)) p.push('zero-count phrasing');
  if (/\b1 (buildings|towers|tanks|soldiers|vehicles|homes|stomps)\b/i.test(text)) p.push('bad plural');
  return p;
}

test('bank has at least 100 anchor lines and 100 ticker fragments', () => {
  console.log(`bank sizes: headlines=${HEADLINES.length} anchors=${ANCHORS.length} tickers=${TICKERS.length}`);
  expect(ANCHORS.length).toBeGreaterThanOrEqual(100);
  expect(TICKERS.length).toBeGreaterThanOrEqual(100);
  expect(HEADLINES.length).toBeGreaterThanOrEqual(25);
});

test('every template renders cleanly for every stat profile it is eligible for, and each is reachable', () => {
  const reached = new Set<Template>();
  const bad: string[] = [];
  for (const [name, s] of Object.entries(PROFILES)) {
    const slots = slotsFor(s, { kaiju: 'Tidemaw', size: TIER_FLAVOR[s.tier].size, threat: TIER_FLAVOR[s.tier].threat });
    for (const list of [HEADLINES, ANCHORS, TICKERS]) {
      for (const t of eligible(list, s)) {
        reached.add(t);
        const out = render(t.t, slots);
        for (const p of problems(out)) bad.push(`[${name}] ${p}: ${out}`);
      }
    }
  }
  expect(bad).toEqual([]);
  const unreached = [...HEADLINES, ...ANCHORS, ...TICKERS].filter((t) => !reached.has(t)).map((t) => t.t);
  expect(unreached).toEqual([]);
});

test('a five-wave run never repeats a line and every card is complete', () => {
  const used = new Set<string>();
  const seen = new Set<string>();
  const waves: RunStats[] = [1, 2, 3, 4].map((w) => ({ ...PROFILES.mid, wave: w, tier: (w < 2 ? 1 : w < 4 ? 2 : 3) as 1 | 2 | 3 }));
  waves.push({ ...PROFILES.victory });
  for (const s of waves) {
    const b = bankBulletin(s, used);
    expect(b.source).toBe('bank');
    expect(b.headline.length).toBeGreaterThan(5);
    expect(b.ticker).toHaveLength(4);
    for (const line of [b.headline, b.anchor, ...b.ticker]) {
      expect(problems(line), line).toEqual([]);
      expect(seen.has(line), `repeat: ${line}`).toBe(false);
      seen.add(line);
    }
  }
});

test('bank bulletins react to the run: a big destructive wave mentions its numbers or places', () => {
  const s = PROFILES.mid;
  let hits = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const b = bankBulletin(s, new Set(), seed);
    const text = [b.headline, b.anchor, ...b.ticker].join(' ').toUpperCase();
    if (/58|31|74|88|OLD TOWN|DOWNTOWN|TAIL SPIN|18%|BEHEMOTH|THREE-STOREY/.test(text)) hits++;
  }
  expect(hits).toBeGreaterThanOrEqual(36);
});
