// Stage weather, drawn in the UI scene (unzoomed, over the city, under the HUD): rain and snow
// sheets, plus Typhoon lightning. A strike is telegraphed with a ring on the ground, then hits
// everything inside it: the army, buildings, and the kaiju if it didn't move.
import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './config';
import { STAGE_DEF } from './stages';
import { rng } from './rand';
import { sfx } from './sfx';
import type { GameScene } from './scenes/GameScene';

export class Weather {
  private sheet?: Phaser.GameObjects.TileSprite;
  private sheet2?: Phaser.GameObjects.TileSprite;
  private flash?: Phaser.GameObjects.Rectangle;
  private nextStrike = 8;
  private t = 0;

  constructor(private s: GameScene) {
    const ui = s.ui as unknown as Phaser.Scene;
    if (STAGE_DEF.weather === 'rain' || STAGE_DEF.weather === 'snow') {
      const key = STAGE_DEF.weather === 'rain' ? 'rain' : 'snowfall';
      this.sheet = ui.add.tileSprite(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, key).setDepth(2).setAlpha(STAGE_DEF.weather === 'rain' ? 0.55 : 0.8);
      this.sheet2 = ui.add.tileSprite(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, key).setDepth(2).setAlpha(0.35).setTileScale(1.6);
    }
    if (STAGE_DEF.weather === 'rain') ui.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x0a1830, 0.18).setDepth(1);
    if (STAGE_DEF.lightning) this.flash = ui.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0xdde8ff, 0).setDepth(3);
  }

  update(dt: number) {
    this.t += dt;
    const cam = this.s.cameras.main;
    if (this.sheet && this.sheet2) {
      const rain = STAGE_DEF.weather === 'rain';
      // Fall, plus parallax with the camera so the weather sits in the world.
      this.sheet.tilePositionY = -this.t * (rain ? 620 : 40) + cam.scrollY * 0.3;
      this.sheet.tilePositionX = this.t * (rain ? 150 : 12 + Math.sin(this.t * 0.7) * 14) + cam.scrollX * 0.3;
      this.sheet2.tilePositionY = -this.t * (rain ? 900 : 70) + cam.scrollY * 0.5;
      this.sheet2.tilePositionX = this.t * (rain ? 220 : 20) + cam.scrollX * 0.5;
    }
    if (STAGE_DEF.lightning && this.s.phase === 'playing') {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = rng.spawn.float(7, 13);
        this.strike();
      }
    }
  }

  private strike() {
    const s = this.s, p = s.player, view = s.cameras.main.worldView;
    // Near the kaiju (so it matters), never right on top of it.
    const a = rng.spawn.float(0, Math.PI * 2), d = rng.spawn.float(0.15, 0.4) * Math.min(view.width, view.height);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    const R = 46 * Math.max(1, p.scale * 0.8);
    const ring = s.add.circle(x, y, R, 0xbfd8ff, 0.12).setStrokeStyle(3, 0xbfd8ff, 0.9).setDepth(9300);
    s.tweens.add({ targets: ring, alpha: { from: 0.4, to: 1 }, yoyo: true, repeat: 3, duration: 110 });
    s.time.delayedCall(900, () => {
      ring.destroy();
      if (s.phase !== 'playing') return;
      this.flash?.setAlpha(0.75);
      s.tweens.add({ targets: this.flash, alpha: 0, duration: 380 });
      sfx.thunder();
      s.fx.explode(x, y, R * 0.8);
      s.shake(0.012, 260);
      for (const e of [...s.enemies.list]) if (!e.dead && Phaser.Math.Distance.Between(e.x, e.y, x, y) < R + 10) s.damageEnemy(e, 60, 0, 0);
      if (Phaser.Math.Distance.Between(p.x, p.y, x, y) < R + p.radius * 0.5) s.hurtPlayer(14, x, y);
      const near: import('./city').Destructible[] = [];
      s.city.grid.query(x, y, R, near);
      for (const d of near) s.damageDestructible(d, 40, true);
    });
  }
}
