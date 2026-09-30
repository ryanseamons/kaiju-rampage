// Tracks what happened in the run so the news desk can react to it.
import type { RunStats, Tier } from './shared/narration';
import { WAVES } from './config';

export class RunTracker {
  buildings = 0;
  houses = 0;
  towers = 0;
  cars = 0;
  soldiers = 0;
  tanks = 0;
  helis = 0;
  cannons = 0;
  walkers = 0;
  evolutions: string[] = [];
  bossDefeated = false;
  nearDeath = 0;
  lowestHpPct = 100;
  stomps = 0;
  elapsed = 0;
  upgrades: string[] = [];
  private waveUpgrades: string[] = [];
  private waveBuildings = 0;
  private waveByDistrict = new Map<string, number>();
  private inDanger = false;
  previousHeadline?: string;

  destroyed(kind: string, district: string) {
    if (kind === 'car') this.cars++;
    if (kind === 'tree') return;
    if (kind === 'car') return;
    this.buildings++;
    this.waveBuildings++;
    if (kind === 'tower') this.towers++;
    else this.houses++;
    this.waveByDistrict.set(district, (this.waveByDistrict.get(district) ?? 0) + 1);
  }

  upgraded(name: string) {
    this.upgrades.push(name);
    this.waveUpgrades.push(name);
  }

  hp(pct: number) {
    this.lowestHpPct = Math.min(this.lowestHpPct, Math.round(pct));
    if (!this.inDanger && pct < 25) {
      this.inDanger = true;
      this.nearDeath++;
    } else if (this.inDanger && pct > 50) this.inDanger = false;
  }

  startWave() {
    this.waveBuildings = 0;
    this.waveUpgrades = [];
    this.waveByDistrict.clear();
  }

  snapshot(o: { wave: number; tier: Tier; level: number; district: string; hpPct: number; outcome: RunStats['outcome'] }): RunStats {
    let hardest = o.district, best = -1;
    for (const [d, n] of this.waveByDistrict) if (n > best) { best = n; hardest = d; }
    const counts = new Map<string, number>();
    for (const u of this.upgrades) counts.set(u, (counts.get(u) ?? 0) + 1);
    return {
      wave: o.wave,
      totalWaves: WAVES.length,
      outcome: o.outcome,
      tier: o.tier,
      level: o.level,
      district: o.district,
      hardestHitDistrict: hardest,
      buildingsDestroyed: this.buildings,
      waveBuildingsDestroyed: this.waveBuildings,
      housesDestroyed: this.houses,
      towersDestroyed: this.towers,
      carsCrushed: this.cars,
      soldiersDefeated: this.soldiers,
      tanksDestroyed: this.tanks,
      bossDefeated: this.bossDefeated,
      nearDeathMoments: this.nearDeath,
      lowestHpPct: this.lowestHpPct,
      hpPct: Math.round(o.hpPct),
      upgrades: [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)),
      newUpgradesThisWave: [...new Set(this.waveUpgrades)],
      stompsUsed: this.stomps,
      elapsedSec: Math.round(this.elapsed),
      previousHeadline: this.previousHeadline,
    };
  }
}
