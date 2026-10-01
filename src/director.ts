// Wave director: spawn rates that ramp through each wave, plus the set pieces
// (elites, the encirclement ring, the heavy walker, air strikes, the boss) and the news prefetch.
import Phaser from 'phaser';
import { BULLETIN_LEAD_S, BULLETIN_MIN_FRACTION, TIME_SCALE, WAVE1_GRACE_S, waveDef, type WaveDef } from './config';
import type { EnemyType } from './enemies';
import type { GameScene } from './scenes/GameScene';
import { dailyName, t } from './i18n';
import { sfx } from './sfx';
import { music } from './audio/music';
import { rng } from './rand';

export class Director {
  wave!: WaveDef;
  time = 0;
  private soldierAcc = 0;
  private tankAcc = 0;
  private heliAcc = 0;
  private cannonAcc = 0;
  private bossAt = -1;
  private elitesAt: number[] = [];
  private ringAt = -1;
  private walkerAt = -1;
  private nextJet = -1;
  private jetsAnnounced = false;
  private threatAcc = 0;
  private threatT = 10;

  constructor(private s: GameScene) {}

  get duration() {
    return this.wave.duration * TIME_SCALE;
  }

  start(n: number) {
    const w = (this.wave = waveDef(n));
    this.time = 0;
    this.soldierAcc = this.tankAcc = this.heliAcc = this.cannonAcc = 0;
    const d = this.duration;
    this.bossAt = w.boss ? 4 : -1;
    // Easy: one elite at 35%. Medium and Hard spread more of them through the wave.
    const k = this.s.diff.elites;
    this.elitesAt = n >= 2 ? Array.from({ length: k }, (_, i) => d * (k === 1 ? 0.35 : 0.2 + (0.55 * i) / (k - 1))) : [];
    this.ringAt = w.ring ? d * 0.5 : -1;
    this.walkerAt = w.walker ? (w.endless ? d * 0.3 : d * 0.55) : -1;
    // Harder settings bring the air force in a wave early (wave 3).
    const air = this.s.twists?.has('air') ?? false;
    const jets = w.jets || air || (this.s.diff.jetGap < 1 && n >= 3);
    this.nextJet = jets ? 12 * TIME_SCALE + 4 : -1;
    this.jetsAnnounced = false;
    // the first one turns up a couple of seconds into the wave
    this.threatAcc = 0.9;
    this.threatT = 3 * TIME_SCALE;
  }

  update(dt: number) {
    const s = this.s, w = this.wave, e = s.enemies, tier = s.tier, df = s.diff;
    this.time += dt;
    const progress = w.boss ? 0.6 : Phaser.Math.Clamp(this.time / this.duration, 0, 1);
    // Pressure climbs through the wave: 70% of the listed rate at the start, 130% at the end.
    const ramp = 0.7 + 0.6 * progress;

    // infantry: squads at higher tiers (none during the opening grace period of wave 1)
    const grace = w.wave === 1 && this.time < WAVE1_GRACE_S * TIME_SCALE;
    if (!grace) this.soldierAcc += w.soldierRate * df.spawn * ramp * dt;
    const squad = tier === 3 ? 4 : tier === 2 ? 2 : 1;
    const infantry = e.count('soldier') + e.count('rocket');
    if (infantry < w.soldierMax * df.cap) {
      while (this.soldierAcc >= squad) {
        this.soldierAcc -= squad;
        const kind: EnemyType = rng.spawn.frac() < w.rocketShare ? 'rocket' : 'soldier';
        const lead = e.spawnOffscreen(kind);
        for (let i = 1; i < squad; i++) e.spawn(rng.spawn.frac() < w.rocketShare ? 'rocket' : 'soldier', lead.x + rng.spawn.between(-24, 24), lead.y + rng.spawn.between(-24, 24));
      }
    }
    this.soldierAcc = Math.min(this.soldierAcc, squad * 2);
    this.tankAcc = this.spawnKind('tank', w.tankRate * (tier === 1 ? 0.6 : 1) * df.spawn * ramp, w.tankMax * df.cap, this.tankAcc, dt);
    // Heavy weapons are the tier-3 threat: harder settings field them in greater numbers, from wave 3.
    const heavy = tier >= 3 ? df.heavy : 1;
    this.heliAcc = this.spawnKind('heli', w.heliRate * df.spawn * heavy * ramp, Math.round(w.heliMax * df.cap * Math.sqrt(heavy)), this.heliAcc, dt);
    const cannonRate = w.cannonRate || (df.heavy > 1 && w.wave >= 3 ? 0.04 : 0);
    const cannonMax = w.cannonMax || (df.heavy > 1 && w.wave >= 3 ? 2 : 0);
    this.cannonAcc = this.spawnKind('cannon', tier >= 3 ? cannonRate * heavy * ramp : 0, Math.round(cannonMax * df.cap * Math.sqrt(heavy)), this.cannonAcc, dt);

    // the day's featured threat, all run long
    this.spawnThreat(dt, ramp);

    // set pieces
    if (this.elitesAt.length && this.time >= this.elitesAt[0]) {
      this.elitesAt.shift();
      const kind: EnemyType = tier >= 3 ? 'tank' : tier === 2 ? rng.spawn.pick(['rocket', 'tank']) : 'soldier';
      e.spawnOffscreen(kind, true);
    }
    if (this.ringAt >= 0 && this.time >= this.ringAt) {
      this.ringAt = -1;
      e.encircle(Math.round((12 + 4 * Math.min(w.wave, 8)) * df.ring), w.rocketShare);
      s.ui.banner(t('surrounded'), t('surroundedSub'), true);
      sfx.alarm();
    }
    if (this.walkerAt >= 0 && this.time >= this.walkerAt) {
      this.walkerAt = -1;
      e.spawnOffscreen('walker');
      s.ui.banner(t('walkerTitle'), t('walkerSub'), true);
      sfx.alarm();
    }
    const air = s.twists?.has('air') ?? false;
    if (this.nextJet >= 0 && this.time >= this.nextJet && (tier >= 2 || air)) {
      this.nextJet = this.time + rng.spawn.float(16, 24) * (w.endless ? 0.7 : 1) * df.jetGap * (air ? 0.5 : 1);
      if (!this.jetsAnnounced) {
        this.jetsAnnounced = true;
        s.ui.banner(t('airStrike'), t('airStrikeSub'), true);
      }
      e.jetRun();
    }

    if (w.boss) {
      if (this.bossAt >= 0 && this.time >= this.bossAt) {
        this.bossAt = -1;
        e.spawnOffscreen(s.bossType);
        s.ui.banner(t('warning'), s.bossId === 'guardian' ? t('mechInbound') : t('bossInbound', { name: dailyName('boss', s.bossId) }), true);
        sfx.alarm();
        music.play('boss');
      }
      const b = e.boss;
      if (b && b.hp < b.maxHp * 0.35 && s.news.prefetchedFor !== w.wave) s.news.prefetch(s.snapshot('victory'));
    } else {
      const prefetchAt = Math.max(this.duration * BULLETIN_MIN_FRACTION, this.duration - BULLETIN_LEAD_S);
      if (this.time >= prefetchAt && s.news.prefetchedFor !== w.wave) s.news.prefetch(s.snapshot('wave-cleared'));
      if (this.time >= this.duration) s.endWave('wave-cleared');
    }
  }

  private spawnThreat(dt: number, ramp: number) {
    const s = this.s, th = s.threat, e = s.enemies, n = this.wave.wave, df = s.diff;
    if (!th) return;
    this.threatT -= dt;
    switch (th) {
      case 'maser':
        this.threatAcc = this.spawnKind('maser', (n >= 2 ? 0.05 : 0.025) * ramp * df.spawn, 1 + Math.floor(n / 2), this.threatAcc, dt);
        break;
      case 'freeze':
        this.threatAcc = this.spawnKind('freeze', (0.04 + 0.015 * n) * ramp * df.spawn, 2 + n, this.threatAcc, dt);
        break;
      case 'netheli':
        this.threatAcc = this.spawnKind('netheli', (n >= 2 ? 0.04 : 0.02) * ramp * df.spawn, 1 + Math.floor(n / 2), this.threatAcc, dt);
        break;
      case 'railgun':
        this.threatAcc = this.spawnKind('railgun', (n >= 2 ? 0.035 : 0.018) * ramp * df.spawn, 1 + Math.floor(n / 3), this.threatAcc, dt);
        break;
      case 'drones':
        if (this.threatT <= 0) {
          this.threatT = (20 - Math.min(n, 4) * 2) * TIME_SCALE;
          e.spawnSwarm(Math.round((5 + 2 * n) * df.cap));
        }
        break;
      case 'riot':
        if (this.threatT <= 0) {
          this.threatT = 26 * TIME_SCALE;
          e.spawnRiotLine(Math.round((5 + n) * df.cap));
        }
        break;
      case 'sub':
        if (this.threatT <= 0 && e.count('sub') < (n >= 4 ? 2 : 1)) {
          this.threatT = 15 * TIME_SCALE;
          e.spawnSub();
        }
        break;
    }
  }

  private spawnKind(kind: EnemyType, rate: number, max: number, acc: number, dt: number) {
    acc += rate * dt;
    while (acc >= 1 && this.s.enemies.count(kind) < max) {
      acc -= 1;
      this.s.enemies.spawnOffscreen(kind);
    }
    return Math.min(acc, 2);
  }
}
