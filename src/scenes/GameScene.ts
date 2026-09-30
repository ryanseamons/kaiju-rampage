import Phaser from 'phaser';
import {
  BULLETIN_LEAD_S, BULLETIN_MIN_FRACTION, LAND_H, WAVE1_GRACE_S, REWARDS, SEED, START_WAVE, TIERS, TIME_SCALE, WAVES, WORLD_H, WORLD_W, XP_TO_LEVEL,
} from '../config';
import { City, circleHits, districtAt, type Destructible } from '../city';
import { Kaiju } from '../player';
import { Enemy, EnemyManager, ENEMY_ROSTER } from '../enemies';
import { Weapons } from '../weapons';
import { Fx } from '../fx';
import { RunTracker } from '../stats';
import { NewsDesk } from '../news';
import { UPGRADES, rollOffer, type UpgradeDef } from '../upgrades';
import { mulberry32 } from '../rng';
import { sfx } from '../sfx';
import { music } from '../audio/music';
import { duckMusic } from '../audio/core';
import { t, t as tr, tierName } from '../i18n';
import type { Bulletin, RunStats, Tier } from '../shared/narration';
import type { UIScene } from './UIScene';
import { recordBest } from '../scores';

export type Phase = 'title' | 'playing' | 'paused' | 'levelup' | 'bulletin' | 'dying' | 'gameover' | 'victory';

interface Pickup {
  img: Phaser.GameObjects.Image;
  kind: 'xp' | 'heart';
  value: number;
  x: number;
  y: number;
  alive: boolean;
  settle: number;
}

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SPACE' | 'SHIFT', Phaser.Input.Keyboard.Key>;

export class GameScene extends Phaser.Scene {
  city!: City;
  player!: Kaiju;
  enemies!: EnemyManager;
  weapons!: Weapons;
  fx!: Fx;
  ui!: UIScene;
  stats = new RunTracker();
  news = new NewsDesk();
  phase: Phase = 'title';
  gameTime = 0;
  waveIdx = 0;
  waveTime = 0;
  maxTierReached = 1;
  bulletinsShown = 0;
  lastBulletin: Bulletin | null = null;
  lastStats: RunStats | null = null;
  offer: UpgradeDef[] = [];
  pendingLevelUps = 0;
  levelUpsShown = 0;
  /** Real damage taken this run (after armor); a test guard that enemies still have teeth. */
  damageTaken = 0;
  private pickups: Pickup[] = [];
  private keys!: Keys;
  private rand = mulberry32(SEED ^ 0x9e3779b9);
  private hitStopLeft = 0;
  private shakeUntil = 0;
  private shakeI = 0;
  private soldierAcc = 0;
  private tankAcc = 0;
  private bossSpawnAt = -1;
  private padA = false;
  private tmp: Destructible[] = [];
  private bumpCd = 0;
  /** Which stomp hint the HUD should show right now (i18n key), if any. */
  stompHint: 'stompPrompt' | 'stompTip' | null = null;
  private titleFx: Phaser.GameObjects.Image[] = [];
  private titleT = 0;

  constructor() {
    super('Game');
  }

  get tier(): Tier {
    return this.player.tier.tier;
  }
  get wave() {
    return WAVES[this.waveIdx];
  }
  get waveDuration() {
    return this.wave.duration * TIME_SCALE;
  }

  create() {
    this.stats = new RunTracker();
    this.news = new NewsDesk();
    this.phase = 'title';
    this.gameTime = 0;
    this.waveIdx = 0;
    this.pickups = [];
    this.pendingLevelUps = 0;
    this.maxTierReached = 1;
    this.bulletinsShown = 0;
    this.levelUpsShown = 0;
    this.damageTaken = 0;
    this.lastBulletin = null;

    this.physics.world.setBounds(0, 0, WORLD_W, LAND_H - 6);
    this.city = new City(this, SEED);
    this.city.build();
    this.fx = new Fx(this);
    this.player = new Kaiju(this, WORLD_W / 2, LAND_H - 70);
    this.enemies = new EnemyManager(this);
    this.weapons = new Weapons(this);

    this.physics.add.collider(
      this.player,
      this.city.solids,
      (_p, z) => this.onBump((z as Phaser.GameObjects.Zone).getData('d') as Destructible),
      (_p, z) => {
        const d = (z as Phaser.GameObjects.Zone).getData('d') as Destructible;
        return d.alive && d.sizeClass > this.tier;
      },
    );
    // Infantry and tanks go around buildings; the mech walks through (and flattens) them.
    this.physics.add.collider(this.enemies.group, this.city.solids, undefined, (e, z) => {
      const d = (z as Phaser.GameObjects.Zone).getData('d') as Destructible;
      return d.alive && (e as Enemy).etype !== 'mech';
    });
    this.physics.add.overlap(this.player, this.enemies.group, (_p, e) => this.onEnemyContact(e as Enemy));
    this.physics.add.overlap(this.player, this.enemies.shots, (_p, shot) => this.enemies.impact(shot as never));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    // Title backdrop: drift over the night city with searchlights; startRun() swoops down to the kaiju.
    cam.setZoom(0.9);
    cam.centerOn(WORLD_W / 2, LAND_H - 700);
    this.titleT = 0;
    this.titleFx = [0.3, 0.52, 0.74].map((fx, i) =>
      this.add
        .image(WORLD_W * fx, LAND_H - 260 - i * 120, 'searchlight')
        .setOrigin(0, 0.5)
        .setScale(7, 2.6)
        .setAlpha(0.22)
        .setTint(i === 1 ? 0xbfe8ff : 0xfff1c8)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(9600),
    );
    cam.setBackgroundColor('#05060d');

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT') as Keys;
    this.ui = this.scene.get('UI') as UIScene;
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.input.keyboard?.resetKeys());

    this.exposeDebug();
    this.ui.onGameReady(this);
  }

  // ── Run flow ───────────────────────────────────────────────────────────────
  startRun() {
    if (this.phase !== 'title') return;
    for (const f of this.titleFx) f.destroy();
    this.titleFx = [];
    sfx.unlock();
    this.waveIdx = START_WAVE - 1;
    if (START_WAVE > 1) {
      const t = START_WAVE >= 4 ? 2 : START_WAVE >= 2 ? 1 : 0;
      this.player.mass = TIERS[t].massToReach;
      this.player.tierIdx = t;
      this.player.hp = this.player.maxHp;
      this.player.applyScale();
      this.fx.level = t;
      this.cameras.main.setZoom(TIERS[t].zoom);
      this.maxTierReached = t + 1;
    }
    const cam = this.cameras.main;
    cam.startFollow(this.player, false, 0.08, 0.08);
    cam.zoomTo(TIERS[this.player.tierIdx].zoom, 1100, 'Sine.easeInOut');
    this.phase = 'playing';
    duckMusic(false);
    music.play(`tier${this.tier}` as 'tier1');
    this.startWave();
  }

  private startWave() {
    this.waveTime = 0;
    this.soldierAcc = 0;
    this.tankAcc = 0;
    this.stats.startWave();
    const w = this.wave;
    this.bossSpawnAt = w.boss ? 4 : -1;
    const sub = t((['wave1', 'wave2', 'wave3', 'wave4', 'wave5'] as const)[this.waveIdx]);
    this.ui.banner(t('waveTitle', { n: w.wave }), sub);
  }

  pauseGame() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.player.setVelocity(0, 0);
    this.scene.pause();
    duckMusic(true);
  }

  resumeGame() {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.scene.resume();
    duckMusic(false);
  }

  private recordBest(outcome: RunStats['outcome']) {
    if (outcome === 'wave-cleared') return;
    recordBest({ wave: this.wave.wave, buildings: this.stats.buildings, victory: outcome === 'victory' });
  }

  private endWave(outcome: RunStats['outcome']) {
    // Only one end-of-wave card at a time (e.g. dying during the mech's death sequence).
    if (this.phase !== 'playing' && this.phase !== 'dying') return;
    if (this.phase === 'dying' && outcome !== 'defeat') return;
    this.recordBest(outcome);
    duckMusic(true);
    if (outcome !== 'wave-cleared') music.play(outcome === 'victory' ? 'victory' : 'defeat');
    this.phase = outcome === 'wave-cleared' ? 'bulletin' : outcome === 'victory' ? 'victory' : 'gameover';
    if (outcome === 'wave-cleared') this.enemies.clearAll();
    this.player.setVelocity(0, 0);
    const snap = this.snapshot(outcome);
    this.lastStats = snap;
    this.scene.pause();
    this.ui.showNewsLoading(outcome);
    void this.news.take(snap).then((b) => {
      this.lastBulletin = b;
      this.bulletinsShown++;
      this.stats.previousHeadline = b.headline;
      sfx.news();
      this.ui.showBulletin(b, snap, () => this.afterBulletin(outcome));
    });
  }

  private afterBulletin(outcome: RunStats['outcome']) {
    if (outcome !== 'wave-cleared') {
      this.scene.restart();
      this.ui.reset();
      return;
    }
    this.waveIdx = Math.min(this.waveIdx + 1, WAVES.length - 1);
    this.phase = 'playing';
    this.scene.resume();
    duckMusic(false);
    this.startWave();
  }

  snapshot(outcome: RunStats['outcome']): RunStats {
    const p = this.player;
    return this.stats.snapshot({
      wave: this.wave.wave, tier: this.tier, level: p.level, district: districtAt(p.x, p.y), hpPct: (p.hp / p.maxHp) * 100, outcome,
    });
  }

  // ── Main loop ──────────────────────────────────────────────────────────────
  update(_time: number, delta: number) {
    if (this.phase === 'title') {
      this.titleT += delta;
      const cam = this.cameras.main;
      cam.centerOn(WORLD_W / 2 + Math.sin(this.titleT / 21000) * 900, LAND_H - 700 + Math.sin(this.titleT / 13000) * 160);
      this.titleFx.forEach((f, i) => f.setRotation(-Math.PI / 2 + Math.sin(this.titleT / (2600 + i * 700) + i * 1.7) * 0.75));
      this.player?.syncDecor(this.gameTime);
      return;
    }
    if (this.phase !== 'playing') {
      this.player?.syncDecor(this.gameTime);
      return;
    }
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= delta;
      if (this.hitStopLeft <= 0) this.physics.resume();
      return;
    }
    const dt = Math.min(delta, 50) / 1000;
    this.gameTime += dt * 1000;
    this.stats.elapsed += dt;
    const p = this.player;

    // input
    const k = this.keys;
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    let stompPressed = Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.SHIFT);
    const pad = this.input.gamepad?.pad1;
    if (pad) {
      if (Math.abs(pad.leftStick.x) > 0.2 || Math.abs(pad.leftStick.y) > 0.2) { mx = pad.leftStick.x; my = pad.leftStick.y; }
      if (pad.left) mx = -1; if (pad.right) mx = 1; if (pad.up) my = -1; if (pad.down) my = 1;
      if (pad.A && !this.padA) stompPressed = true;
      this.padA = pad.A;
    }
    const len = Math.hypot(mx, my);
    const speed = p.tier.speed * p.mods.speed;
    if (len > 0.01) {
      p.setVelocity((mx / len) * speed * Math.min(1, len), (my / len) * speed * Math.min(1, len));
      p.facing.set(mx / len, my / len);
      if (Math.abs(mx) > 0.1) p.setFlipX(mx < 0);
      if (!p.anims.isPlaying && p.texture.key !== 'kaiju2') p.play('kaiju-walk');
      if (Math.random() < dt * 4 * p.tierIdx) this.fx.dust(p.x, p.y, 1);
    } else {
      p.setVelocity(0, 0);
    }
    if (stompPressed) this.weapons.stomp();
    p.stompCd = Math.max(0, p.stompCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    this.bumpCd -= dt;
    if (p.mods.regen) p.heal(p.mods.regen * dt);

    // crush everything small enough under our feet
    this.tmp.length = 0;
    for (const d of this.city.grid.query(p.x, p.y, p.radius, this.tmp)) {
      if (d.sizeClass <= this.tier && circleHits(d, p.x, p.y, p.radius)) this.destroyDestructible(d, true);
    }

    this.weapons.update(dt);
    this.enemies.update(dt);
    this.updatePickups(dt);
    this.updateDirector(dt);
    p.syncDecor(this.gameTime);
    this.stats.hp((p.hp / p.maxHp) * 100);
    // Teach the stomp: prompt when crowded until it has been used a few times, and nudge once if never used.
    let crowd = 0;
    const cr = 90 * p.scale;
    for (const e of this.enemies.list) if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < cr * cr) crowd++;
    this.stompHint =
      p.stompCd <= 0 && this.stats.stomps < 3 && crowd >= 4 ? 'stompPrompt' : p.stompCd <= 0 && this.stats.stomps === 0 && this.stats.elapsed > 15 ? 'stompTip' : null;

    if (p.hp <= 0) return this.die();
    if (this.pendingLevelUps > 0) this.openLevelUp();
  }

  private updateDirector(dt: number) {
    const w = this.wave;
    this.waveTime += dt;
    const tier = this.tier;
    // infantry: squads at higher tiers (none during the opening grace period of wave 1)
    if (!(this.waveIdx === 0 && this.waveTime < WAVE1_GRACE_S * TIME_SCALE)) this.soldierAcc += w.soldierRate * dt;
    const squad = tier === 3 ? 4 : tier === 2 ? 2 : 1;
    while (this.soldierAcc >= squad && this.enemies.count('soldier') < w.soldierMax) {
      this.soldierAcc -= squad;
      const lead = this.enemies.spawnOffscreen('soldier');
      for (let i = 1; i < squad; i++) this.enemies.spawn('soldier', lead.x + Phaser.Math.Between(-24, 24), lead.y + Phaser.Math.Between(-24, 24));
    }
    if (this.soldierAcc > squad * 2) this.soldierAcc = squad * 2;
    this.tankAcc += w.tankRate * (tier === 1 ? 0.6 : 1) * dt;
    while (this.tankAcc >= 1 && this.enemies.count('tank') < w.tankMax) {
      this.tankAcc -= 1;
      this.enemies.spawnOffscreen('tank');
    }
    if (this.tankAcc > 2) this.tankAcc = 2;

    if (w.boss) {
      if (this.bossSpawnAt >= 0 && this.waveTime >= this.bossSpawnAt) {
        this.bossSpawnAt = -1;
        this.enemies.spawnOffscreen('mech');
        this.ui.banner(t('warning'), t('mechInbound'), true);
        sfx.alarm();
        music.play('boss');
      }
      const b = this.enemies.boss;
      if (b && b.hp < b.maxHp * 0.35 && this.news.prefetchedFor !== w.wave) this.news.prefetch(this.snapshot('victory'));
    } else {
      const prefetchAt = Math.max(this.waveDuration * BULLETIN_MIN_FRACTION, this.waveDuration - BULLETIN_LEAD_S);
      if (this.waveTime >= prefetchAt && this.news.prefetchedFor !== w.wave)
        this.news.prefetch(this.snapshot('wave-cleared'));
      if (this.waveTime >= this.waveDuration) this.endWave('wave-cleared');
    }
  }

  // ── Level-ups ──────────────────────────────────────────────────────────────
  private gainXp(n: number) {
    const p = this.player;
    p.xp += n;
    let need = XP_TO_LEVEL(p.level);
    while (p.xp >= need) {
      p.xp -= need;
      p.level++;
      this.pendingLevelUps++;
      need = XP_TO_LEVEL(p.level);
    }
  }

  private openLevelUp() {
    this.phase = 'levelup';
    this.player.setVelocity(0, 0);
    this.offer = rollOffer(this.player.upgradeLevels, this.rand);
    this.levelUpsShown++;
    sfx.levelup();
    this.scene.pause();
    duckMusic(true);
    this.ui.showLevelUp(this.offer, this.player.upgradeLevels, (i) => this.pickUpgrade(i));
  }

  private pickUpgrade(i: number) {
    const u = this.offer[i];
    const p = this.player;
    if (u) {
      u.apply(p.mods, (n) => p.heal(n));
      p.upgradeLevels[u.id] = (p.upgradeLevels[u.id] ?? 0) + 1;
      this.stats.upgraded(u.name);
    }
    // Levelling up is the hatchling's only reliable heal, so it matters most in wave 1.
    p.heal(p.maxHp * 0.15);
    this.fx.word(p.x, p.y - 24 * p.scale, '+HP', '#ff6688', 1 + p.tierIdx * 0.6);
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    this.offer = [];
    this.phase = 'playing';
    this.scene.resume();
    duckMusic(false);
  }

  // ── Combat & destruction ───────────────────────────────────────────────────
  shake(intensity: number, ms: number) {
    const now = this.time.now;
    if (now > this.shakeUntil || intensity >= this.shakeI) {
      this.cameras.main.shake(ms, intensity, true);
      this.shakeUntil = now + ms;
      this.shakeI = intensity;
    }
  }

  hitStop(ms: number) {
    if (this.hitStopLeft > 0) {
      this.hitStopLeft = Math.max(this.hitStopLeft, ms);
      return;
    }
    this.hitStopLeft = ms;
    this.physics.pause();
  }

  hurtPlayer(dmg: number, _sx: number, _sy: number) {
    const p = this.player;
    if (p.invuln > 0 || this.phase !== 'playing') return;
    const real = dmg * (1 - p.mods.armor);
    p.hp -= real;
    this.damageTaken += real;
    p.invuln = 0.06;
    p.setTintFill(0xff5566);
    this.time.delayedCall(70, () => p.clearTint());
    this.shake(Math.min(0.012, 0.0015 * real), 120);
    if (real >= 8) this.hitStop(45);
    sfx.hurt();
    this.ui.hurtFlash(real / p.maxHp);
  }

  damageEnemy(e: Enemy, dmg: number, kx: number, ky: number) {
    if (e.dead) return;
    e.hp -= dmg;
    this.fx.hit(e.x, e.y, 3);
    e.setTintFill(0xffffff);
    this.time.delayedCall(50, () => e.active && e.clearTint());
    if (e.etype !== 'mech' && (kx || ky)) {
      e.setVelocity(kx, ky);
      e.stun = 0.14;
    }
    if (e.hp <= 0) this.killEnemy(e, false);
  }

  killEnemy(e: Enemy, crushed: boolean) {
    if (e.dead) return;
    const r = REWARDS[e.etype];
    if (e.etype === 'soldier') {
      this.stats.soldiers++;
      this.fx.squish(e.x, e.y);
      if (crushed) sfx.crunch();
    } else if (e.etype === 'tank') {
      this.stats.tanks++;
      this.fx.explode(e.x, e.y, 40);
      this.fx.word(e.x, e.y - 10, t('w_kaboom'), '#ffb13b', 1 + this.player.tierIdx * 0.6);
      this.shake(0.008, 160);
      this.hitStop(50);
      sfx.collapse(false);
      this.add.image(e.x, e.y, 'rubble').setScale(0.7).setDepth(-60).setTint(0x3a3a2a);
      if (Math.random() < 0.08) this.dropPickup(e.x, e.y, 'heart', 0);
    } else {
      this.stats.bossDefeated = true;
      this.bossDeath(e);
      return;
    }
    this.dropPickup(e.x, e.y, 'xp', r.xp);
    this.enemies.remove(e);
    if (this.player.addMass(r.mass)) this.onTierUp();
  }

  private bossDeath(e: Enemy) {
    e.dead = true;
    (e.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    e.telegraph?.clear();
    this.enemies.shots.clear(true, true);
    for (let i = 0; i < 9; i++) {
      this.time.delayedCall(i * 160, () => {
        this.fx.explode(e.x + Phaser.Math.Between(-60, 60), e.y - Phaser.Math.Between(0, 140), 90);
        this.shake(0.02, 200);
        sfx.collapse(true);
      });
    }
    this.fx.word(e.x, e.y - 160, t('w_mechDown'), '#ff5fd2', 4);
    this.time.delayedCall(1600, () => {
      if (this.phase !== 'playing') return;
      this.fx.ring(e.x, e.y, 500, 0xffffff, 700);
      const i = this.enemies.list.indexOf(e);
      if (i >= 0) this.enemies.list.splice(i, 1);
      this.enemies.boss = null;
      e.destroyAll();
      this.enemies.clearAll();
      this.endWave('victory');
    });
  }

  private onEnemyContact(e: Enemy) {
    if (e.dead) return;
    const p = this.player;
    if (e.sizeClass <= this.tier) {
      this.killEnemy(e, true);
      return;
    }
    if (e.contactCd > 0) return;
    e.contactCd = 0.7;
    if (e.etype === 'tank') {
      this.hurtPlayer(6, e.x, e.y);
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      this.damageEnemy(e, 18 * p.power, Math.cos(a) * 220, Math.sin(a) * 220);
    } else {
      this.hurtPlayer(12, e.x, e.y);
    }
  }

  private onBump(d: Destructible) {
    // Shoulder-charge buildings one size class above you.
    if (this.bumpCd > 0 || d.sizeClass > this.tier + 1) return;
    this.bumpCd = 0.35;
    this.damageDestructible(d, 10 * this.player.power);
  }

  damageDestructible(d: Destructible, dmg: number) {
    if (!d.alive || d.sizeClass > this.tier + 1) return;
    d.hp -= dmg;
    if (d.hp <= 0) return this.destroyDestructible(d, false);
    const now = this.gameTime;
    if (now - d.lastHit > 120) {
      d.lastHit = now;
      const f = d.hp / d.maxHp;
      const c = Math.round(120 + 135 * f);
      d.sprite.setTint(Phaser.Display.Color.GetColor(255, c, c));
      const ox = d.sprite.x;
      this.tweens.add({ targets: d.sprite, x: ox + 2, duration: 30, yoyo: true, repeat: 1, onComplete: () => d.sprite.setX(ox) });
      this.fx.hit(d.x, d.y, 2);
      if (Math.random() < 0.4) this.fx.dust(d.x, d.y + d.h / 3, 1);
    }
  }

  /** `credit=false` is collateral damage (the mech's footsteps): no stats, mass or drops for the player. */
  destroyDestructible(d: Destructible, crushed: boolean, credit = true) {
    if (!d.alive) return;
    d.alive = false;
    if (d.zone) {
      this.city.solids.remove(d.zone, true, true);
      d.zone = undefined;
    }
    if (credit) this.stats.destroyed(d.kind, d.district);
    const p = this.player;
    const small = d.kind === 'car' || d.kind === 'tree';
    const rew = small ? REWARDS.car : d.kind === 'tower' ? REWARDS.tower : REWARDS.house;
    if (small) {
      this.fx.collapse(d.x, d.y, 'small');
      if (d.kind === 'car') this.fx.hit(d.x, d.y, 4);
      sfx.crunch();
      d.sprite.destroy();
      this.city.leaveRubble(d);
      if (crushed && this.tier === 1) this.shake(0.002, 60);
      if (credit && d.kind === 'car' && Math.random() < 0.04) this.dropPickup(d.x, d.y, 'heart', 0);
    } else {
      const tower = d.kind === 'tower';
      this.fx.collapse(d.x, d.y, tower ? 'tower' : 'house');
      // Collateral (the mech's footsteps) gets the dust but not the player's hit-stop and impact words.
      this.shake(credit ? (tower ? 0.014 : 0.005) : 0.003, tower ? 260 : 120);
      if (credit) this.hitStop(tower ? 70 : 25);
      sfx.collapse(tower);
      if (credit && (tower || Math.random() < 0.25))
        this.fx.word(d.x, d.y - d.h, tower ? t(Phaser.Utils.Array.GetRandom(['w_tower1', 'w_tower2', 'w_tower3'] as const)) : t('w_crunch'), tower ? '#ff7a2a' : '#ffe14a', 1 + p.tierIdx * 0.7);
      const spr = d.sprite;
      spr.setTint(0x9090a0);
      this.tweens.add({
        targets: spr,
        scaleY: 0.15,
        scaleX: 1.08,
        angle: Phaser.Math.Between(-6, 6),
        duration: tower ? 420 : 240,
        ease: 'Quad.easeIn',
        onComplete: () => spr.destroy(),
      });
      this.city.leaveRubble(d);
      if (tower || d.kind === 'warehouse') this.fx.addFire(d.x, d.y - d.h * 0.2);
      if (!credit) return;
      if (p.mods.rampageHeal) p.heal(p.mods.rampageHeal);
      if (Math.random() < (tower ? 0.08 : 0.03)) this.dropPickup(d.x, d.y, 'heart', 0);
    }
    if (!credit) return;
    this.dropPickup(d.x, d.y, 'xp', rew.xp);
    if (p.addMass(rew.mass)) this.onTierUp();
  }

  private onTierUp() {
    const p = this.player;
    const t = p.tier;
    this.maxTierReached = Math.max(this.maxTierReached, t.tier);
    this.fx.level = p.tierIdx;
    this.cameras.main.zoomTo(t.zoom, 1400, 'Sine.easeInOut');
    this.ui.flashWhite();
    if (!this.enemies.boss) music.play(`tier${t.tier}` as 'tier1');
    this.hitStop(160);
    this.shake(0.02, 400);
    sfx.roar();
    p.anims.stop();
    p.setTexture('kaiju2');
    this.time.delayedCall(700, () => p.play('kaiju-walk', true));
    this.fx.ring(p.x, p.y, 120 * p.scale, 0x9ffcff, 700);
    this.fx.ring(p.x, p.y, 80 * p.scale, 0xffffff, 500);
    this.fx.dust(p.x, p.y, 20);
    // Growth shockwave flattens the neighbourhood.
    this.tmp.length = 0;
    for (const d of this.city.grid.query(p.x, p.y, 30 * p.scale, this.tmp)) if (d.sizeClass <= t.tier) this.destroyDestructible(d, true);
    this.ui.banner(tr('growth', { name: tierName(t.tier) }), tr(t.tier === 2 ? 'tierCopy2' : 'tierCopy3'));
  }

  private dropPickup(x: number, y: number, kind: Pickup['kind'], value: number) {
    if (kind === 'xp' && value <= 0) return;
    if (kind === 'xp' && this.pickups.length > 300) {
      this.gainXp(value);
      return;
    }
    const key = kind === 'heart' ? 'heart' : value >= 5 ? 'gemBig' : 'gem';
    const s = Math.max(1, this.player.scale * 0.6);
    const tx = x + Phaser.Math.Between(-10, 10) * s, ty = y + Phaser.Math.Between(-10, 10) * s;
    const img = this.add.image(x, y, key).setDepth(8000).setScale(s);
    this.tweens.add({ targets: img, x: tx, y: ty, duration: 250, ease: 'Quad.easeOut' });
    this.pickups.push({ img, kind, value, x: tx, y: ty, alive: true, settle: 0.25 });
  }

  private updatePickups(dt: number) {
    const p = this.player;
    const magnet = (40 + 14 * p.scale) * p.mods.magnet;
    const grab = p.radius + 6;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const g = this.pickups[i];
      if (g.settle > 0) {
        g.settle -= dt;
        continue;
      }
      const dx = p.x - g.img.x, dy = p.y - g.img.y;
      const d = Math.hypot(dx, dy);
      if (d < grab) {
        if (g.kind === 'xp') {
          this.gainXp(g.value);
          sfx.pickup();
        } else {
          p.heal(p.maxHp * 0.15);
          this.fx.word(p.x, p.y - 20 * p.scale, '+HP', '#ff6688', 1 + p.tierIdx * 0.6);
          sfx.levelup();
        }
        g.img.destroy();
        this.pickups.splice(i, 1);
      } else if (d < magnet) {
        const v = (260 + 60 * p.scale) * dt;
        g.img.x += (dx / d) * v;
        g.img.y += (dy / d) * v;
      }
    }
  }

  private die() {
    this.phase = 'dying';
    const p = this.player;
    p.setVelocity(0, 0);
    p.anims.stop();
    p.setTexture('kaiju2');
    sfx.roar();
    this.fx.explode(p.x, p.y, 60 * p.scale);
    this.tweens.add({ targets: p, angle: p.flipX ? -90 : 90, alpha: 0.6, duration: 900, ease: 'Bounce.easeOut' });
    this.shake(0.02, 500);
    this.time.delayedCall(1300, () => this.endWave('defeat'));
  }

  // ── Test/debug surface (read-only snapshot) ────────────────────────────────
  private exposeDebug() {
    const w = window as unknown as { __kaiju: unknown };
    w.__kaiju = {
      state: () => this.debugState(),
    };
  }

  debugState() {
    const p = this.player;
    const k = p.scale;
    const view = this.cameras.main.worldView;
    const near = (x: number, y: number, r: number) => (x - p.x) ** 2 + (y - p.y) ** 2 < r * r;
    const tmp: Destructible[] = [];
    this.city.grid.query(p.x, p.y, 420 * Math.max(1, k * 0.6), tmp);
    return {
      phase: this.phase,
      modal: this.ui.currentModal,
      wave: this.wave.wave,
      waveTime: this.waveTime,
      elapsed: this.stats.elapsed,
      waveDuration: this.wave.boss ? null : this.waveDuration,
      tier: this.tier,
      maxTierReached: this.maxTierReached,
      level: p.level,
      hp: p.hp,
      maxHp: p.maxHp,
      mass: p.mass,
      growth: p.growth,
      stompReady: p.stompCd <= 0,
      player: { x: p.x, y: p.y, r: p.radius, scale: k },
      view: { x: view.x, y: view.y, w: view.width, h: view.height },
      world: { w: WORLD_W, h: LAND_H },
      enemies: this.enemies.list.filter((e) => near(e.x, e.y, 700 * Math.max(1, k * 0.5))).map((e) => ({ type: e.etype, x: e.x, y: e.y, hp: e.hp })),
      enemyTypesSpawned: [...this.enemies.spawnedTypes],
      enemyRoster: ENEMY_ROSTER,
      pickups: this.pickups.filter((g) => near(g.img.x, g.img.y, 500)).map((g) => ({ x: g.img.x, y: g.img.y, kind: g.kind })),
      shots: (this.enemies.shots.getChildren() as Phaser.Physics.Arcade.Image[])
        .filter((o) => o.active && near(o.x, o.y, 600 * Math.max(1, k * 0.5)))
        .map((o) => ({ x: o.x, y: o.y, vx: (o.body as Phaser.Physics.Arcade.Body).velocity.x, vy: (o.body as Phaser.Physics.Arcade.Body).velocity.y })),
      targets: tmp.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h, kind: d.kind, sizeClass: d.sizeClass })),
      offer: this.offer.map((u) => ({ id: u.id, name: u.name })),
      upgradePoolSize: UPGRADES.length,
      upgradeLevels: { ...p.upgradeLevels },
      pendingLevelUps: this.pendingLevelUps,
      levelUpsShown: this.levelUpsShown,
      bulletinsShown: this.bulletinsShown,
      lastBulletin: this.lastBulletin,
      narrationMode: this.news.mode,
      damageTaken: Math.round(this.damageTaken),
      fps: Math.round(this.game.loop.actualFps),
      stats: this.lastStats,
      destroyed: this.stats.buildings,
    };
  }
}
