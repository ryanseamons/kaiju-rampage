// The kaiju: growth (mass → tiers), HP, movement.
import Phaser from 'phaser';
import { MASS_MULT, TIERS, type TierDef } from './config';
import { baseMods, type Mods } from './upgrades';

export class Kaiju extends Phaser.Physics.Arcade.Sprite {
  tierIdx = 0;
  mass = 0;
  hp: number;
  level = 1;
  xp = 0;
  mods: Mods = baseMods();
  upgradeLevels: Record<string, number> = {};
  facing = new Phaser.Math.Vector2(1, 0);
  stompCd = 0;
  invuln = 0;
  shadow: Phaser.GameObjects.Image;
  auraGlow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'kaiju0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 0.8);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(8, 6, 12);
    this.setCollideWorldBounds(true);
    this.hp = this.maxHp;
    this.shadow = scene.add.image(x, y, 'shadow').setDepth(-40);
    this.auraGlow = scene.add.image(x, y, 'glow').setTint(0x7dff5a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(-39);
    this.play('kaiju-walk');
    this.applyScale();
  }

  get tier(): TierDef {
    return TIERS[this.tierIdx];
  }
  get maxHp() {
    return this.tier.maxHp + this.mods.maxHpBonus;
  }
  get nextTier(): TierDef | undefined {
    return TIERS[this.tierIdx + 1];
  }
  /** 0..1 progress to next tier. */
  get growth() {
    const n = this.nextTier;
    if (!n) return 1;
    return Phaser.Math.Clamp((this.mass - this.tier.massToReach) / (n.massToReach - this.tier.massToReach), 0, 1);
  }
  /** Collision radius in world px. */
  get radius() {
    return 8 * this.scale;
  }
  /** Damage multiplier by tier. */
  get power() {
    return [1, 1.9, 3.4][this.tierIdx];
  }

  /** Returns true if this mass gain crossed into a new tier. */
  addMass(amount: number): boolean {
    this.mass += amount * this.mods.massGain * MASS_MULT;
    const n = this.nextTier;
    if (n && this.mass >= n.massToReach) {
      this.tierIdx++;
      this.hp = this.maxHp;
      this.applyScale();
      return true;
    }
    this.applyScale();
    return false;
  }

  applyScale() {
    const t = this.tier;
    this.setScale(Phaser.Math.Linear(t.scaleMin, t.scaleMax, this.growth));
  }

  heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  syncDecor(time: number) {
    this.shadow.setPosition(this.x, this.y + 2 * this.scale).setScale(this.scale * 0.9, this.scale * 0.8);
    this.setDepth(this.y);
    if (this.mods.aura > 0) {
      this.auraGlow
        .setPosition(this.x, this.y - 4 * this.scale)
        .setScale((this.scale * (34 + 8 * this.mods.aura)) / 32)
        .setAlpha(0.18 + 0.06 * Math.sin(time / 120));
    }
  }
}
