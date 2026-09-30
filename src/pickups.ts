// Everything the kaiju can pick up: XP crystals, hearts, supply crates and three floor items.
import Phaser from 'phaser';
import type { GameScene } from './scenes/GameScene';
import { sfx } from './sfx';

export type PickupKind = 'xp' | 'heart' | 'crate' | 'magnet' | 'quake' | 'rage';

interface Pickup {
  img: Phaser.GameObjects.Image;
  kind: PickupKind;
  value: number;
  settle: number;
  bob: number;
}

const TEX: Record<Exclude<PickupKind, 'xp'>, string> = { heart: 'heart', crate: 'crate', magnet: 'itemMagnet', quake: 'itemQuake', rage: 'itemRage' };

export class Pickups {
  list: Pickup[] = [];
  /** Seconds left of a magnet vacuum: every crystal on the map flies to the kaiju. */
  vacuum = 0;

  constructor(private s: GameScene) {}

  drop(x: number, y: number, kind: PickupKind, value = 0) {
    if (kind === 'xp' && value <= 0) return;
    if (kind === 'xp' && this.list.length > 300) {
      this.s.gainXp(value);
      return;
    }
    const key = kind === 'xp' ? (value >= 5 ? 'gemBig' : 'gem') : TEX[kind];
    const sc = Math.max(1, this.s.player.scale * 0.6) * (kind === 'crate' ? 1.6 : kind === 'xp' || kind === 'heart' ? 1 : 1.3);
    const spread = (kind === 'xp' ? 10 : 4) * sc;
    const tx = x + Phaser.Math.Between(-spread, spread), ty = y + Phaser.Math.Between(-spread, spread);
    const img = this.s.add.image(x, y, key).setDepth(8000).setScale(sc);
    this.s.tweens.add({ targets: img, x: tx, y: ty, duration: 250, ease: 'Quad.easeOut' });
    if (kind !== 'xp' && kind !== 'heart') {
      // Specials glow and bob so they read at any zoom.
      const glow = this.s.add.image(tx, ty, 'glow').setScale(sc * 0.6).setTint(kind === 'crate' ? 0xffd24a : 0xff5fd2).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(7999);
      img.once(Phaser.GameObjects.Events.DESTROY, () => glow.destroy());
      img.setData('glow', glow);
    }
    this.list.push({ img, kind, value, settle: 0.25, bob: Math.random() * 6 });
  }

  update(dt: number) {
    const s = this.s, p = s.player;
    const magnet = (40 + 14 * p.scale) * p.mods.magnet;
    const grab = p.radius + 6 * Math.max(1, p.scale * 0.5);
    if (this.vacuum > 0) this.vacuum -= dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      if (g.settle > 0) {
        g.settle -= dt;
        continue;
      }
      if (g.kind !== 'xp' && g.kind !== 'heart') {
        g.bob += dt * 4;
        const glow = g.img.getData('glow') as Phaser.GameObjects.Image | undefined;
        glow?.setPosition(g.img.x, g.img.y).setAlpha(0.35 + 0.25 * Math.sin(g.bob * 1.5));
        g.img.setAngle(Math.sin(g.bob) * 6);
      }
      const dx = p.x - g.img.x, dy = p.y - g.img.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < grab) {
        this.collect(g);
        g.img.destroy();
        this.list.splice(i, 1);
      } else if (g.kind === 'xp' && (d < magnet || this.vacuum > 0)) {
        const v = (this.vacuum > 0 ? 900 : 260 + 60 * p.scale) * dt;
        g.img.x += (dx / d) * Math.min(v, d);
        g.img.y += (dy / d) * Math.min(v, d);
      }
    }
  }

  private collect(g: Pickup) {
    const s = this.s, p = s.player;
    switch (g.kind) {
      case 'xp':
        s.gainXp(g.value);
        sfx.pickup();
        break;
      case 'heart':
        p.heal(p.maxHp * 0.15);
        s.fx.word(p.x, p.y - 20 * p.scale, '+HP', '#ff6688', 1 + p.tierIdx * 0.6);
        sfx.levelup();
        break;
      case 'crate':
        s.openCrate();
        break;
      default:
        s.useItem(g.kind);
    }
  }

  /** Read-only view for the test bot. */
  nearby(x: number, y: number, r: number) {
    return this.list.filter((g) => (g.img.x - x) ** 2 + (g.img.y - y) ** 2 < r * r).map((g) => ({ x: g.img.x, y: g.img.y, kind: g.kind }));
  }

  clear() {
    for (const g of this.list) g.img.destroy();
    this.list = [];
  }
}
