// Daily twists: rule changes for a whole run. Most are knobs read elsewhere (damage, heals, jets,
// the start); this module owns the two with their own moving parts, Blackout and Firestorm.
//   glass     — you deal and take double damage
//   blackout  — darkness beyond a small circle around you, searchlights sweeping toward you
//   starving  — no hearts and no level-up heal; eating the city heals instead
//   air       — jets from wave 1 at any size, twice as often
//   giant     — start at wave 3 already Behemoth-sized, with three mutations to pick
//   firestorm — a collapsing building sets fire to its neighbours, which can chain
import Phaser from 'phaser';
import type { TwistId } from './daily';
import type { Destructible } from './city';
import type { GameScene } from './scenes/GameScene';
import { rng } from './rand';

const params = new URLSearchParams(location.search);
/** Debug: `?twist=glass,blackout` forces twists in any mode. */
export const TWIST_PARAM = (params.get('twist') ?? '').split(',').filter(Boolean) as TwistId[];

export class Twists {
  readonly on: Set<TwistId>;
  private dark?: Phaser.GameObjects.Image;
  private lights: Phaser.GameObjects.Image[] = [];
  private burning = 0;
  private t = 0;

  constructor(private s: GameScene, ids: TwistId[]) {
    this.on = new Set(ids);
  }

  has(id: TwistId) {
    return this.on.has(id);
  }

  /** Damage the kaiju deals (Glass Kaiju doubles it). */
  dealt(dmg: number) {
    return this.has('glass') ? dmg * 2 : dmg;
  }
  /** Damage the kaiju takes. */
  taken(dmg: number) {
    return this.has('glass') ? dmg * 2 : dmg;
  }
  /** Heart drop chance and level-up heals (Starving: none). */
  heal(base: number) {
    return this.has('starving') ? 0 : base;
  }
  /** Starving: what eating a thing heals, scaled with size. */
  eatHeal(kind: string, tierIdx: number) {
    if (!this.has('starving')) return 0;
    const base = kind === 'tower' ? 6 : kind === 'warehouse' ? 4 : kind === 'house' ? 2 : kind === 'car' ? 0.6 : 0.3;
    return base * (1 + tierIdx * 0.6);
  }

  /** Called once when the run starts. */
  start() {
    if (this.has('blackout')) this.setupBlackout();
  }

  private setupBlackout() {
    const s = this.s;
    if (!s.textures.exists('darkness')) {
      const size = 1024;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(size / 2, size / 2, size * 0.022, size / 2, size / 2, size * 0.085);
      grad.addColorStop(0, 'rgba(2,3,10,0)');
      grad.addColorStop(0.55, 'rgba(2,3,10,0.6)');
      grad.addColorStop(1, 'rgba(2,3,10,0.95)');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      s.textures.addCanvas('darkness', c);
    }
    this.dark = s.add.image(0, 0, 'darkness').setDepth(9400).setName('darkness');
    this.lights = [0, 1, 2].map(() => s.add.image(0, 0, 'searchlight').setOrigin(0, 0.5).setDepth(9450).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.18));
  }

  update(dt: number) {
    this.t += dt;
    if (!this.dark) return;
    const s = this.s, p = s.player, view = s.cameras.main.worldView;
    // The hole tracks the kaiju; the image is big enough to cover the view at any zoom.
    const cover = Math.max(view.width, view.height) * 2.6;
    this.dark.setPosition(p.x, p.y - 10 * p.scale).setDisplaySize(cover, cover);
    // Searchlights from the view's edges, sweeping toward the kaiju.
    this.lights.forEach((l, i) => {
      const ox = view.x + view.width * [0.05, 0.5, 0.95][i];
      const oy = view.y + view.height * (i === 1 ? 1.02 : 0.9);
      const aim = Math.atan2(p.y - oy, p.x - ox) + Math.sin(this.t * (0.7 + i * 0.23) + i * 2) * 0.35;
      l.setPosition(ox, oy).setRotation(aim).setScale(Math.hypot(p.x - ox, p.y - oy) / 230, view.height / 700);
    });
  }

  /** Firestorm: a building came down; fire may spread to its neighbours. */
  spread(d: Destructible) {
    if (!this.has('firestorm') || d.kind === 'car' || d.kind === 'tree' || this.burning > 24) return;
    const s = this.s;
    const reach = Math.max(d.w, d.h) * 1.4 + 20;
    const near: Destructible[] = [];
    s.city.grid.query(d.x, d.y, reach, near);
    for (const n of near) {
      if (!n.alive || n === d || n.kind === 'car' || n.kind === 'tree' || rng.drop.frac() > 0.55) continue;
      this.burning++;
      s.time.delayedCall(rng.drop.float(500, 1300), () => {
        this.burning--;
        if (!n.alive) return;
        s.fx.addFire(n.x, n.y - n.h * 0.2);
        s.damageDestructible(n, n.maxHp * 0.7, true);
      });
    }
  }

  destroy() {
    this.dark?.destroy();
    this.lights.forEach((l) => l.destroy());
  }
}
