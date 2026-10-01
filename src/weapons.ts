// Auto-attacks: claw swipe (always), atomic breath, tail spin, spine volley, fallout aura,
// their five evolutions (from supply crates), and the stomp. Kaiju Rage boosts everything.
import Phaser from 'phaser';
import type { GameScene } from './scenes/GameScene';
import type { Enemy } from './enemies';
import { circleHits, type Destructible } from './city';
import { sfx } from './sfx';
import { rng } from './rand';

interface Spine extends Phaser.GameObjects.Image {
  target: Enemy | null;
  life: number;
  dmg: number;
  hits: number;
  hitSet: Set<Enemy>;
}

const enemyRadius = (e: Enemy) => (e.etype === 'mech' ? 40 : e.etype === 'walker' ? 26 : e.etype === 'tank' || e.etype === 'cannon' || e.etype === 'heli' ? 12 : 4);

export class Weapons {
  private cd = { claw: 0.5, breath: 1.5, tail: 2, spines: 1, aura: 0 };
  private spines: Spine[] = [];
  private beam: Phaser.GameObjects.Image;
  private beamT = 0;
  private beamDur = 0.55;
  private beamTick = 0;
  private beamAngle = 0;
  private beamBase = 0;
  private tmp: Destructible[] = [];

  constructor(private s: GameScene) {
    this.beam = s.add.image(0, 0, 'beam').setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9200);
  }

  private nearestEnemy(range: number, exclude?: Set<Enemy>): Enemy | null {
    const p = this.s.player;
    let best: Enemy | null = null, bd = range * range;
    for (const e of this.s.enemies.list) {
      if (e.dead || exclude?.has(e)) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Hit everything (enemies + destructibles up to tier+1) inside a circle, optionally an arc. Returns enemies hit. */
  private area(x: number, y: number, r: number, dmg: number, knock: number, arc?: { angle: number; half: number }) {
    const s = this.s;
    const inArc = (tx: number, ty: number) => {
      if (!arc) return true;
      const a = Math.atan2(ty - y, tx - x);
      return Math.abs(Phaser.Math.Angle.Wrap(a - arc.angle)) <= arc.half;
    };
    let hit = 0;
    for (const e of [...s.enemies.list]) {
      const er = enemyRadius(e);
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= r + er && (d < er + 4 || inArc(e.x, e.y))) {
        const k = knock / Math.max(1, d);
        s.damageEnemy(e, dmg, (e.x - x) * k, (e.y - y) * k);
        hit++;
      }
    }
    this.tmp.length = 0;
    for (const d of s.city.grid.query(x, y, r, this.tmp)) {
      if (d.sizeClass > s.tier + 1) continue;
      if (!circleHits(d, x, y, r)) continue;
      if (!inArc(d.x, d.y) && !circleHits(d, x, y, r * 0.35)) continue;
      s.damageDestructible(d, dmg);
    }
    return hit;
  }

  update(dt: number) {
    const s = this.s, p = s.player, m = p.mods, k = p.scale;
    const rage = m.rage > 0;
    const pow = p.power * (rage ? 1.5 : 1);
    const cdm = m.cooldown * (rage ? 0.66 : 1);
    const evo = m.evo;
    for (const key of Object.keys(this.cd) as (keyof typeof this.cd)[]) this.cd[key] -= dt;

    // Claw swipe (Titan Rend: full circle, longer, with a shockwave)
    if (this.cd.claw <= 0) {
      const range = (16 + 10 * m.clawRange) * k * (evo.rend ? 1.3 : 1);
      const target = this.nearestEnemy(range * 1.8);
      let angle = Math.atan2(p.facing.y, p.facing.x);
      if (target) angle = Math.atan2(target.y - p.y, target.x - p.x);
      const cx = p.x + Math.cos(angle) * p.radius * (evo.rend ? 0 : 0.6), cy = p.y - 2 * k + Math.sin(angle) * p.radius * (evo.rend ? 0 : 0.6);
      this.area(cx, cy, range, 12 * m.clawDmg * pow * (evo.rend ? 1.5 : 1), 160, evo.rend ? undefined : { angle, half: 1.1 });
      this.cd.claw = 0.8 * cdm;
      if (evo.rend) {
        s.fx.ring(p.x, p.y, range * 1.1, 0xffe14a, 260);
        for (let i = 0; i < 3; i++) {
          const a = angle + (i * Math.PI * 2) / 3;
          const img = s.add.image(p.x + Math.cos(a) * range * 0.5, p.y + Math.sin(a) * range * 0.5, 'claw').setRotation(a).setScale((range / 22) * 0.8).setDepth(9300).setTint(0xffe14a);
          s.tweens.add({ targets: img, alpha: 0, scale: img.scale * 1.3, duration: 180, onComplete: () => img.destroy() });
        }
      } else {
        const fxImg = s.add.image(cx, cy, 'claw').setRotation(angle).setScale((range / 22) * 0.9).setDepth(9300).setAlpha(0.9);
        fxImg.setFlipY(Math.random() < 0.5);
        if (rage) fxImg.setTint(0xff5566);
        s.tweens.add({ targets: fxImg, alpha: 0, scale: fxImg.scale * 1.25, duration: 160, onComplete: () => fxImg.destroy() });
      }
      p.setFlipX(Math.cos(angle) < 0);
      sfx.swipe();
    }

    // Atomic breath (Gamma Ray: longer, wider, sweeping, double damage)
    if (m.breath > 0) {
      if (this.beamT > 0) {
        this.beamT -= dt;
        this.beamTick -= dt;
        const gamma = evo.gamma;
        const len = (90 + 20 * m.breath) * k * (gamma ? 1.6 : 1);
        if (gamma) this.beamAngle = this.beamBase + Math.sin((1 - this.beamT / this.beamDur) * Math.PI * 2) * 0.45;
        const mx = p.x + Math.cos(this.beamAngle) * 10 * k, my = p.y - 10 * k;
        this.beam
          .setVisible(true)
          .setPosition(mx, my)
          .setRotation(this.beamAngle)
          .setScale(len / 64, (0.6 + 0.25 * Math.sin(s.gameTime / 25)) * k * 1.2 * (gamma ? 1.6 : 1))
          .setTint(gamma ? 0xd8a0ff : 0x9ffcff);
        if (this.beamTick <= 0) {
          this.beamTick = 0.1;
          const steps = gamma ? 9 : 6;
          for (let i = 1; i <= steps; i++) {
            const tt = (i / steps) * len;
            this.area(mx + Math.cos(this.beamAngle) * tt, my + Math.sin(this.beamAngle) * tt + 8 * k, 7 * k * (gamma ? 1.5 : 1), 5 * (1 + 0.3 * (m.breath - 1)) * pow * (gamma ? 2 : 1), 30);
          }
          s.fx.hit(mx + Math.cos(this.beamAngle) * len, my + Math.sin(this.beamAngle) * len, 3);
        }
        if (this.beamT <= 0) this.beam.setVisible(false);
      } else if (this.cd.breath <= 0) {
        const tg = this.nearestEnemy(200 * k * (evo.gamma ? 1.4 : 1));
        if (tg) {
          this.beamBase = this.beamAngle = Math.atan2(tg.y - (p.y - 10 * k), tg.x - p.x);
          this.beamDur = this.beamT = evo.gamma ? 0.9 : 0.55;
          this.beamTick = 0;
          this.cd.breath = (evo.gamma ? 2.4 : 3.2) * cdm;
          p.setFlipX(Math.cos(this.beamAngle) < 0);
          p.anims.stop();
          p.setTexture('kaiju2');
          s.time.delayedCall(this.beamDur * 1000, () => p.play('kaiju-walk', true));
          sfx.breath(this.beamDur, evo.gamma);
        }
      }
    }

    // Tail spin (Typhoon Tail: constant, bigger, pulls enemies in)
    if (m.tail > 0 && this.cd.tail <= 0) {
      const ty = evo.typhoon;
      const r = (30 + 6 * m.tail) * k * (ty ? 1.5 : 1);
      this.area(p.x, p.y, r, (14 + 6 * m.tail) * pow * (ty ? 1.5 : 1), ty ? -220 : 260);
      s.fx.ring(p.x, p.y, r, ty ? 0x5ff6ff : 0x7dff9a, 300);
      s.tweens.add({ targets: p, angle: { from: 0, to: p.flipX ? -360 : 360 }, duration: 260, onComplete: () => p.setAngle(0) });
      this.cd.tail = (ty ? 1.6 : 4.2) * cdm;
      sfx.tail();
    }

    // Spine volley (Spine Storm: constant, +2 spines, each pierces three targets)
    if (m.spines > 0 && this.cd.spines <= 0) {
      const storm = evo.storm;
      const n = m.spines + (storm ? 2 : 0);
      const targets = [...s.enemies.list]
        .filter((e) => Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) < 320 * k)
        .sort(() => rng.ai.frac() - 0.5)
        .slice(0, n);
      if (targets.length) {
        for (let i = 0; i < n; i++) {
          const sp = s.add.image(p.x, p.y - 12 * k, 'spine').setScale(k * 0.9).setDepth(9150) as Spine;
          sp.target = targets[i % targets.length];
          sp.life = storm ? 2.4 : 1.6;
          sp.dmg = 14 * pow;
          sp.hits = storm ? 3 : 1;
          sp.hitSet = new Set();
          sp.setRotation(-Math.PI / 2 + (i - (n - 1) / 2) * 0.5);
          if (storm) sp.setTint(0xd8a0ff);
          this.spines.push(sp);
        }
        this.cd.spines = (storm ? 0.45 : 1.7) * cdm;
        sfx.spines();
      }
    }
    for (const sp of [...this.spines]) {
      sp.life -= dt;
      let tg = sp.target && !sp.target.dead ? sp.target : null;
      if (!tg && sp.hits > 0 && sp.hitSet.size) tg = sp.target = this.nearestEnemy(400 * k, sp.hitSet);
      if (tg) {
        const want = Math.atan2(tg.y - sp.y, tg.x - sp.x);
        sp.setRotation(Phaser.Math.Angle.RotateTo(sp.rotation, want, 8 * dt));
      }
      const v = 380 * Math.max(1, k * 0.7);
      sp.x += Math.cos(sp.rotation) * v * dt;
      sp.y += Math.sin(sp.rotation) * v * dt;
      const hit = tg && Phaser.Math.Distance.Between(sp.x, sp.y, tg.x, tg.y) < 10 + enemyRadius(tg) + 2;
      if (hit && tg) {
        this.area(sp.x, sp.y, 10 * k, sp.dmg, 80);
        s.fx.hit(sp.x, sp.y, 6);
        sfx.spineHit();
        sp.hits--;
        sp.hitSet.add(tg);
        sp.target = sp.hits > 0 ? this.nearestEnemy(400 * k, sp.hitSet) : null;
      }
      if (sp.life <= 0 || sp.hits <= 0) {
        sp.destroy();
        this.spines.splice(this.spines.indexOf(sp), 1);
      }
    }

    // Fallout aura (Radiant Core: wider, stronger, heals per enemy burned)
    if (m.aura > 0 && this.cd.aura <= 0) {
      this.cd.aura = 0.5;
      const rad = evo.radiant;
      const hits = this.area(p.x, p.y - 4 * k, (34 + 8 * m.aura) * k * (rad ? 1.6 : 1), 3 * (1 + 0.6 * (m.aura - 1)) * pow * (rad ? 1.5 : 1), 0);
      if (rad && hits) p.heal(Math.min(3, hits * 0.4));
      sfx.aura(hits);
    }
  }

  /** Active ability. Returns false if on cooldown. */
  stomp(): boolean {
    const s = this.s, p = s.player;
    if (p.stompCd > 0) return false;
    const r = 58 * p.scale * p.mods.stompRadius;
    p.stompCd = 5 * p.mods.stompCd * (p.mods.rage > 0 ? 0.6 : 1);
    this.area(p.x, p.y, r, 45 * p.power * (p.mods.rage > 0 ? 1.5 : 1), 420);
    s.fx.ring(p.x, p.y, r, 0xffffff, 420, 1);
    s.fx.ring(p.x, p.y, r * 0.7, 0x9ffcff, 520, 1);
    s.fx.dust(p.x, p.y, 14);
    s.shake(0.018, 260);
    s.hitStop(90);
    s.stats.stomps++;
    sfx.stomp();
    p.anims.stop();
    p.setTexture('kaiju2');
    s.tweens.add({ targets: p, scaleY: p.scaleY * 0.8, yoyo: true, duration: 90, onComplete: () => p.applyScale() });
    s.time.delayedCall(300, () => p.play('kaiju-walk', true));
    return true;
  }
}
