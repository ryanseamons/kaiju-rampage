// Auto-attacks: claw swipe (always), atomic breath, tail spin, spine volley, fallout aura.
import Phaser from 'phaser';
import type { GameScene } from './scenes/GameScene';
import type { Enemy } from './enemies';
import { circleHits, type Destructible } from './city';
import { sfx } from './sfx';

interface Spine extends Phaser.GameObjects.Image {
  target: Enemy | null;
  life: number;
  dmg: number;
}

export class Weapons {
  private cd = { claw: 0.5, breath: 1.5, tail: 2, spines: 1, aura: 0 };
  private spines: Spine[] = [];
  private beam: Phaser.GameObjects.Image;
  private beamT = 0;
  private beamTick = 0;
  private beamAngle = 0;
  private tmp: Destructible[] = [];

  constructor(private s: GameScene) {
    this.beam = s.add.image(0, 0, 'beam').setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9200);
  }

  private nearestEnemy(range: number): Enemy | null {
    const p = this.s.player;
    let best: Enemy | null = null, bd = range * range;
    for (const e of this.s.enemies.list) {
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Hit everything (enemies + destructibles up to tier+1) inside a circle, optionally an arc. */
  private area(x: number, y: number, r: number, dmg: number, knock: number, arc?: { angle: number; half: number }) {
    const s = this.s;
    const inArc = (tx: number, ty: number) => {
      if (!arc) return true;
      const a = Math.atan2(ty - y, tx - x);
      return Math.abs(Phaser.Math.Angle.Wrap(a - arc.angle)) <= arc.half;
    };
    for (const e of [...s.enemies.list]) {
      const er = e.etype === 'mech' ? 40 : e.etype === 'tank' ? 12 : 4;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= r + er && (d < er + 4 || inArc(e.x, e.y))) {
        const k = knock / Math.max(1, d);
        s.damageEnemy(e, dmg, (e.x - x) * k, (e.y - y) * k);
      }
    }
    this.tmp.length = 0;
    for (const d of s.city.grid.query(x, y, r, this.tmp)) {
      if (d.sizeClass > s.tier + 1) continue;
      if (!circleHits(d, x, y, r)) continue;
      if (!inArc(d.x, d.y) && !circleHits(d, x, y, r * 0.35)) continue;
      s.damageDestructible(d, dmg);
    }
  }

  update(dt: number) {
    const s = this.s, p = s.player, m = p.mods, k = p.scale, pow = p.power;
    for (const key of Object.keys(this.cd) as (keyof typeof this.cd)[]) this.cd[key] -= dt;

    // Claw swipe
    if (this.cd.claw <= 0) {
      const range = (16 + 10 * m.clawRange) * k;
      const target = this.nearestEnemy(range * 1.8);
      let angle = Math.atan2(p.facing.y, p.facing.x);
      if (target) angle = Math.atan2(target.y - p.y, target.x - p.x);
      const cx = p.x + Math.cos(angle) * p.radius * 0.6, cy = p.y - 2 * k + Math.sin(angle) * p.radius * 0.6;
      this.area(cx, cy, range, 12 * m.clawDmg * pow, 160, { angle, half: 1.1 });
      this.cd.claw = 0.8 * m.cooldown;
      const fxImg = s.add.image(cx, cy, 'claw').setRotation(angle).setScale((range / 22) * 0.9).setDepth(9300).setAlpha(0.9);
      fxImg.setFlipY(Math.random() < 0.5);
      s.tweens.add({ targets: fxImg, alpha: 0, scale: fxImg.scale * 1.25, duration: 160, onComplete: () => fxImg.destroy() });
      p.setFlipX(Math.cos(angle) < 0);
      sfx.swipe();
    }

    // Atomic breath
    if (m.breath > 0) {
      if (this.beamT > 0) {
        this.beamT -= dt;
        this.beamTick -= dt;
        const len = (90 + 20 * m.breath) * k;
        const mx = p.x + Math.cos(this.beamAngle) * 10 * k, my = p.y - 10 * k;
        this.beam.setVisible(true).setPosition(mx, my).setRotation(this.beamAngle)
          .setScale(len / 64, (0.6 + 0.25 * Math.sin(s.gameTime / 25)) * k * 1.2)
          .setTint(0x9ffcff);
        if (this.beamTick <= 0) {
          this.beamTick = 0.1;
          const steps = 6;
          for (let i = 1; i <= steps; i++) {
            const t = (i / steps) * len;
            this.area(mx + Math.cos(this.beamAngle) * t, my + Math.sin(this.beamAngle) * t + 8 * k, 7 * k, 5 * (1 + 0.3 * (m.breath - 1)) * pow, 30);
          }
          s.fx.hit(mx + Math.cos(this.beamAngle) * len, my + Math.sin(this.beamAngle) * len, 3);
        }
        if (this.beamT <= 0) this.beam.setVisible(false);
      } else if (this.cd.breath <= 0) {
        const t = this.nearestEnemy(200 * k);
        if (t) {
          this.beamAngle = Math.atan2(t.y - (p.y - 10 * k), t.x - p.x);
          this.beamT = 0.55;
          this.beamTick = 0;
          this.cd.breath = 3.2 * m.cooldown;
          p.setFlipX(Math.cos(this.beamAngle) < 0);
          p.anims.stop();
          p.setTexture('kaiju2');
          s.time.delayedCall(550, () => p.play('kaiju-walk', true));
          sfx.breath();
        }
      }
    }

    // Tail spin
    if (m.tail > 0 && this.cd.tail <= 0) {
      const r = (30 + 6 * m.tail) * k;
      this.area(p.x, p.y, r, (14 + 6 * m.tail) * pow, 260);
      s.fx.ring(p.x, p.y, r, 0x7dff9a, 300);
      s.tweens.add({ targets: p, angle: { from: 0, to: p.flipX ? -360 : 360 }, duration: 260, onComplete: () => p.setAngle(0) });
      this.cd.tail = 4.2 * m.cooldown;
      sfx.swipe();
    }

    // Spine volley
    if (m.spines > 0 && this.cd.spines <= 0) {
      const n = m.spines;
      const targets = [...s.enemies.list]
        .filter((e) => Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) < 320 * k)
        .sort(() => Math.random() - 0.5)
        .slice(0, n);
      if (targets.length) {
        for (let i = 0; i < n; i++) {
          const sp = s.add.image(p.x, p.y - 12 * k, 'spine').setScale(k * 0.9).setDepth(9150) as Spine;
          sp.target = targets[i % targets.length];
          sp.life = 1.6;
          sp.dmg = 14 * pow;
          sp.setRotation(-Math.PI / 2 + (i - (n - 1) / 2) * 0.5);
          this.spines.push(sp);
        }
        this.cd.spines = 1.7 * m.cooldown;
      }
    }
    for (const sp of [...this.spines]) {
      sp.life -= dt;
      const t = sp.target && !sp.target.dead ? sp.target : null;
      if (t) {
        const want = Math.atan2(t.y - sp.y, t.x - sp.x);
        sp.setRotation(Phaser.Math.Angle.RotateTo(sp.rotation, want, 8 * dt));
      }
      const v = 380 * Math.max(1, k * 0.7);
      sp.x += Math.cos(sp.rotation) * v * dt;
      sp.y += Math.sin(sp.rotation) * v * dt;
      const hit = t && Phaser.Math.Distance.Between(sp.x, sp.y, t.x, t.y) < 10 + (t.etype === 'mech' ? 40 : 6);
      if (hit || sp.life <= 0) {
        if (hit) {
          this.area(sp.x, sp.y, 10 * k, sp.dmg, 80);
          s.fx.hit(sp.x, sp.y, 6);
        }
        sp.destroy();
        this.spines.splice(this.spines.indexOf(sp), 1);
      }
    }

    // Fallout aura
    if (m.aura > 0 && this.cd.aura <= 0) {
      this.cd.aura = 0.5;
      this.area(p.x, p.y - 4 * k, (34 + 8 * m.aura) * k, 3 * (1 + 0.6 * (m.aura - 1)) * pow, 0);
    }
  }

  /** Active ability. Returns false if on cooldown. */
  stomp(): boolean {
    const s = this.s, p = s.player;
    if (p.stompCd > 0) return false;
    const r = 58 * p.scale * p.mods.stompRadius;
    p.stompCd = 5 * p.mods.stompCd;
    this.area(p.x, p.y, r, 45 * p.power, 420);
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
