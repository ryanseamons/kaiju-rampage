// The military: infantry, tanks and the flagship mech. Behaviour depends on the kaiju's tier.
import Phaser from 'phaser';
import { LAND_H, SIZE, TILE, WORLD_W } from './config';
import type { GameScene } from './scenes/GameScene';
import { sfx } from './sfx';

export type EnemyType = 'soldier' | 'tank' | 'mech';
export const ENEMY_ROSTER: EnemyType[] = ['soldier', 'tank', 'mech'];

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  etype: EnemyType;
  hp: number;
  maxHp: number;
  sizeClass: number;
  fireCd: number;
  stun = 0;
  contactCd = 0;
  turret?: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  dead = false;
  // mech state
  mode: 'walk' | 'salvo' | 'laser' | 'quake' = 'walk';
  modeT = 0;
  shotsLeft = 0;
  aim = 0;
  telegraph?: Phaser.GameObjects.Graphics;
  // detour steering around buildings
  detourX = 0;
  detourY = 0;
  detourT = 0;
  crushT = 0;

  constructor(scene: GameScene, type: EnemyType, x: number, y: number) {
    const tex = type === 'soldier' ? 'soldier0' : type === 'tank' ? 'tankHull' : 'mech0';
    super(scene, x, y, tex);
    this.etype = type;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const hp = type === 'soldier' ? 10 : type === 'tank' ? 70 : 3200;
    this.hp = this.maxHp = hp;
    this.sizeClass = SIZE[type === 'soldier' ? 'soldier' : type === 'tank' ? 'tank' : 'mech'];
    this.fireCd = Phaser.Math.FloatBetween(0.5, 2);
    if (type === 'soldier') {
      this.play('soldier-walk');
      (this.body as Phaser.Physics.Arcade.Body).setCircle(4, 0.5, 1);
    } else if (type === 'tank') {
      this.setScale(1.5);
      (this.body as Phaser.Physics.Arcade.Body).setSize(18, 14);
      this.turret = scene.add.image(x, y, 'tankTurret').setOrigin(0.3, 0.5).setScale(1.5);
    } else {
      this.setScale(3.8);
      this.play('mech-walk');
      this.setOrigin(0.5, 0.9);
      (this.body as Phaser.Physics.Arcade.Body).setCircle(16, 6, 22);
      this.shadow = scene.add.image(x, y, 'shadow').setScale(5, 3).setDepth(-40);
      this.telegraph = scene.add.graphics().setDepth(9040);
    }
  }

  destroyAll() {
    this.turret?.destroy();
    this.shadow?.destroy();
    this.telegraph?.destroy();
    this.destroy();
  }
}

interface Projectile extends Phaser.Physics.Arcade.Image {
  kind: 'bullet' | 'shell' | 'missile';
  dmg: number;
  life: number;
  splash: number;
}

export class EnemyManager {
  list: Enemy[] = [];
  group: Phaser.Physics.Arcade.Group;
  shots: Phaser.Physics.Arcade.Group;
  spawnedTypes = new Set<EnemyType>();
  boss: Enemy | null = null;

  constructor(private s: GameScene) {
    this.group = s.physics.add.group();
    this.shots = s.physics.add.group();
  }

  count(type: EnemyType) {
    let n = 0;
    for (const e of this.list) if (e.etype === type) n++;
    return n;
  }

  /** Spawn just outside the visible area, on land. */
  spawnOffscreen(type: EnemyType) {
    const cam = this.s.cameras.main;
    const v = cam.worldView;
    const R = Math.hypot(v.width, v.height) / 2 + (type === 'mech' ? 0 : 40);
    const p = this.s.player;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const [x, y] = snapToRoad(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
      if (x > 20 && x < WORLD_W - 20 && y > 20 && y < LAND_H - 30) return this.spawn(type, x, y);
    }
    const [x, y] = snapToRoad(Phaser.Math.Clamp(p.x + R, 20, WORLD_W - 20), Math.max(40, p.y - R * 0.5));
    return this.spawn(type, x, y);
  }

  spawn(type: EnemyType, x: number, y: number) {
    const e = new Enemy(this.s, type, x, y);
    this.group.add(e);
    this.list.push(e);
    this.spawnedTypes.add(type);
    if (type === 'mech') this.boss = e;
    return e;
  }

  remove(e: Enemy) {
    e.dead = true;
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    if (this.boss === e) this.boss = null;
    e.destroyAll();
  }

  clearAll() {
    for (const e of [...this.list]) {
      if (e.etype === 'mech') continue;
      this.s.fx.dust(e.x, e.y, 2);
      this.remove(e);
    }
    this.shots.clear(true, true);
  }

  private fire(kind: Projectile['kind'], x: number, y: number, angle: number, speed: number, dmg: number, life: number, splash = 0) {
    const tex = kind === 'bullet' ? 'bullet' : kind === 'shell' ? 'shell' : 'missile';
    const p = this.s.physics.add.image(x, y, tex) as Projectile;
    this.shots.add(p);
    p.kind = kind;
    p.dmg = dmg;
    p.life = life;
    p.splash = splash;
    p.setDepth(9100).setRotation(angle);
    // Keep projectiles readable when the camera is zoomed out at higher tiers.
    const zs = Math.max(1, 0.85 / this.s.cameras.main.zoom);
    p.setScale((kind === 'missile' ? 2 : kind === 'shell' ? 1.5 : 1) * zs);
    this.s.physics.velocityFromRotation(angle, speed, (p.body as Phaser.Physics.Arcade.Body).velocity);
  }

  update(dt: number) {
    const s = this.s, p = s.player, tier = s.tier;
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const body = e.body as Phaser.Physics.Arcade.Body;
      e.contactCd -= dt;
      e.fireCd -= dt;
      e.setDepth(e.y);
      if (e.stun > 0) {
        e.stun -= dt;
        body.velocity.scale(0.9);
        continue;
      }
      // Blocked by a building: sidestep along the perpendicular that leans toward the kaiju, briefly.
      e.detourT -= dt;
      if (e.etype !== 'mech' && e.detourT <= 0 && (!body.touching.none || !body.blocked.none)) {
        const v = body.velocity;
        const L = v.length() || 1;
        const px = -v.y / L, py = v.x / L;
        const sgn = px * ux + py * uy >= 0 ? 1 : -1;
        e.detourX = px * sgn;
        e.detourY = py * sgn;
        e.detourT = 0.5;
      }
      if (e.etype === 'soldier') {
        const scale = p.scale;
        let vx = 0, vy = 0;
        const sp = 62;
        if (tier === 1) {
          if (d > 120) { vx = ux * sp; vy = uy * sp; }
          else if (d < 70) { vx = -ux * sp * 0.6; vy = -uy * sp * 0.6; }
          if (d < 220 && e.fireCd <= 0) {
            // Tier 1 rifles are a nuisance, not a death sentence: a stationary hatchling should last ~30s+.
            e.fireCd = 1.8 + Math.random() * 1.0;
            this.fire('bullet', e.x, e.y, Math.atan2(dy, dx) + Phaser.Math.FloatBetween(-0.12, 0.12), 200, 2, 1.6);
            sfx.shot();
          }
        } else {
          // Tier 2+: panic. Keep distance, take pot-shots, flee when close.
          const keep = 150 * scale * 0.5;
          if (d < keep) { vx = -ux * sp * 1.2; vy = -uy * sp * 1.2; }
          else if (d > keep * 2.2) { vx = ux * sp; vy = uy * sp; }
          else { vx = -uy * sp * 0.5; vy = ux * sp * 0.5; }
          const range = tier === 2 ? 320 : 480;
          if (d < range && e.fireCd <= 0) {
            e.fireCd = (tier === 2 ? 2 : 3.5) + Math.random() * 1.5;
            this.fire('bullet', e.x, e.y, Math.atan2(dy, dx) + Phaser.Math.FloatBetween(-0.1, 0.1), 240, tier === 2 ? 3 : 2, 2.4);
            sfx.shot();
          }
        }
        if (e.detourT > 0) { vx = e.detourX * sp; vy = e.detourY * sp; }
        body.setVelocity(vx, vy);
        e.setFlipX(vx < 0);
      } else if (e.etype === 'tank') {
        const keep = tier === 1 ? 170 : tier === 2 ? 260 : 420;
        const sp = 48;
        if (e.detourT > 0) body.setVelocity(e.detourX * sp, e.detourY * sp);
        else if (d > keep + 40) body.setVelocity(ux * sp, uy * sp);
        else if (d < keep - 40) body.setVelocity(-ux * sp, -uy * sp);
        else body.setVelocity(-uy * sp * 0.6, ux * sp * 0.6);
        if (body.velocity.lengthSq() > 1) e.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
        const aim = Math.atan2(dy, dx);
        if (e.turret) {
          e.turret.setPosition(e.x, e.y).setRotation(aim).setDepth(e.y + 1);
        }
        if (d < keep + 260 && e.fireCd <= 0) {
          e.fireCd = (tier === 3 ? 1.5 : 2.4) + Math.random();
          const muzzle = 16;
          // Gunners lead the target on its current velocity: a straight-line runner gets hit; a sidestep still dodges.
          const speed = 340;
          const pv = (p.body as Phaser.Physics.Arcade.Body).velocity;
          const lead = d / speed;
          const tx = p.x + pv.x * lead, ty = p.y + pv.y * lead;
          const noise = [0.08, 0.06, 0.05][tier - 1];
          const shot = Math.atan2(ty - e.y, tx - e.x) + Phaser.Math.FloatBetween(-noise, noise);
          const pd = Math.hypot(tx - e.x, ty - e.y);
          this.fire('shell', e.x + Math.cos(aim) * muzzle, e.y + Math.sin(aim) * muzzle, shot, speed, [10, 14, 18][tier - 1], (pd + 30) / speed, 20 + tier * 10);
          s.fx.hit(e.x + Math.cos(aim) * muzzle, e.y + Math.sin(aim) * muzzle, 3);
          sfx.cannon();
        }
      } else {
        this.updateMech(e, dt, d, ux, uy);
      }
    }

    // projectiles
    for (const obj of this.shots.getChildren() as Projectile[]) {
      obj.life -= dt;
      if (obj.kind === 'missile') {
        const want = Math.atan2(p.y - obj.y, p.x - obj.x);
        const cur = obj.rotation;
        const next = Phaser.Math.Angle.RotateTo(cur, want, 2.2 * dt);
        obj.setRotation(next);
        s.physics.velocityFromRotation(next, 210, (obj.body as Phaser.Physics.Arcade.Body).velocity);
        if (Math.random() < 0.3) s.fx.hit(obj.x, obj.y, 1);
      }
      if (obj.life <= 0) {
        if (obj.splash > 0) this.splash(obj);
        obj.destroy();
      }
    }
  }

  /** Called by GameScene when a projectile touches the kaiju. */
  impact(obj: Projectile) {
    if (!obj.active) return;
    if (obj.splash > 0) this.splash(obj);
    else this.s.hurtPlayer(obj.dmg, obj.x, obj.y);
    obj.destroy();
  }

  private splash(obj: Projectile) {
    const s = this.s;
    s.fx.explode(obj.x, obj.y, obj.splash);
    const d = Phaser.Math.Distance.Between(obj.x, obj.y, s.player.x, s.player.y);
    if (d < obj.splash + s.player.radius) s.hurtPlayer(obj.dmg, obj.x, obj.y);
  }

  private updateMech(e: Enemy, dt: number, d: number, ux: number, uy: number) {
    const s = this.s, p = s.player;
    const body = e.body as Phaser.Physics.Arcade.Body;
    e.modeT -= dt;
    e.shadow?.setPosition(e.x, e.y + 4);
    const g = e.telegraph!;
    g.clear();
    if (e.mode === 'walk') {
      const sp = d > 260 ? 95 : 40;
      body.setVelocity(ux * sp, uy * sp);
      e.setFlipX(ux < 0);
      e.crushT -= dt;
      if (e.crushT <= 0) {
        e.crushT = 0.25;
        for (const b of s.city.grid.query(e.x, e.y, 34, [])) if (b.sizeClass <= 2) s.destroyDestructible(b, true, false);
      }
      if (e.modeT <= 0) {
        body.setVelocity(0, 0);
        const r = Math.random();
        e.mode = r < 0.4 ? 'salvo' : r < 0.75 ? 'laser' : 'quake';
        e.modeT = e.mode === 'salvo' ? 1.4 : e.mode === 'laser' ? 1.9 : 1.6;
        e.shotsLeft = 8;
        e.aim = Math.atan2(p.y - e.y, p.x - e.x);
        if (e.mode !== 'salvo') sfx.alarm();
      }
      return;
    }
    body.setVelocity(0, 0);
    const headY = e.y - 120;
    if (e.mode === 'salvo') {
      if (e.shotsLeft > 0 && e.modeT < 1.3 - (8 - e.shotsLeft) * 0.12) {
        e.shotsLeft--;
        const side = e.shotsLeft % 2 ? -1 : 1;
        this.fire('missile', e.x + side * 40, e.y - 95, -Math.PI / 2 + side * 0.6, 210, 9, 4.5);
        sfx.shot();
      }
    } else if (e.mode === 'laser') {
      // telegraph 1.1s, fire 0.8s, tracking slowly
      const firing = e.modeT < 0.8;
      const want = Math.atan2(p.y - headY, p.x - e.x);
      e.aim = Phaser.Math.Angle.RotateTo(e.aim, want, (firing ? 0.35 : 1.4) * dt);
      const L = 1400;
      const x2 = e.x + Math.cos(e.aim) * L, y2 = headY + Math.sin(e.aim) * L;
      if (!firing) {
        g.lineStyle(2, 0xff3355, 0.4 + 0.4 * Math.sin(s.gameTime / 40));
        g.lineBetween(e.x, headY, x2, y2);
      } else {
        g.lineStyle(26, 0xff3355, 0.35).lineBetween(e.x, headY, x2, y2);
        g.lineStyle(10, 0xffe0e8, 0.95).lineBetween(e.x, headY, x2, y2);
        const line = new Phaser.Geom.Line(e.x, headY, x2, y2);
        const pt = Phaser.Geom.Line.GetNearestPoint(line, new Phaser.Geom.Point(p.x, p.y));
        const on = Phaser.Math.Distance.Between(pt.x, pt.y, p.x, p.y) < p.radius + 10 && (pt.x - e.x) * Math.cos(e.aim) + (pt.y - headY) * Math.sin(e.aim) > 0;
        if (on && e.contactCd <= 0) {
          e.contactCd = 0.25;
          s.hurtPlayer(7, pt.x, pt.y);
        }
        if (Math.random() < 0.5) s.fx.hit(x2 * 0.02 + pt.x * 0.98, pt.y, 2);
        s.shake(0.004, 60);
      }
    } else if (e.mode === 'quake') {
      const R = 230;
      if (e.modeT > 0.4) {
        g.lineStyle(4, 0xff3355, 0.7).strokeCircle(e.x, e.y, R * (1 - (e.modeT - 0.4) / 1.2));
        g.lineStyle(2, 0xff3355, 0.35).strokeCircle(e.x, e.y, R);
      } else if (e.shotsLeft > 0) {
        e.shotsLeft = 0;
        s.fx.ring(e.x, e.y, R, 0xff5577, 450, 1);
        s.fx.dust(e.x, e.y, 16);
        s.shake(0.02, 300);
        sfx.stomp();
        if (Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) < R + p.radius) s.hurtPlayer(16, e.x, e.y);
      }
    }
    if (e.modeT <= 0) {
      e.mode = 'walk';
      e.modeT = Phaser.Math.FloatBetween(2.2, 3.2);
    }
  }
}

/** Move a point onto the nearest road centreline so spawns never land inside a building. */
function snapToRoad(x: number, y: number): [number, number] {
  const roadCentre = (v: number) => (Math.round(v / TILE / 9) * 9 + 1) * TILE;
  const rx = roadCentre(x), ry = roadCentre(y);
  return Math.abs(rx - x) <= Math.abs(ry - y) ? [rx, y] : [x, ry];
}
