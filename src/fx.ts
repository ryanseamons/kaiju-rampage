// Juice: particles, shockwaves, impact words, flashes. Screen shake / hit-stop live on GameScene.
import Phaser from 'phaser';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

interface FxSet {
  debris: Emitter;
  dust: Emitter;
  sparks: Emitter;
  glass: Emitter;
  fire: Emitter;
  squish: Emitter;
}

export class Fx {
  private sets: FxSet[] = [];
  /** 0-based index of the active scale set (follows the kaiju's tier). */
  level = 0;

  constructor(private scene: Phaser.Scene) {
    for (const k of [1, 2.2, 4.4]) this.sets.push(this.makeSet(k));
  }

  private makeSet(k: number): FxSet {
    const s = this.scene;
    const base = { emitting: false } as const;
    const debris = s.add.particles(0, 0, 'chunk', {
      ...base,
      speed: { min: 60 * k, max: 240 * k },
      angle: { min: 200, max: 340 },
      gravityY: 520 * k,
      lifespan: { min: 450, max: 900 },
      scale: { min: 0.8 * k, max: 1.8 * k },
      rotate: { min: 0, max: 360 },
      tint: [0x8a8aa0, 0x6a6a80, 0xb4b4c8, 0x5a4a4a],
      alpha: { start: 1, end: 0.6 },
    }).setDepth(9000);
    const dust = s.add.particles(0, 0, 'smoke', {
      ...base,
      speed: { min: 10 * k, max: 70 * k },
      lifespan: { min: 600, max: 1200 },
      scale: { start: 0.6 * k, end: 2.4 * k },
      alpha: { start: 0.5, end: 0 },
      tint: [0x6a6a78, 0x4a4a58, 0x807a70],
    }).setDepth(8990);
    const sparks = s.add.particles(0, 0, 'px', {
      ...base,
      speed: { min: 80 * k, max: 300 * k },
      lifespan: { min: 150, max: 380 },
      scale: { start: 1.2 * k, end: 0 },
      tint: [0xffe66b, 0xffa03b, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(9010);
    const glass = s.add.particles(0, 0, 'px', {
      ...base,
      speed: { min: 50 * k, max: 200 * k },
      angle: { min: 200, max: 340 },
      gravityY: 400 * k,
      lifespan: { min: 300, max: 700 },
      scale: { min: 0.6 * k, max: 1.2 * k },
      tint: [0x9fd4ff, 0xffd66b, 0xe0f4ff],
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(9005);
    const fire = s.add.particles(0, 0, 'glow', {
      ...base,
      speed: { min: 5 * k, max: 40 * k },
      lifespan: { min: 250, max: 520 },
      scale: { start: 0.25 * k, end: 0.9 * k },
      alpha: { start: 0.9, end: 0 },
      tint: [0xff7a2a, 0xffc040, 0xff3a1a],
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(9020);
    const squish = s.add.particles(0, 0, 'px', {
      ...base,
      speed: { min: 30 * k, max: 120 * k },
      lifespan: { min: 200, max: 400 },
      scale: { start: 1 * k, end: 0.2 * k },
      tint: [0xc23b3b, 0x5c6b3a, 0x3f4a28],
    }).setDepth(9000);
    return { debris, dust, sparks, glass, fire, squish };
  }

  get cur() {
    return this.sets[this.level];
  }

  /** Building collapse: debris arc, dust cloud, glass sparkle, fire. */
  collapse(x: number, y: number, size: 'small' | 'house' | 'tower') {
    const mult = size === 'tower' ? 3 : size === 'house' ? 1.5 : 0.6;
    const c = this.cur;
    c.debris.explode(Math.round(10 * mult), x, y);
    c.dust.explode(Math.round(6 * mult), x, y);
    if (size !== 'small') c.glass.explode(Math.round(8 * mult), x, y);
    c.fire.explode(Math.round(4 * mult), x, y);
    if (size === 'tower') this.ring(x, y, 70 * (this.level + 1), 0xffc070, 380);
  }

  hit(x: number, y: number, n = 5) {
    this.cur.sparks.explode(n, x, y);
  }

  explode(x: number, y: number, r: number) {
    const c = this.cur;
    c.fire.explode(8, x, y);
    c.sparks.explode(10, x, y);
    c.dust.explode(3, x, y);
    this.ring(x, y, r, 0xffa040, 260);
  }

  squish(x: number, y: number) {
    this.cur.squish.explode(6, x, y);
  }

  dust(x: number, y: number, n = 4) {
    this.cur.dust.explode(n, x, y);
  }

  ring(x: number, y: number, radius: number, tint = 0xffffff, dur = 420, thick = 1) {
    const img = this.scene.add.image(x, y, 'ring').setTint(tint).setDepth(9030).setScale(0.05).setAlpha(0.95);
    img.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: img,
      scale: (radius / 60) * thick,
      alpha: 0,
      duration: dur,
      ease: 'Cubic.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  /** Big retro impact word, e.g. "KRAKOOM!" */
  word(x: number, y: number, text: string, color = '#ffe14a', size = 1) {
    const t = this.scene.add
      .text(x, y, text, {
        fontFamily: '"Courier New", monospace',
        fontStyle: 'bold',
        fontSize: `${Math.round(12 * size)}px`,
        color,
        stroke: '#1a0a14',
        strokeThickness: Math.max(2, Math.round(3 * size)),
      })
      .setOrigin(0.5)
      .setDepth(9500)
      .setScale(0.4)
      .setAngle(Phaser.Math.Between(-12, 12));
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 18 * size, alpha: 0, delay: 380, duration: 420, onComplete: () => t.destroy() });
  }

  flash(obj: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, ms = 60) {
    obj.setTintFill(0xffffff);
    this.scene.time.delayedCall(ms, () => obj.active && obj.clearTint());
  }
}
