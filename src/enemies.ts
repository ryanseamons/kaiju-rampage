// The military. Each unit has a job, and behaviour depends on the kaiju's tier:
//  soldier  – rifles; food for anything bigger than a hatchling (always crushable)
//  rocket   – slow homing rockets from long range (tier 2+ pressure)
//  heli     – flies over buildings, circles and strafes; can't be crushed, must be attacked
//  tank     – leads its shells; crushable only by a city-ender
//  cannon   – lightning-cannon truck: parks far away, telegraphs, then fires a beam (tier 3)
//  walker   – wave-3 mid-boss, a smaller mech; drops a supply crate
//  mech     – the flagship boss
// plus jet bombing runs (an event, not a unit) and elites (gold, 3× HP, drop crates).
import Phaser from 'phaser';
import { COAST_ROW, LAND_H, MAP_H, SIZE, TILE, WORLD_W } from './config';
import type { GameScene } from './scenes/GameScene';
import { sfx } from './sfx';
import { rng } from './rand';
import { t } from './i18n';

export type EnemyType = 'soldier' | 'rocket' | 'heli' | 'tank' | 'cannon' | 'walker' | 'mech'
  // daily featured threats
  | 'maser' | 'drone' | 'freeze' | 'netheli' | 'railgun' | 'sub' | 'riot';
/** Everything the military can field (jets are a bombing-run event). */
export const ENEMY_ROSTER = ['soldier', 'rocket', 'heli', 'tank', 'cannon', 'walker', 'mech', 'jet'] as const;

interface Kind {
  hp: number;
  size: number;
  tex: string;
  scale: number;
  flying?: boolean;
}
const KINDS: Record<EnemyType, Kind> = {
  soldier: { hp: 10, size: SIZE.soldier, tex: 'soldier0', scale: 1 },
  rocket: { hp: 18, size: SIZE.soldier, tex: 'rocket0', scale: 1 },
  heli: { hp: 55, size: 4, tex: 'heli0', scale: 1.6, flying: true },
  tank: { hp: 70, size: SIZE.tank, tex: 'tankHull', scale: 1.5 },
  cannon: { hp: 90, size: SIZE.tank, tex: 'cannon', scale: 1.6 },
  walker: { hp: 900, size: 4, tex: 'mech0', scale: 2.4 },
  mech: { hp: 3200, size: SIZE.mech, tex: 'mech0', scale: 3.8 },
  maser: { hp: 110, size: SIZE.tank, tex: 'maser', scale: 1.6 },
  drone: { hp: 5, size: 4, tex: 'drone', scale: 1.4, flying: true },
  freeze: { hp: 80, size: SIZE.tank, tex: 'tankHull', scale: 1.5 },
  netheli: { hp: 60, size: 4, tex: 'heli0', scale: 1.6, flying: true },
  railgun: { hp: 80, size: SIZE.tank, tex: 'railgun', scale: 1.6 },
  sub: { hp: 160, size: 4, tex: 'sub', scale: 1.8 },
  riot: { hp: 45, size: SIZE.house, tex: 'riot0', scale: 1.2 },
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  etype: EnemyType;
  hp: number;
  maxHp: number;
  sizeClass: number;
  flying: boolean;
  elite = false;
  fireCd: number;
  stun = 0;
  contactCd = 0;
  turret?: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  dead = false;
  // mech / walker / cannon state
  mode: 'walk' | 'salvo' | 'laser' | 'quake' | 'charge' = 'walk';
  modeT = 0;
  shotsLeft = 0;
  aim = 0;
  telegraph?: Phaser.GameObjects.Graphics;
  orbit = rng.ai.frac() * Math.PI * 2;
  orbitDir = rng.ai.frac() < 0.5 ? -1 : 1;
  // detour steering around buildings
  detourX = 0;
  detourY = 0;
  detourT = 0;
  crushT = 0;

  constructor(scene: GameScene, type: EnemyType, x: number, y: number, hpMult: number, elite = false) {
    const k = KINDS[type];
    super(scene, x, y, k.tex);
    this.etype = type;
    this.flying = !!k.flying;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.elite = elite;
    this.hp = this.maxHp = Math.round(k.hp * hpMult * (elite ? 3 : 1));
    this.sizeClass = k.size;
    this.fireCd = rng.ai.float(0.8, 2.2);
    this.setScale(k.scale * (elite ? 1.35 : 1));
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (type === 'soldier' || type === 'rocket') {
      this.play(type === 'soldier' ? 'soldier-walk' : 'rocket-walk');
      body.setCircle(4, 0.5, 1);
    } else if (type === 'tank' || type === 'freeze') {
      body.setSize(18, 14);
      this.turret = scene.add.image(x, y, 'tankTurret').setOrigin(0.3, 0.5).setScale(this.scale);
      if (type === 'freeze') {
        this.setTint(0x9fe8ff);
        this.turret.setTint(0x9fe8ff);
      }
    } else if (type === 'riot') {
      this.play('riot-walk');
      body.setCircle(5, 1, 0);
    } else if (type === 'drone') {
      body.setCircle(4, 0.5, 0.5);
    } else if (type === 'sub') {
      body.setSize(40, 12);
      this.mode = 'walk';
    } else if (type === 'cannon' || type === 'maser' || type === 'railgun') {
      body.setSize(20, 12);
      this.telegraph = scene.add.graphics().setDepth(9040);
    } else if (type === 'heli' || type === 'netheli') {
      this.play('heli-fly');
      if (type === 'netheli') this.setTint(0xc0b0ff);
      body.setCircle(9, 2, 1);
      this.shadow = scene.add.image(x, y, 'shadow').setScale(1.4, 0.8).setDepth(-40).setAlpha(0.6);
    } else {
      this.play('mech-walk');
      this.setOrigin(0.5, 0.9);
      body.setCircle(16, 6, 22);
      this.shadow = scene.add.image(x, y, 'shadow').setScale(type === 'mech' ? 5 : 3.2, type === 'mech' ? 3 : 2).setDepth(-40);
      this.telegraph = scene.add.graphics().setDepth(9040);
      if (type === 'walker') this.setTint(0x9aa66a);
    }
    if (elite) this.setTint(0xffd24a);
  }

  /** Submarine: only hittable while surfaced. */
  get submerged() {
    return this.etype === 'sub' && this.mode !== 'charge' && this.mode !== 'salvo';
  }

  destroyAll() {
    this.turret?.destroy();
    this.shadow?.destroy();
    this.telegraph?.destroy();
    this.destroy();
  }
}

interface Projectile extends Phaser.Physics.Arcade.Image {
  kind: 'bullet' | 'shell' | 'missile' | 'rocket' | 'torpedo';
  /** Freeze Tank shells slow the kaiju. */
  effect?: 'freeze';
  dmg: number;
  life: number;
  splash: number;
  turn: number;
  speed: number;
}

interface JetRun {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number; // seconds since start; telegraph until WARN, then the pass
  sprite?: Phaser.GameObjects.Image;
  g: Phaser.GameObjects.Graphics;
  bombsDone: number;
}
const JET_WARN = 1.4;

/** Beam trucks: the lightning cannon, and two daily threats that share its telegraph-then-fire loop. */
const BEAMS = {
  cannon: { keep: 520, charge: 1.8, lock: 0.35, track: 0.9, color: 0x9ffcff, sight: 2, grow: 6, width: 22, dmg: 22, cooldown: 5 },
  // Maser Tank: closer, a fatter beam you can see coming from further off.
  maser: { keep: 300, charge: 1.3, lock: 0.3, track: 1.5, color: 0x5ff6ff, sight: 3, grow: 8, width: 30, dmg: 20, cooldown: 4 },
  // Railgun Truck: far away, a thin laser sight that tracks fast, then an instant heavy round.
  railgun: { keep: 680, charge: 1.6, lock: 0.25, track: 3.0, color: 0xff3355, sight: 1, grow: 1, width: 12, dmg: 26, cooldown: 4.5 },
};
const JET_SPEED = 950;

export class EnemyManager {
  list: Enemy[] = [];
  group: Phaser.Physics.Arcade.Group;
  shots: Phaser.Physics.Arcade.Group;
  spawnedTypes = new Set<string>();
  /** First spawns of the run, in order (debug/tests: the daily must give everyone the same army). */
  spawnLog: string[] = [];
  boss: Enemy | null = null;
  jets: JetRun[] = [];
  /** Wave scaling, set by the director. */
  hpMult = 1;
  dmgMult = 1;

  constructor(private s: GameScene) {
    this.group = s.physics.add.group();
    this.shots = s.physics.add.group();
  }

  count(type: EnemyType) {
    let n = 0;
    for (const e of this.list) if (e.etype === type) n++;
    return n;
  }

  /** Direction to walk toward the kaiju: the flow field around buildings, or a straight line in the open. */
  private toward(e: Enemy, ux: number, uy: number): [number, number] {
    return this.s.nav.dir(e.x, e.y) ?? [ux, uy];
  }

  private viewRadius(extra = 40) {
    const v = this.s.cameras.main.worldView;
    return Math.hypot(v.width, v.height) / 2 + extra;
  }

  /** Spawn just outside the visible area, on land, on a road. */
  spawnOffscreen(type: EnemyType, elite = false) {
    const R = this.viewRadius(type === 'mech' || type === 'walker' ? 0 : 40);
    const p = this.s.player;
    for (let i = 0; i < 8; i++) {
      const a = rng.spawn.frac() * Math.PI * 2;
      const [x, y] = this.s.city.snapToRoad(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
      if (x > 20 && x < WORLD_W - 20 && y > 20 && y < LAND_H - 30) return this.spawn(type, x, y, elite);
    }
    const [x, y] = this.s.city.snapToRoad(Phaser.Math.Clamp(p.x + R, 20, WORLD_W - 20), Math.max(40, p.y - R * 0.5));
    return this.spawn(type, x, y, elite);
  }

  /** Drone swarm: a tight cluster arriving from off screen. */
  spawnSwarm(n: number) {
    const lead = this.spawnOffscreen('drone');
    for (let i = 1; i < n; i++) this.spawn('drone', lead.x + rng.spawn.between(-30, 30), lead.y + rng.spawn.between(-30, 30));
  }

  /** Riot line: shields shoulder to shoulder across the kaiju's path, on screen. */
  spawnRiotLine(n: number) {
    const p = this.s.player;
    const a = rng.spawn.frac() * Math.PI * 2;
    const R = this.viewRadius(0) * 0.6;
    const cx = p.x + Math.cos(a) * R, cy = p.y + Math.sin(a) * R;
    const px = -Math.sin(a), py = Math.cos(a);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 16;
      const x = Phaser.Math.Clamp(cx + px * off, 20, WORLD_W - 20), y = Phaser.Math.Clamp(cy + py * off, 20, LAND_H - 30);
      this.spawn('riot', x, y);
    }
  }

  /** Submarine: surfaces from the bay near the kaiju's longitude. */
  spawnSub() {
    const p = this.s.player;
    const x = Phaser.Math.Clamp(p.x + rng.spawn.between(-400, 400), 60, WORLD_W - 60);
    const e = this.spawn('sub', x, (MAP_H - 4) * TILE);
    e.modeT = 2;
    return e;
  }

  /** A closing ring of infantry around the kaiju, on screen. */
  encircle(n: number, rocketShare: number) {
    const p = this.s.player;
    const R = this.viewRadius(0) * 0.62;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.spawn.frac() * 0.1;
      const [x, y] = this.s.city.snapToRoad(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
      if (x < 20 || x > WORLD_W - 20 || y < 20 || y > LAND_H - 30) continue;
      this.spawn(rng.spawn.frac() < rocketShare ? 'rocket' : 'soldier', x, y);
    }
  }

  spawn(type: EnemyType, x: number, y: number, elite = false) {
    const e = new Enemy(this.s, type, x, y, type === 'mech' ? this.hpMult * 0.8 + 0.2 : this.hpMult, elite);
    this.group.add(e);
    this.list.push(e);
    this.spawnedTypes.add(type);
    if (this.spawnLog.length < 40) this.spawnLog.push(elite ? `${type}*` : type);
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
    for (const j of this.jets) {
      j.g.destroy();
      j.sprite?.destroy();
    }
    this.jets = [];
  }

  private fire(kind: Projectile['kind'], x: number, y: number, angle: number, speed: number, dmg: number, life: number, splash = 0, turn = 0, effect?: 'freeze') {
    const tex = kind === 'bullet' ? 'bullet' : kind === 'shell' ? 'shell' : kind === 'torpedo' ? 'torpedo' : 'missile';
    const p = this.s.physics.add.image(x, y, tex) as Projectile;
    this.shots.add(p);
    p.kind = kind;
    p.dmg = dmg * this.dmgMult;
    p.life = life;
    p.splash = splash;
    p.turn = turn;
    p.speed = speed;
    p.effect = effect;
    p.setDepth(9100).setRotation(angle);
    if (effect === 'freeze') p.setTint(0x9fe8ff);
    // Keep projectiles readable when the camera is zoomed out at higher tiers.
    const zs = Math.max(1, 0.85 / this.s.cameras.main.zoom);
    p.setScale((kind === 'missile' ? 2 : kind === 'rocket' ? 1.4 : kind === 'shell' ? 1.5 : 1) * zs);
    if (kind === 'rocket') p.setTint(0xffb040);
    this.s.physics.velocityFromRotation(angle, speed, (p.body as Phaser.Physics.Arcade.Body).velocity);
  }

  /** Aim at where the kaiju will be (current velocity), with some noise. */
  private lead(e: { x: number; y: number }, speed: number, noise: number) {
    const p = this.s.player;
    const pv = (p.body as Phaser.Physics.Arcade.Body).velocity;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    const t = d / speed;
    const tx = p.x + pv.x * t, ty = p.y + pv.y * t;
    return { angle: Math.atan2(ty - e.y, tx - e.x) + rng.ai.float(-noise, noise), dist: Math.hypot(tx - e.x, ty - e.y) };
  }

  /** Jet bombing run along a line through the kaiju's position. */
  jetRun() {
    const p = this.s.player;
    const a = rng.ai.frac() * Math.PI;
    const L = this.viewRadius(200);
    const run: JetRun = {
      x0: p.x - Math.cos(a) * L, y0: p.y - Math.sin(a) * L, x1: p.x + Math.cos(a) * L, y1: p.y + Math.sin(a) * L,
      t: 0, g: this.s.add.graphics().setDepth(9045), bombsDone: 0,
    };
    this.jets.push(run);
    this.spawnedTypes.add('jet');
    sfx.alarm();
  }

  private updateJets(dt: number) {
    const s = this.s, p = s.player;
    const k = Math.max(1, p.scale * 0.5);
    for (const j of [...this.jets]) {
      j.t += dt;
      j.g.clear();
      const len = Math.hypot(j.x1 - j.x0, j.y1 - j.y0);
      const ux = (j.x1 - j.x0) / len, uy = (j.y1 - j.y0) / len;
      if (j.t < JET_WARN) {
        // dashed red telegraph, blinking faster as the jet nears
        const on = Math.floor(j.t * (6 + j.t * 10)) % 2 === 0;
        j.g.lineStyle(4 * k, 0xff3355, on ? 0.75 : 0.3);
        for (let d = 0; d < len; d += 60 * k) j.g.lineBetween(j.x0 + ux * d, j.y0 + uy * d, j.x0 + ux * (d + 34 * k), j.y0 + uy * (d + 34 * k));
        continue;
      }
      const dist = (j.t - JET_WARN) * JET_SPEED * k;
      if (!j.sprite) {
        j.sprite = s.add.image(j.x0, j.y0, 'jet').setDepth(9700).setScale(2.2 * k).setRotation(Math.atan2(uy, ux));
        sfx.jet();
      }
      j.sprite.setPosition(j.x0 + ux * dist, j.y0 + uy * dist);
      // bombs every 70px along the path, exploding just behind the jet
      const spacing = 70 * k;
      while (j.bombsDone * spacing < dist - 30 * k && j.bombsDone * spacing < len) {
        const bx = j.x0 + ux * j.bombsDone * spacing, by = j.y0 + uy * j.bombsDone * spacing;
        j.bombsDone++;
        const R = (26 + 8 * s.tier) * k;
        s.fx.explode(bx, by, R);
        if (j.bombsDone % 3 === 0) sfx.cannon();
        if (Phaser.Math.Distance.Between(bx, by, p.x, p.y) < R + p.radius) s.hurtPlayer(14 * this.dmgMult, bx, by);
        for (const b of s.city.grid.query(bx, by, R, [])) if (b.sizeClass <= 2) s.destroyDestructible(b, false, false);
      }
      if (dist > len + 200) {
        j.g.destroy();
        j.sprite.destroy();
        this.jets.splice(this.jets.indexOf(j), 1);
      }
    }
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
      e.setDepth(e.flying ? 9050 : e.y);
      if (e.stun > 0) {
        e.stun -= dt;
        body.velocity.scale(0.9);
        continue;
      }
      // Blocked by a building: sidestep along the perpendicular that leans toward the kaiju, briefly.
      e.detourT -= dt;
      if (!e.flying && e.etype !== 'mech' && e.etype !== 'walker' && e.detourT <= 0 && (!body.touching.none || !body.blocked.none) && !this.s.nav.dir(e.x, e.y)) {
        const v = body.velocity;
        const L = v.length() || 1;
        const px = -v.y / L, py = v.x / L;
        const sgn = px * ux + py * uy >= 0 ? 1 : -1;
        e.detourX = px * sgn;
        e.detourY = py * sgn;
        e.detourT = 0.5;
      }
      switch (e.etype) {
        case 'soldier':
        case 'rocket':
          this.updateInfantry(e, d, dx, dy, ux, uy, tier);
          break;
        case 'tank':
        case 'freeze':
          this.updateTank(e, d, dx, dy, ux, uy, tier);
          break;
        case 'heli':
        case 'netheli':
          this.updateHeli(e, dt, d, ux);
          break;
        case 'cannon':
        case 'maser':
        case 'railgun':
          this.updateCannon(e, dt, d, ux, uy);
          break;
        case 'drone':
          this.updateDrone(e, dt, d, ux, uy);
          break;
        case 'riot':
          this.updateRiot(e, d, ux, uy);
          break;
        case 'sub':
          this.updateSub(e, dt, d);
          break;
        default:
          this.updateMech(e, dt, d, ux, uy);
      }
    }
    this.updateJets(dt);

    // projectiles
    for (const obj of this.shots.getChildren() as Projectile[]) {
      obj.life -= dt;
      if (obj.turn > 0) {
        const want = Math.atan2(p.y - obj.y, p.x - obj.x);
        const next = Phaser.Math.Angle.RotateTo(obj.rotation, want, obj.turn * dt);
        obj.setRotation(next);
        s.physics.velocityFromRotation(next, obj.speed, (obj.body as Phaser.Physics.Arcade.Body).velocity);
        if (Math.random() < 0.3) s.fx.hit(obj.x, obj.y, 1);
      }
      if (obj.life <= 0) {
        if (obj.splash > 0) this.splash(obj);
        obj.destroy();
      }
    }
  }

  private updateInfantry(e: Enemy, d: number, dx: number, dy: number, ux: number, uy: number, tier: number) {
    const body = e.body as Phaser.Physics.Arcade.Body;
    const p = this.s.player;
    let vx = 0, vy = 0;
    // Infantry are always slower than the kaiju, so escape is possible but never free.
    const sp = e.etype === 'rocket' ? 50 : 62;
    const rocket = e.etype === 'rocket';
    const [ax, ay] = this.toward(e, ux, uy);
    if (tier === 1 && !rocket) {
      if (d > 120) { vx = ax * sp; vy = ay * sp; }
      else if (d < 70) { vx = -ux * sp * 0.6; vy = -uy * sp * 0.6; }
      if (d < 220 && e.fireCd <= 0) {
        // Tier 1 rifles are a nuisance, not a death sentence: a stationary hatchling should last ~30s+.
        e.fireCd = 1.8 + rng.ai.frac() * 1.0;
        this.fire('bullet', e.x, e.y, Math.atan2(dy, dx) + rng.ai.float(-0.12, 0.12), 200, 2, 1.6);
        sfx.shot();
      }
    } else {
      // Keep distance, take shots, flee when close. Rocket teams hang further back.
      // They close to within 85% of their weapon's range before circling, so they always get to shoot.
      const range = rocket ? 560 : tier === 2 ? 320 : 480;
      const keep = Math.min((rocket ? 240 : 150) * p.scale * 0.5, range * 0.55);
      if (d < keep) { vx = -ux * sp * 1.2; vy = -uy * sp * 1.2; }
      else if (d > range * 0.85) { vx = ax * sp; vy = ay * sp; }
      else { vx = -uy * sp * 0.5 * e.orbitDir; vy = ux * sp * 0.5 * e.orbitDir; }
      if (rocket) {
        if (d < range && e.fireCd <= 0) {
          e.fireCd = 3.2 + rng.ai.frac();
          this.fire('rocket', e.x, e.y, Math.atan2(dy, dx), 170, 7, 4, 16, 1.4);
          sfx.shot();
        }
      } else {
        if (d < range && e.fireCd <= 0) {
          e.fireCd = (tier === 2 ? 2 : 3.5) + rng.ai.frac() * 1.5;
          this.fire('bullet', e.x, e.y, Math.atan2(dy, dx) + rng.ai.float(-0.1, 0.1), 240, tier === 2 ? 3 : 2, 2.4);
          sfx.shot();
        }
      }
    }
    if (e.detourT > 0) { vx = e.detourX * sp; vy = e.detourY * sp; }
    body.setVelocity(vx, vy);
    e.setFlipX(vx < 0);
  }

  private updateTank(e: Enemy, d: number, dx: number, dy: number, ux: number, uy: number, tier: number) {
    const body = e.body as Phaser.Physics.Arcade.Body;
    const keep = tier === 1 ? 170 : tier === 2 ? 260 : 420;
    const sp = 48;
    const [ax, ay] = this.toward(e, ux, uy);
    if (e.detourT > 0) body.setVelocity(e.detourX * sp, e.detourY * sp);
    else if (d > keep + 40) body.setVelocity(ax * sp, ay * sp);
    else if (d < keep - 40) body.setVelocity(-ux * sp, -uy * sp);
    else body.setVelocity(-uy * sp * 0.6, ux * sp * 0.6);
    if (body.velocity.lengthSq() > 1) e.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
    const aim = Math.atan2(dy, dx);
    e.turret?.setPosition(e.x, e.y).setRotation(aim).setDepth(e.y + 1);
    if (d < keep + 260 && e.fireCd <= 0) {
      e.fireCd = (tier === 3 ? 1.5 : 2.4) + rng.ai.frac();
      const muzzle = 16;
      // Gunners lead the target on its current velocity: a straight-line runner gets hit; a sidestep still dodges.
      const speed = 340;
      const { angle, dist } = this.lead(e, speed, [0.08, 0.06, 0.05][tier - 1]);
      this.fire('shell', e.x + Math.cos(aim) * muzzle, e.y + Math.sin(aim) * muzzle, angle, speed, [10, 14, 18][tier - 1] * (e.etype === 'freeze' ? 0.7 : 1), (dist + 30) / speed, 20 + tier * 10, 0, e.etype === 'freeze' ? 'freeze' : undefined);
      this.s.fx.hit(e.x + Math.cos(aim) * muzzle, e.y + Math.sin(aim) * muzzle, 3);
      sfx.cannon();
    }
  }

  /** Circles the kaiju above the rooftops and strafes in short bursts. */
  private updateHeli(e: Enemy, dt: number, d: number, ux: number) {
    const s = this.s, p = s.player;
    const body = e.body as Phaser.Physics.Arcade.Body;
    const R = (200 + 70 * s.tier) * Math.max(1, p.scale * 0.45);
    e.orbit += e.orbitDir * dt * 0.45;
    const tx = p.x + Math.cos(e.orbit) * R, ty = p.y + Math.sin(e.orbit) * R;
    const sp = 140;
    const vx = tx - e.x, vy = ty - e.y;
    const L = Math.hypot(vx, vy) || 1;
    body.setVelocity((vx / L) * Math.min(sp, L * 2), (vy / L) * Math.min(sp, L * 2));
    e.setFlipX(ux < 0);
    e.shadow?.setPosition(e.x + 10, e.y + 28);
    if (e.etype === 'netheli') return this.netDrop(e, dt, d, R);
    if (d < R + 140 && e.fireCd <= 0) {
      if (e.shotsLeft <= 0) e.shotsLeft = 3;
      e.shotsLeft--;
      e.fireCd = e.shotsLeft > 0 ? 0.16 : 2.4 + rng.ai.frac();
      const { angle } = this.lead(e, 280, 0.06);
      this.fire('bullet', e.x, e.y, angle, 280, 3, 2.2);
      sfx.shot();
    }
  }

  /** Lightning-cannon truck: parks far out, telegraphs a line, then fires a short beam. */
  private updateCannon(e: Enemy, dt: number, d: number, ux: number, uy: number) {
    const s = this.s, p = s.player;
    const body = e.body as Phaser.Physics.Arcade.Body;
    const g = e.telegraph!;
    g.clear();
    const cfg = BEAMS[e.etype as 'cannon'];
    const keep = cfg.keep;
    if (e.mode !== 'charge') {
      const sp = 44;
      const [ax, ay] = this.toward(e, ux, uy);
      if (e.detourT > 0) body.setVelocity(e.detourX * sp, e.detourY * sp);
      else if (d > keep + 60) body.setVelocity(ax * sp, ay * sp);
      else if (d < keep - 80) body.setVelocity(-ux * sp, -uy * sp);
      else body.setVelocity(0, 0);
      if (body.velocity.lengthSq() > 1) e.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
      if (d < keep + 200 && e.fireCd <= 0) {
        e.mode = 'charge';
        e.modeT = cfg.charge;
        e.aim = Math.atan2(p.y - e.y, p.x - e.x);
        sfx.charge();
      }
      return;
    }
    body.setVelocity(0, 0);
    e.modeT -= dt;
    const L = 1600;
    // tracks slowly while charging, locks for the last 0.35s
    if (e.modeT > cfg.lock) e.aim = Phaser.Math.Angle.RotateTo(e.aim, Math.atan2(p.y - e.y, p.x - e.x), cfg.track * dt);
    const x2 = e.x + Math.cos(e.aim) * L, y2 = e.y + Math.sin(e.aim) * L;
    if (e.modeT > 0) {
      const k = 1 - e.modeT / cfg.charge;
      g.lineStyle(cfg.sight + cfg.grow * k, cfg.color, 0.25 + 0.6 * k).lineBetween(e.x, e.y, x2, y2);
      if (Math.random() < 0.4) s.fx.hit(e.x + Math.cos(e.aim) * 14, e.y + Math.sin(e.aim) * 14, 1);
      return;
    }
    // fire
    g.lineStyle(cfg.width, cfg.color, 0.45).lineBetween(e.x, e.y, x2, y2);
    g.lineStyle(cfg.width * 0.36, 0xffffff, 0.95).lineBetween(e.x, e.y, x2, y2);
    const line = new Phaser.Geom.Line(e.x, e.y, x2, y2);
    const pt = Phaser.Geom.Line.GetNearestPoint(line, new Phaser.Geom.Point(p.x, p.y));
    const ahead = (pt.x - e.x) * Math.cos(e.aim) + (pt.y - e.y) * Math.sin(e.aim) > 0;
    if (ahead && Phaser.Math.Distance.Between(pt.x, pt.y, p.x, p.y) < p.radius + cfg.width * 0.5) s.hurtPlayer(cfg.dmg * this.dmgMult, pt.x, pt.y);
    s.shake(0.006, 120);
    sfx.zap();
    e.mode = 'walk';
    e.fireCd = cfg.cooldown + rng.ai.frac() * 2;
    this.s.time.delayedCall(140, () => e.telegraph?.clear());
  }

  /** Drone swarm: a loose orbit that tightens, then a kamikaze dive. */
  private updateDrone(e: Enemy, dt: number, d: number, ux: number, uy: number) {
    const p = this.s.player, body = e.body as Phaser.Physics.Arcade.Body;
    e.orbit += e.orbitDir * dt * 2.2;
    e.modeT += dt;
    const R = Math.max(0, 90 - e.modeT * 14) * Math.max(1, p.scale * 0.6);
    const tx = p.x + Math.cos(e.orbit) * R, ty = p.y - 8 * p.scale + Math.sin(e.orbit) * R;
    const vx = tx - e.x, vy = ty - e.y, L = Math.hypot(vx, vy) || 1;
    const sp = 175;
    body.setVelocity((vx / L) * sp, (vy / L) * sp);
    if (d < p.radius + 8) {
      this.s.hurtPlayer(3 * this.dmgMult, e.x, e.y);
      this.s.fx.hit(e.x, e.y, 4);
      sfx.hit(true);
      this.remove(e);
    }
    void ux;
    void uy;
  }

  /** Riot line: shields up, shoulder to shoulder, a slow advance. Soaks damage; crushable from Behemoth. */
  private updateRiot(e: Enemy, d: number, ux: number, uy: number) {
    const body = e.body as Phaser.Physics.Arcade.Body;
    const sp = 34;
    if (d > 26) body.setVelocity(ux * sp, uy * sp);
    else body.setVelocity(0, 0);
    e.setFlipX(ux < 0);
  }

  /** Submarine: patrols the bay under water, surfaces near the kaiju, fires torpedoes up the streets. */
  private updateSub(e: Enemy, dt: number, d: number) {
    const p = this.s.player, body = e.body as Phaser.Physics.Arcade.Body;
    const shore = (COAST_ROW + 2) * TILE, floor = (MAP_H - 2) * TILE;
    e.modeT -= dt;
    const tx = Phaser.Math.Clamp(p.x + Math.sin(e.orbit) * 160, 40, WORLD_W - 40);
    const ty = Phaser.Math.Clamp(shore + 30, shore, floor);
    if (e.mode === 'walk') {
      // submerged: a dark shape, quick
      e.setAlpha(0.3);
      const vx = tx - e.x, vy = ty - e.y, L = Math.hypot(vx, vy) || 1;
      body.setVelocity((vx / L) * Math.min(90, L), (vy / L) * Math.min(90, L));
      if (e.modeT <= 0 && d < 760) {
        e.mode = 'charge'; // surfaced
        e.modeT = 4.5;
        e.shotsLeft = 2;
        e.fireCd = 0.8;
        this.s.fx.dust(e.x, e.y, 6);
      }
    } else {
      e.setAlpha(1);
      body.setVelocity(0, 0);
      if (e.fireCd <= 0 && e.shotsLeft > 0) {
        e.shotsLeft--;
        e.fireCd = 1.4;
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        this.fire('torpedo', e.x, e.y - 6, a, 230, 16, 4.2, 34);
        sfx.cannon();
      }
      if (e.modeT <= 0) {
        e.mode = 'walk';
        e.modeT = rng.ai.float(4, 7);
        e.orbit = rng.ai.frac() * Math.PI * 2;
      }
    }
    e.setFlipX(p.x < e.x);
  }

  /** Net Helicopter: instead of strafing, drops a weighted net on where the kaiju is standing. */
  private netDrop(e: Enemy, dt: number, d: number, R: number) {
    const s = this.s, p = s.player, g = (e.telegraph ??= s.add.graphics().setDepth(9040));
    if (e.mode === 'charge') {
      e.modeT -= dt;
      const r = 30 * Math.max(1, p.scale * 0.8);
      g.clear().lineStyle(3, 0xc0b0ff, 0.5 + 0.5 * Math.sin(e.modeT * 30)).strokeCircle(e.aim, e.shotsLeft, r);
      if (e.modeT <= 0) {
        g.clear();
        e.mode = 'walk';
        e.fireCd = rng.ai.float(5, 7);
        s.fx.dust(e.aim, e.shotsLeft, 4);
        if (Phaser.Math.Distance.Between(p.x, p.y, e.aim, e.shotsLeft) < r + p.radius * 0.4) {
          p.netT = 1.4;
          s.fx.word(p.x, p.y - 24 * p.scale, t('w_netted'), '#c0b0ff', 1 + s.player.tierIdx * 0.6);
          sfx.hit(true);
        }
      }
      return;
    }
    if (d < R + 160 && e.fireCd <= 0) {
      // mark the spot (stored in aim/shotsLeft to avoid new fields)
      e.mode = 'charge';
      e.modeT = 1.0;
      e.aim = p.x;
      e.shotsLeft = p.y;
    }
  }

  /** Called by GameScene when a projectile touches the kaiju. */
  impact(obj: Projectile) {
    if (!obj.active) return;
    if (obj.effect === 'freeze') this.s.player.slowT = 2.4;
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
    const mini = e.etype === 'walker';
    e.modeT -= dt;
    e.shadow?.setPosition(e.x, e.y + 4);
    const g = e.telegraph!;
    g.clear();
    if (e.mode === 'walk') {
      const sp = d > 260 ? (mini ? 80 : 95) : 40;
      body.setVelocity(ux * sp, uy * sp);
      e.setFlipX(ux < 0);
      e.crushT -= dt;
      if (e.crushT <= 0) {
        e.crushT = 0.25;
        for (const b of s.city.grid.query(e.x, e.y, mini ? 24 : 34, [])) if (b.sizeClass <= 2) s.destroyDestructible(b, true, false);
      }
      if (e.modeT <= 0) {
        body.setVelocity(0, 0);
        const r = rng.ai.frac();
        e.mode = mini ? (r < 0.6 ? 'salvo' : 'quake') : r < 0.4 ? 'salvo' : r < 0.75 ? 'laser' : 'quake';
        e.modeT = e.mode === 'salvo' ? 1.4 : e.mode === 'laser' ? 1.9 : 1.6;
        e.shotsLeft = mini ? 4 : 8;
        e.aim = Math.atan2(p.y - e.y, p.x - e.x);
        if (e.mode !== 'salvo') sfx.alarm();
      }
      return;
    }
    body.setVelocity(0, 0);
    const headY = e.y - (mini ? 76 : 120);
    if (e.mode === 'salvo') {
      const total = mini ? 4 : 8;
      if (e.shotsLeft > 0 && e.modeT < 1.3 - (total - e.shotsLeft) * 0.12) {
        e.shotsLeft--;
        const side = e.shotsLeft % 2 ? -1 : 1;
        this.fire('missile', e.x + side * (mini ? 26 : 40), headY + 25, -Math.PI / 2 + side * 0.6, 210, 9, 4.5, 0, 2.2);
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
          s.hurtPlayer(7 * this.dmgMult, pt.x, pt.y);
        }
        if (Math.random() < 0.5) s.fx.hit(pt.x, pt.y, 2);
        s.shake(0.004, 60);
      }
    } else if (e.mode === 'quake') {
      const R = mini ? 150 : 230;
      if (e.modeT > 0.4) {
        g.lineStyle(4, 0xff3355, 0.7).strokeCircle(e.x, e.y, R * (1 - (e.modeT - 0.4) / 1.2));
        g.lineStyle(2, 0xff3355, 0.35).strokeCircle(e.x, e.y, R);
      } else if (e.shotsLeft > 0) {
        e.shotsLeft = 0;
        s.fx.ring(e.x, e.y, R, 0xff5577, 450, 1);
        s.fx.dust(e.x, e.y, 16);
        s.shake(0.02, 300);
        sfx.stomp();
        if (Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) < R + p.radius) s.hurtPlayer((mini ? 12 : 16) * this.dmgMult, e.x, e.y);
      }
    }
    if (e.modeT <= 0) {
      e.mode = 'walk';
      e.modeT = rng.ai.float(2.2, 3.2);
    }
  }
}

/** Road centreline nearest to a point on the default 9-tile city grid (used until biomes provide their own). */
export function gridSnapToRoad(x: number, y: number): [number, number] {
  const roadCentre = (v: number) => (Math.round(v / TILE / 9) * 9 + 1) * TILE;
  const rx = roadCentre(x), ry = roadCentre(y);
  return Math.abs(rx - x) <= Math.abs(ry - y) ? [rx, y] : [x, ry];
}
