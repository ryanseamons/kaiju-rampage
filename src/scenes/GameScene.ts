import Phaser from 'phaser';
import { DAILY, LAND_H, REWARDS, SEED, START_WAVE, TIERS, WAVES, WORLD_H, WORLD_W, XP_TO_LEVEL, waveDmgMult, waveHpMult } from '../config';
import { City, LANDMARK, LANDMARK_NEWS, circleHits, districtAt, type Destructible } from '../city';
import { Kaiju } from '../player';
import { Enemy, EnemyManager, ENEMY_ROSTER, isBoss, isHeavy, type EnemyType } from '../enemies';
import { Weapons } from '../weapons';
import { Fx } from '../fx';
import { RunTracker } from '../stats';
import { NewsDesk } from '../news';
import { EVOLUTIONS, UPGRADES, readyEvolution, rollOffer, type UpgradeDef } from '../upgrades';
import { mulberry32 } from '../rng';
import { sfx } from '../sfx';
import { music } from '../audio/music';
import { difficulty, type DifficultyDef, type DifficultyId } from '../difficulty';
import { duckMusic } from '../audio/core';
import { evoName, t, t as tr, tierName, upName } from '../i18n';
import type { Bulletin, RunStats, Tier } from '../shared/narration';
import type { UIScene } from './UIScene';
import { Director } from '../director';
import { Pickups, type PickupKind } from '../pickups';
import { Score } from '../score';
import { NavField } from '../nav';
import { gradeFor, qualifies } from '../scores';
import { rng } from '../rand';
import { BOSS_PARAM, THREAT_PARAM, dailyConfig, markRanked, rankedUsed, type BossId, type DailyConfig, type ThreatId } from '../daily';
import { TWIST_PARAM, Twists } from '../twists';
import { Weather } from '../weather';
import { STAGE_DEF } from '../stages';
import { dailyDesc, dailyName } from '../i18n';

export type Phase = 'title' | 'playing' | 'paused' | 'levelup' | 'bulletin' | 'dying' | 'gameover' | 'victory' | 'results';

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SPACE' | 'SHIFT', Phaser.Input.Keyboard.Key>;

export interface RunSummary {
  outcome: 'victory' | 'defeat';
  endless: boolean;
  score: number;
  grade: string;
  rank: number;
  wave: number;
  seconds: number;
  buildings: number;
  kills: number;
  bestCombo: number;
  level: number;
  tier: number;
  evolutions: string[];
  daily: string | null;
  difficulty: DifficultyId;
  /** Daily runs: the first of the day is ranked; later ones are practice. */
  ranked: boolean;
  dailyNumber: number | null;
  stage: string;
}

/** Set by the results screen's "New run": the restarted scene skips the title and starts a run. */
let quickStart = false;

export class GameScene extends Phaser.Scene {
  city!: City;
  player!: Kaiju;
  enemies!: EnemyManager;
  weapons!: Weapons;
  fx!: Fx;
  ui!: UIScene;
  director!: Director;
  pickups!: Pickups;
  nav!: NavField;
  private navT = 0;
  score = new Score();
  private stride = 0;
  private extrasCache?: { fuel: number; stalls: number; cranes: number };
  netImg?: Phaser.GameObjects.Image;
  /** False for daily practice runs (the day's ranked run is already done). */
  ranked = true;
  /** Today's twists (or `?twist=` for testing). */
  twists: Twists = new Twists(this, []);
  /** Today's featured threat (or `?threat=`). */
  threat: ThreatId | null = null;
  /** Today's final boss (or `?boss=`); the flagship mech otherwise. */
  get bossId(): BossId {
    return this.dailyCfg?.boss ?? BOSS_PARAM ?? 'guardian';
  }
  get bossType(): EnemyType {
    return this.bossId === 'guardian' ? 'mech' : this.bossId;
  }
  private weather?: Weather;
  /** Today's daily content, or null outside the daily. */
  readonly dailyCfg: DailyConfig | null = DAILY ? dailyConfig(DAILY) : null;
  private stepT = new WeakMap<Enemy, number>();
  private peekAt: { x: number; y: number } | null = null;
  /** Landmarks flattened this run, in order. */
  landmarksDown: string[] = [];
  diff: DifficultyDef = difficulty();
  stats = new RunTracker();
  news = new NewsDesk();
  phase: Phase = 'title';
  gameTime = 0;
  waveIdx = 0;
  endless = false;
  maxTierReached = 1;
  bulletinsShown = 0;
  lastBulletin: Bulletin | null = null;
  lastStats: RunStats | null = null;
  offer: UpgradeDef[] = [];
  pendingLevelUps = 0;
  levelUpsShown = 0;
  rerolls = 2;
  cratesOpened = 0;
  /** Real damage taken this run (after armor); a test guard that enemies still have teeth. */
  damageTaken = 0;
  /** Which stomp hint the HUD should show right now (i18n key), if any. */
  stompHint: 'stompPrompt' | 'stompTip' | null = null;
  lastSummary: RunSummary | null = null;
  private keys!: Keys;
  private rand = mulberry32(SEED ^ 0x9e3779b9);
  private hitStopLeft = 0;
  private shakeUntil = 0;
  private shakeI = 0;
  private padA = false;
  private tmp: Destructible[] = [];
  private bumpCd = 0;
  private titleFx: Phaser.GameObjects.Image[] = [];
  private titleT = 0;
  private lastComboSfx = 0;

  constructor() {
    super('Game');
  }

  get tier(): Tier {
    return this.player.tier.tier;
  }
  get wave() {
    return this.director.wave;
  }
  get waveDuration() {
    return this.director.duration;
  }
  get waveTime() {
    return this.director.time;
  }

  create() {
    this.stats = new RunTracker();
    this.news = new NewsDesk();
    this.score = new Score();
    this.landmarksDown = [];
    this.phase = 'title';
    this.gameTime = 0;
    this.waveIdx = 0;
    this.endless = false;
    this.pendingLevelUps = 0;
    this.maxTierReached = 1;
    this.bulletinsShown = 0;
    this.levelUpsShown = 0;
    this.rerolls = 2;
    this.cratesOpened = 0;
    this.damageTaken = 0;
    this.lastBulletin = null;
    this.lastSummary = null;

    this.physics.world.setBounds(0, 0, WORLD_W, LAND_H - 6);
    this.city = new City(this, SEED);
    this.city.build();
    this.nav = new NavField(this.city);
    this.fx = new Fx(this);
    this.player = new Kaiju(this, WORLD_W / 2, LAND_H - 70);
    this.enemies = new EnemyManager(this);
    this.weapons = new Weapons(this);
    this.pickups = new Pickups(this);
    this.director = new Director(this);
    this.director.start(1);

    this.physics.add.collider(
      this.player,
      this.city.solids,
      (_p, z) => this.onBump((z as Phaser.GameObjects.Zone).getData('d') as Destructible),
      (_p, z) => {
        const d = (z as Phaser.GameObjects.Zone).getData('d') as Destructible;
        return d.alive && d.sizeClass > this.tier;
      },
    );
    // Infantry and vehicles go around buildings; helicopters fly over; mechs walk through (and flatten) them.
    this.physics.add.collider(this.enemies.group, this.city.solids, undefined, (e, z) => {
      const d = (z as Phaser.GameObjects.Zone).getData('d') as Destructible;
      const en = e as Enemy;
      return d.alive && !en.flying && !isHeavy(en);
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
    cam.setBackgroundColor(STAGE_DEF.bg);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT') as Keys;
    this.ui = this.scene.get('UI') as UIScene;
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.input.keyboard?.resetKeys());

    this.exposeDebug();
    this.ui.onGameReady(this);
  }

  /** True once, on the scene restart after the results screen's "New run". */
  takeQuickStart() {
    const q = quickStart;
    quickStart = false;
    return q;
  }

  // ── Run flow ───────────────────────────────────────────────────────────────
  startRun() {
    if (this.phase !== 'title') return;
    this.diff = difficulty();
    this.score.diffMult = this.diff.score;
    // Same seed, same city, army, drops and offers: the daily rampage is the same run for everyone.
    rng.sowAll(SEED);
    // The day's first daily run is the ranked one; mark it at the start so restarting can't fish for a better one.
    this.ranked = !DAILY || !rankedUsed(DAILY);
    if (DAILY && this.ranked) markRanked(DAILY);
    this.rand = mulberry32(SEED ^ 0x9e3779b9);
    for (const f of this.titleFx) f.destroy();
    this.titleFx = [];
    sfx.unlock();
    this.twists = new Twists(this, this.dailyCfg?.twists ?? TWIST_PARAM);
    this.threat = this.dailyCfg?.threat ?? THREAT_PARAM;
    // Giant from the Start: begin at wave 3 at Behemoth size, with three mutations to choose.
    const startWave = this.twists.has('giant') && START_WAVE < 3 ? 3 : START_WAVE;
    this.waveIdx = startWave - 1;
    sfx.setTier(startWave >= 4 ? 2 : startWave >= 2 ? 1 : 0);
    if (startWave > 1) {
      const ti = startWave >= 4 ? 2 : startWave >= 2 ? 1 : 0;
      this.player.mass = TIERS[ti].massToReach;
      this.player.tierIdx = ti;
      this.player.hp = this.player.maxHp;
      this.player.applyScale();
      this.fx.level = ti;
      this.maxTierReached = ti + 1;
    }
    const cam = this.cameras.main;
    cam.startFollow(this.player, false, 0.08, 0.08);
    cam.zoomTo(TIERS[this.player.tierIdx].zoom, 1100, 'Sine.easeInOut');
    this.phase = 'playing';
    duckMusic(false);
    music.play(`tier${this.tier}` as 'tier1');
    this.startWave();
    this.twists.start();
    this.netImg = this.add.image(0, 0, 'net').setVisible(false);
    this.weather = new Weather(this);
    if (this.twists.has('giant')) this.pendingLevelUps += 3;
    // Announce the day's twists after the wave banner.
    [...this.twists.on].forEach((id, i) => this.time.delayedCall(2600 + i * 2400, () => this.ui.banner(`${t('dailyTwist').toUpperCase()}: ${dailyName('twist', id)}`, dailyDesc('twist', id), true)));
    const threat = this.threat;
    if (threat) this.time.delayedCall(2600 + this.twists.on.size * 2400, () => this.ui.banner(`${t('dailyThreat').toUpperCase()}: ${dailyName('threat', threat)}`, dailyDesc('threat', threat), true));
  }

  private startWave() {
    const n = this.waveIdx + 1;
    this.enemies.hpMult = waveHpMult(n) * this.diff.hp;
    this.enemies.dmgMult = waveDmgMult(n) * this.diff.dmg;
    this.director.start(n);
    this.stats.startWave();
    const sub = n <= WAVES.length ? t((['wave1', 'wave2', 'wave3', 'wave4', 'wave5'] as const)[n - 1]) : t('waveEndlessSub');
    this.ui.banner(n <= WAVES.length ? t('waveTitle', { n }) : t('waveEndless', { n }), sub);
    sfx.waveStart();
  }

  pauseGame() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    sfx.setRotor(0);
    this.player.setVelocity(0, 0);
    this.scene.pause();
    duckMusic(true);
  }

  /** From the pause menu, after confirming: abandon the run (unscored) and go back to the title. */
  exitToTitle() {
    if (this.phase !== 'paused') return;
    duckMusic(false);
    this.scene.restart();
    this.ui.reset();
  }

  resumeGame() {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.scene.resume();
    duckMusic(false);
  }

  endWave(outcome: RunStats['outcome']) {
    // Only one end-of-wave card at a time (e.g. dying during the mech's death sequence).
    if (this.phase !== 'playing' && this.phase !== 'dying') return;
    if (this.phase === 'dying' && outcome !== 'defeat') return;
    // Between waves the news card sits over the stage music; the victory and defeat songs play out in full.
    duckMusic(outcome === 'wave-cleared');
    if (outcome === 'wave-cleared') this.score.bonus(1000 * this.wave.wave);
    if (outcome === 'victory') this.score.bonus(25_000 + Math.max(0, 900 - this.stats.elapsed) * 20);
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
    if (outcome !== 'wave-cleared') return this.showResults(outcome);
    this.waveIdx++;
    this.phase = 'playing';
    this.scene.resume();
    duckMusic(false);
    if (!this.enemies.boss) music.play(`tier${this.tier}` as 'tier1');
    this.startWave();
  }

  private showResults(outcome: 'victory' | 'defeat') {
    this.phase = 'results';
    const kills = this.stats.soldiers + this.stats.tanks + this.stats.helis + this.stats.cannons + this.stats.walkers + (this.stats.bossDefeated ? 1 : 0);
    const summary: RunSummary = {
      outcome, endless: this.endless, score: this.score.score, grade: gradeFor(this.score.score, outcome === 'victory' || this.endless),
      rank: this.ranked ? qualifies(this.score.score) : 0, wave: this.wave.wave, seconds: Math.round(this.stats.elapsed), buildings: this.stats.buildings, kills,
      bestCombo: this.score.bestCombo, level: this.player.level, tier: this.maxTierReached, evolutions: this.stats.evolutions, daily: DAILY,
      difficulty: this.diff.id,
      ranked: this.ranked,
      dailyNumber: this.dailyCfg?.number ?? null,
      stage: this.dailyCfg?.stage ?? 'bay',
    };
    this.lastSummary = summary;
    this.ui.showResults(summary, (choice) => {
      if (choice === 'endless') return this.continueEndless();
      // A new run rebuilds the scene and starts straight away; 'title' stops at the front page.
      quickStart = choice === 'new';
      this.scene.restart();
      this.ui.reset();
    });
  }

  /** After beating the mech: keep going with ever-larger waves for score. */
  private continueEndless() {
    this.endless = true;
    this.waveIdx = WAVES.length; // wave 6
    this.enemies.clearAll();
    this.phase = 'playing';
    this.scene.resume();
    duckMusic(false);
    music.play('tier3');
    this.startWave();
    this.ui.banner(t('endlessTitle'), t('endlessSub'), true);
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
      if (this.peekAt) {
        cam.centerOn(this.peekAt.x, this.peekAt.y);
        this.player?.syncDecor(this.gameTime);
        this.city.cull(cam.worldView, delta / 1000);
        return;
      }
      cam.centerOn(WORLD_W / 2 + Math.sin(this.titleT / 21000) * 900, LAND_H - 700 + Math.sin(this.titleT / 13000) * 160);
      this.titleFx.forEach((f, i) => f.setRotation(-Math.PI / 2 + Math.sin(this.titleT / (2600 + i * 700) + i * 1.7) * 0.75));
      this.player?.syncDecor(this.gameTime);
      this.city.cull(cam.worldView, delta / 1000);
      return;
    }
    if (this.phase !== 'playing') {
      this.player?.syncDecor(this.gameTime);
      sfx.setRotor(0);
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
    const touch = this.ui.touch;
    if (touch.move.lengthSq() > 0) {
      mx = touch.move.x;
      my = touch.move.y;
    }
    if (touch.takeStomp()) stompPressed = true;
    const len = Math.hypot(mx, my);
    p.slowT = Math.max(0, p.slowT - dt);
    p.netT = Math.max(0, p.netT - dt);
    // Frozen: slower and icy blue. Netted: barely moving (mashing keys still inches you along).
    const speed = p.tier.speed * p.mods.speed * (p.mods.rage > 0 ? 1.3 : 1) * (p.slowT > 0 ? 0.55 : 1) * (p.netT > 0 ? 0.12 : 1);
    if (p.slowT > 0 && !p.isTinted) p.setTint(0x9fe8ff);
    else if (p.slowT <= 0 && p.netT <= 0 && p.tintTopLeft === 0x9fe8ff) p.clearTint();
    this.netImg?.setVisible(p.netT > 0).setPosition(p.x, p.y - 8 * p.scale).setScale(p.scale * 1.2).setDepth(p.depth + 1);
    if (len > 0.01) {
      p.setVelocity((mx / len) * speed * Math.min(1, len), (my / len) * speed * Math.min(1, len));
      p.facing.set(mx / len, my / len);
      if (Math.abs(mx) > 0.1) p.setFlipX(mx < 0);
      if (!p.anims.isPlaying && p.texture.key !== 'kaiju2') p.play('kaiju-walk');
      if (Math.random() < dt * 4 * p.tierIdx) this.fx.dust(p.x, p.y, 1);
      // Footfalls: slower and heavier as the kaiju grows; at tier 3 the ground shakes.
      this.stride += dt * Math.min(1, len) * (p.mods.rage > 0 ? 1.3 : 1);
      const period = [0.3, 0.44, 0.58][p.tierIdx];
      if (this.stride >= period) {
        this.stride -= period;
        sfx.step();
        if (p.tierIdx === 2) {
          this.shake(0.0025, 90);
          this.fx.dust(p.x, p.y, 3);
        }
      }
    } else {
      p.setVelocity(0, 0);
    }
    if (stompPressed) this.weapons.stomp();
    p.stompCd = Math.max(0, p.stompCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.mods.rage > 0) {
      p.mods.rage = Math.max(0, p.mods.rage - dt);
      if (Math.random() < dt * 10) this.fx.hit(p.x + Phaser.Math.Between(-10, 10) * p.scale, p.y - 8 * p.scale, 1);
    }
    this.bumpCd -= dt;
    if (p.mods.regen) p.heal(p.mods.regen * dt);

    // crush everything small enough under our feet
    this.tmp.length = 0;
    for (const d of this.city.grid.query(p.x, p.y, p.radius, this.tmp)) {
      if (d.sizeClass <= this.tier && circleHits(d, p.x, p.y, p.radius)) this.destroyDestructible(d, true);
    }

    this.navT -= dt;
    if (this.navT <= 0) {
      this.navT = 0.35;
      this.nav.update(p.x, p.y);
    }
    this.weapons.update(dt);
    this.enemies.update(dt);
    this.twists.update(dt);
    this.city.cull(this.cameras.main.worldView, dt);
    this.weather?.update(dt);
    this.ambientSounds(dt);
    this.pickups.update(dt);
    this.director.update(dt);
    this.score.update(dt);
    p.syncDecor(this.gameTime);
    this.stats.hp((p.hp / p.maxHp) * 100);
    // Teach the stomp: prompt when crowded until it has been used a few times, and nudge once if never used.
    let crowd = 0;
    const cr = 90 * p.scale;
    for (const e of this.enemies.list) if (!e.flying && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < cr * cr) crowd++;
    this.stompHint =
      p.stompCd <= 0 && this.stats.stomps < 3 && crowd >= 4 ? 'stompPrompt' : p.stompCd <= 0 && this.stats.stomps === 0 && this.stats.elapsed > 15 ? 'stompTip' : null;

    if (p.hp <= 0) return this.die();
    if (this.pendingLevelUps > 0) this.openLevelUp();
  }

  // ── Level-ups ──────────────────────────────────────────────────────────────
  gainXp(n: number) {
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
    this.showOffer();
  }

  private showOffer() {
    this.ui.showLevelUp(this.offer, this.player.upgradeLevels, (i) => this.pickUpgrade(i), {
      rerolls: this.rerolls,
      reroll: () => {
        if (this.rerolls <= 0) return;
        this.rerolls--;
        this.offer = rollOffer(this.player.upgradeLevels, this.rand);
        this.showOffer();
      },
      skip: () => this.pickUpgrade(-1),
    });
  }

  /** i = -1 skips the offer for a bigger heal. */
  private pickUpgrade(i: number) {
    const u = i >= 0 ? this.offer[i] : undefined;
    const p = this.player;
    if (u) {
      u.apply(p.mods, (n) => p.heal(n));
      p.upgradeLevels[u.id] = (p.upgradeLevels[u.id] ?? 0) + 1;
      this.stats.upgraded(u.name);
    }
    // Levelling up is the hatchling's only reliable heal, so it matters most in wave 1.
    p.heal(p.maxHp * (u ? 0.15 : 0.25) * this.diff.heal * this.twists.heal(1));
    this.fx.word(p.x, p.y - 24 * p.scale, '+HP', '#ff6688', 1 + p.tierIdx * 0.6);
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    this.offer = [];
    this.phase = 'playing';
    this.scene.resume();
    duckMusic(false);
  }

  // ── Crates & items ─────────────────────────────────────────────────────────
  openCrate() {
    const p = this.player;
    this.cratesOpened++;
    this.score.bonus(500);
    const evo = readyEvolution(p.upgradeLevels, p.mods);
    if (evo) {
      p.mods.evo[evo.id] = true;
      this.stats.evolutions.push(evoName(evo.id));
      this.stats.upgraded(evoName(evo.id));
      this.ui.flashWhite();
      this.hitStop(220);
      this.shake(0.02, 400);
      this.fx.ring(p.x, p.y, 160 * p.scale, 0xffd24a, 800);
      this.fx.ring(p.x, p.y, 100 * p.scale, 0xff5fd2, 600);
      sfx.evolve();
      this.ui.banner(t('evolution'), evoName(evo.id), false);
      return;
    }
    const [u] = rollOffer(p.upgradeLevels, this.rand, 1);
    sfx.crate();
    this.fx.ring(p.x, p.y, 80 * p.scale, 0xffd24a, 500);
    if (u) {
      u.apply(p.mods, (n) => p.heal(n));
      p.upgradeLevels[u.id] = (p.upgradeLevels[u.id] ?? 0) + 1;
      this.stats.upgraded(u.name);
      this.ui.banner(t('crate'), `${upName(u.id)} +1`);
    } else {
      p.heal(p.maxHp * 0.5);
      this.score.bonus(2000);
      this.ui.banner(t('crate'), t('crateMaxed'));
    }
  }

  useItem(kind: Exclude<PickupKind, 'xp' | 'heart' | 'crate'>) {
    const p = this.player;
    sfx.item();
    if (kind === 'magnet') {
      this.pickups.vacuum = 2.5;
      this.fx.word(p.x, p.y - 26 * p.scale, t('itemMagnet'), '#ff6688', 1.2 + p.tierIdx * 0.6);
    } else if (kind === 'rage') {
      p.mods.rage = 10;
      this.fx.word(p.x, p.y - 26 * p.scale, t('itemRage'), '#ff3355', 1.2 + p.tierIdx * 0.6);
      sfx.roar();
    } else {
      // Quake core: flatten every enemy on screen (the boss just takes a big hit).
      const v = this.cameras.main.worldView;
      this.ui.flashWhite();
      this.shake(0.03, 600);
      this.hitStop(160);
      sfx.stomp();
      this.fx.ring(p.x, p.y, Math.max(v.width, v.height) * 0.7, 0xffb13b, 900);
      this.fx.word(p.x, p.y - 26 * p.scale, t('itemQuake'), '#ffb13b', 1.4 + p.tierIdx * 0.7);
      for (const e of [...this.enemies.list]) {
        if (!v.contains(e.x, e.y)) continue;
        if (isHeavy(e)) this.damageEnemy(e, e.maxHp * (isBoss(e) ? 0.08 : 0.3), 0, 0);
        else this.killEnemy(e, false);
      }
    }
  }

  private maybeDropItem(x: number, y: number, chance: number) {
    if (rng.drop.frac() >= chance) return;
    this.pickups.drop(x, y, rng.drop.pick(['magnet', 'magnet', 'quake', 'rage'] as const));
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
    // Tier 3 outgrows most of the army; harder settings keep what's left dangerous.
    const real = this.twists.taken(dmg * (1 - p.mods.armor) * (this.tier === 3 ? this.diff.tier3Dmg : 1));
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
    if (e.dead || e.submerged) return;
    dmg = this.twists.dealt(dmg);
    e.hp -= dmg;
    this.fx.hit(e.x, e.y, 3);
    e.setTintFill(0xffffff);
    this.time.delayedCall(50, () => {
      if (!e.active) return;
      e.clearTint();
      if (e.elite) e.setTint(0xffd24a);
      else if (e.etype === 'walker') e.setTint(0x9aa66a);
    });
    if (!isHeavy(e) && !e.flying && (kx || ky)) {
      e.setVelocity(kx, ky);
      e.stun = 0.14;
    }
    if (e.hp <= 0) this.killEnemy(e, false);
    else sfx.hit(e.etype !== 'soldier' && e.etype !== 'rocket');
  }

  killEnemy(e: Enemy, crushed: boolean) {
    if (e.dead) return;
    const r = REWARDS[e.etype];
    const big = 1 + this.player.tierIdx * 0.6;
    switch (e.etype) {
      case 'soldier':
      case 'rocket':
      case 'riot':
      case 'drone':
        this.stats.soldiers++;
        this.fx.squish(e.x, e.y);
        if (crushed) sfx.crunch('soldier');
        else sfx.kill();
        break;
      case 'tank':
      case 'cannon':
      case 'maser':
      case 'freeze':
      case 'railgun':
      case 'sub':
        if (e.etype === 'tank' || e.etype === 'freeze' || e.etype === 'maser') this.stats.tanks++;
        else this.stats.cannons++;
        this.fx.explode(e.x, e.y, 40);
        this.fx.word(e.x, e.y - 10, t('w_kaboom'), '#ffb13b', big);
        this.shake(0.008, 160);
        this.hitStop(50);
        sfx.explode(false);
        this.add.image(e.x, e.y, 'rubble').setScale(0.7).setDepth(-60).setTint(0x3a3a2a);
        if (rng.drop.frac() < this.twists.heal(0.08 * this.diff.heal)) this.pickups.drop(e.x, e.y, 'heart');
        this.maybeDropItem(e.x, e.y, 0.04);
        break;
      case 'heli':
      case 'netheli':
        this.stats.helis++;
        this.fx.explode(e.x, e.y, 46);
        this.fx.explode(e.x + 10, e.y + 28, 30);
        this.fx.word(e.x, e.y - 14, t('w_kaboom'), '#ffb13b', big);
        this.shake(0.01, 180);
        this.hitStop(60);
        sfx.explode(false);
        this.add.image(e.x + 10, e.y + 28, 'rubble').setScale(0.9).setDepth(-60).setTint(0x3a3a2a);
        this.maybeDropItem(e.x, e.y + 28, 0.1);
        break;
      case 'walker':
        this.stats.walkers++;
        for (let i = 0; i < 5; i++) this.time.delayedCall(i * 120, () => this.fx.explode(e.x + Phaser.Math.Between(-40, 40), e.y - Phaser.Math.Between(0, 80), 70));
        this.fx.word(e.x, e.y - 110, t('w_mechDown'), '#ff5fd2', 3);
        this.shake(0.02, 400);
        this.hitStop(120);
        sfx.explode(true);
        this.pickups.drop(e.x, e.y, 'crate');
        break;
      case 'mech':
      case 'tetsuryu':
      case 'kumo':
      case 'hikari':
        this.stats.bossDefeated = true;
        this.score.add(r.score);
        this.bossDeath(e);
        return;
    }
    if (e.elite) this.pickups.drop(e.x, e.y, 'crate');
    this.score.add(r.score * (e.elite ? 5 : 1));
    this.comboSfx();
    this.pickups.drop(e.x, e.y, 'xp', r.xp * (e.elite ? 3 : 1));
    this.enemies.remove(e);
    if (this.player.addMass(r.mass)) this.onTierUp();
  }

  private comboSfx() {
    const c = this.score.combo;
    if (c >= 10 && c % 5 === 0 && c !== this.lastComboSfx) {
      this.lastComboSfx = c;
      sfx.combo(c);
    }
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
        sfx.explode(true);
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
      if (this.endless) {
        // Endless boss waves end when the mech falls; drop a crate as the reward.
        this.pickups.drop(e.x, e.y, 'crate');
        this.endWave('wave-cleared');
      } else {
        this.enemies.clearAll();
        this.endWave('victory');
      }
    });
  }

  private onEnemyContact(e: Enemy) {
    if (e.dead || e.flying) return;
    const p = this.player;
    if (e.sizeClass <= this.tier) {
      this.killEnemy(e, true);
      return;
    }
    if (e.contactCd > 0) return;
    e.contactCd = 0.7;
    if (e.etype === 'tank' || e.etype === 'cannon') {
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

  /** `fire`: Firestorm spreading, which ignores the size rule and the damage twist. */
  damageDestructible(d: Destructible, dmg: number, fire = false) {
    if (!d.alive || (!fire && d.sizeClass > this.tier + 1)) return;
    if (!fire) dmg = this.twists.dealt(dmg);
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
      sfx.buildingHit(d.kind === 'tower');
      if (Math.random() < 0.4) this.fx.dust(d.x, d.y + d.h / 3, 1);
    }
  }

  /** `credit=false` is collateral damage (the mech's footsteps, air strikes): no stats, mass or drops for the player. */
  destroyDestructible(d: Destructible, crushed: boolean, credit = true) {
    if (!d.alive) return;
    d.alive = false;
    if (d.zone) {
      this.city.solids.remove(d.zone, true, true);
      d.zone = undefined;
      this.nav.unblock(d);
    }
    if (credit) this.stats.destroyed(d.kind, d.district);
    this.twists.spread(d);
    if (d.fuel) this.fuelBlast(d);
    if (credit) {
      const eat = this.twists.eatHeal(d.kind, this.player.tierIdx);
      if (eat) this.player.heal(eat);
    }
    const p = this.player;
    const small = d.kind === 'car' || d.kind === 'tree';
    const rew = small ? REWARDS.car : d.kind === 'tower' ? REWARDS.tower : REWARDS.house;
    if (small) {
      this.fx.collapse(d.x, d.y, 'small');
      if (d.kind === 'car') this.fx.hit(d.x, d.y, 4);
      sfx.crunch(d.kind === 'tree' ? 'tree' : 'car');
      d.sprite.destroy();
      this.city.leaveRubble(d);
      if (crushed && this.tier === 1) this.shake(0.002, 60);
      if (credit && d.kind === 'car' && rng.drop.frac() < this.twists.heal(0.04 * this.diff.heal)) this.pickups.drop(d.x, d.y, 'heart');
    } else {
      const tower = d.kind === 'tower';
      this.fx.collapse(d.x, d.y, tower ? 'tower' : 'house');
      // Collateral gets the dust but not the player's hit-stop and impact words.
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
      if (rng.drop.frac() < this.twists.heal((tower ? 0.08 : 0.03) * this.diff.heal)) this.pickups.drop(d.x, d.y, 'heart');
      this.maybeDropItem(d.x, d.y, tower ? 0.03 : 0.004);
    }
    if (!credit) return;
    this.score.add(rew.score);
    this.comboSfx();
    this.pickups.drop(d.x, d.y, 'xp', rew.xp);
    let mass = rew.mass;
    if (d.landmark) {
      const lm = LANDMARK[d.landmark];
      mass += lm.mass;
      this.score.bonus(lm.score);
      this.landmarksDown.push(d.landmark);
      this.stats.landmarks.push(LANDMARK_NEWS[d.landmark]);
      const name = t(`lm_${d.landmark}` as 'lm_pagoda');
      this.fx.word(d.x, d.y - d.h * 1.6, `${name} +${Math.round(lm.score * this.score.diffMult).toLocaleString()}`, '#ffd24a', 1.4 + p.tierIdx * 0.7);
      if (d.landmark !== 'torii') {
        this.ui.banner(t('landmarkDown'), name, true);
        this.pickups.drop(d.x, d.y, 'xp', 12);
        this.time.delayedCall(250, () => sfx.roar());
      }
    }
    if (p.addMass(mass)) this.onTierUp();
  }

  /** Sounds that follow the world rather than events: helicopter rotors, mech and walker footfalls. */
  private ambientSounds(dt: number) {
    const p = this.player, view = this.cameras.main.worldView;
    const reach = Math.max(view.width, view.height) * 0.75;
    let rotor = 0;
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y);
      if (e.etype === 'heli') rotor = Math.max(rotor, 1 - d / reach);
      else if ((e.etype === 'mech' || e.etype === 'walker') && d < reach) {
        const body = e.body as Phaser.Physics.Arcade.Body | null;
        const moving = !!body && Math.hypot(body.velocity.x, body.velocity.y) > 8;
        const st = (this.stepT.get(e) ?? 0) + (moving ? dt : 0);
        if (st >= (e.etype === 'mech' ? 0.75 : 0.6)) {
          this.stepT.set(e, 0);
          sfx.mechStep(e.etype === 'mech');
          if (d < reach * 0.6) this.shake(e.etype === 'mech' ? 0.004 : 0.0025, 90);
        } else this.stepT.set(e, st);
      }
    }
    sfx.setRotor(rotor);
  }

  /** A fuel tank goes up: a big blast that hurts the army and sets off neighbouring tanks. */
  private fuelBlast(d: Destructible) {
    const R = 58;
    this.fx.explode(d.x, d.y - 10, 50);
    this.fx.addFire(d.x, d.y);
    sfx.explode(true);
    this.shake(0.01, 200);
    for (const e of [...this.enemies.list]) if (!e.dead && Phaser.Math.Distance.Between(e.x, e.y, d.x, d.y) < R) this.damageEnemy(e, 50, (e.x - d.x) * 2, (e.y - d.y) * 2);
    const near: Destructible[] = [];
    // Only touching tanks catch, and only sometimes; other buildings just get scorched.
    this.city.grid.query(d.x, d.y, R, near);
    for (const n of near)
      if (n.alive && n !== d && (!n.fuel || rng.world.frac() < 0.45)) this.time.delayedCall(n.fuel ? 260 : 120, () => this.damageDestructible(n, n.fuel ? 999 : 12, true));
  }

  private onTierUp() {
    sfx.setTier(this.player.tierIdx);
    const p = this.player;
    const td = p.tier;
    this.maxTierReached = Math.max(this.maxTierReached, td.tier);
    this.fx.level = p.tierIdx;
    this.cameras.main.zoomTo(td.zoom, 1400, 'Sine.easeInOut');
    this.ui.flashWhite();
    if (!this.enemies.boss) music.play(`tier${td.tier}` as 'tier1');
    this.hitStop(160);
    this.shake(0.02, 400);
    sfx.roar(true);
    p.anims.stop();
    p.setTexture('kaiju2');
    this.time.delayedCall(700, () => p.play('kaiju-walk', true));
    this.fx.ring(p.x, p.y, 120 * p.scale, 0x9ffcff, 700);
    this.fx.ring(p.x, p.y, 80 * p.scale, 0xffffff, 500);
    this.fx.dust(p.x, p.y, 20);
    // Growth shockwave flattens the neighbourhood.
    this.tmp.length = 0;
    for (const d of this.city.grid.query(p.x, p.y, 30 * p.scale, this.tmp)) if (d.sizeClass <= td.tier) this.destroyDestructible(d, true);
    this.ui.banner(tr('growth', { name: tierName(td.tier) }), tr(td.tier === 2 ? 'tierCopy2' : 'tierCopy3'));
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
    // Test hooks: deal a hit to the kaiju, and read a heart chance through the active twists.
    (window as unknown as { __kaijuDebug: unknown }).__kaijuDebug = {
      hurt: (n: number) => {
        this.player.invuln = 0;
        this.hurtPlayer(n, this.player.x, this.player.y);
      },
      heartChance: (base: number) => this.twists.heal(base),
      /** Perf probe: how many display objects the game scene is drawing, by type. */
      objects: () => {
        const by: Record<string, number> = {};
        for (const o of this.children.list) by[o.type] = (by[o.type] ?? 0) + 1;
        return { total: this.children.list.length, visible: this.children.list.filter((o) => (o as unknown as { visible: boolean }).visible).length, by, tweens: this.tweens.getTweens().length };
      },
      /** Perf probe: flatten n buildings at random (as a long run would). */
      flatten: (n: number) => {
        const live = this.city.all.filter((d) => d.alive && d.kind !== 'car' && d.kind !== 'tree');
        for (let i = 0; i < n && live.length; i++) this.destroyDestructible(live.splice(Math.floor(Math.random() * live.length), 1)[0], false, false);
      },
      /** Finish off the boss (tests the victory path for every boss). */
      killBoss: () => {
        const b = this.enemies.boss;
        if (b) this.damageEnemy(b, b.hp + 1, 0, 0);
      },
    };
    const w = window as unknown as { __kaiju: unknown };
    w.__kaiju = {
      state: () => this.debugState(),
      /** Title screen only: park the camera on a world point (for landmark screenshots). */
      peek: (x: number, y: number, zoom = 1) => {
        this.peekAt = { x, y };
        this.cameras.main.setZoom(zoom);
      },
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
      endless: this.endless,
      waveTime: this.waveTime,
      elapsed: this.stats.elapsed,
      waveDuration: this.wave.boss ? null : this.waveDuration,
      tier: this.tier,
      difficulty: this.diff.id,
      landmarks: this.city.landmarks.map((d) => ({ id: d.landmark, x: d.x, y: d.y, alive: d.alive })),
      landmarksDown: this.landmarksDown,
      maxTierReached: this.maxTierReached,
      level: p.level,
      hp: p.hp,
      maxHp: p.maxHp,
      mass: p.mass,
      growth: p.growth,
      stompReady: p.stompCd <= 0,
      rage: p.mods.rage,
      player: { x: p.x, y: p.y, r: p.radius, scale: k },
      view: { x: view.x, y: view.y, w: view.width, h: view.height },
      world: { w: WORLD_W, h: LAND_H },
      enemies: this.enemies.list.filter((e) => near(e.x, e.y, 700 * Math.max(1, k * 0.5))).map((e) => ({ type: e.etype, x: e.x, y: e.y, hp: e.hp, elite: e.elite, flying: e.flying })),
      enemyTypesSpawned: [...this.enemies.spawnedTypes],
      spawnLog: this.enemies.spawnLog,
      daily: this.dailyCfg,
      twists: [...this.twists.on],
      threat: this.threat,
      slowT: this.player.slowT,
      netT: this.player.netT,
      stage: STAGE_DEF.id,
      cityExtras: (this.extrasCache ??= { fuel: this.city.all.filter((d) => d.fuel).length, stalls: this.city.all.filter((d) => d.sprite.texture.key.startsWith('stall')).length, cranes: this.city.all.filter((d) => d.sprite.texture.key === 'crane').length }),
      darkness: !!this.children.getByName('darkness'),
      ranked: this.ranked,
      enemyRoster: [...ENEMY_ROSTER],
      jets: this.enemies.jets.map((j) => ({ x0: j.x0, y0: j.y0, x1: j.x1, y1: j.y1, t: j.t })),
      pickups: this.pickups.nearby(p.x, p.y, 500 * Math.max(1, k * 0.5)),
      shots: (this.enemies.shots.getChildren() as Phaser.Physics.Arcade.Image[])
        .filter((o) => o.active && near(o.x, o.y, 600 * Math.max(1, k * 0.5)))
        .map((o) => ({ x: o.x, y: o.y, vx: (o.body as Phaser.Physics.Arcade.Body).velocity.x, vy: (o.body as Phaser.Physics.Arcade.Body).velocity.y })),
      targets: tmp.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h, kind: d.kind, sizeClass: d.sizeClass })),
      offer: this.offer.map((u) => ({ id: u.id, name: u.name })),
      rerolls: this.rerolls,
      upgradePoolSize: UPGRADES.length,
      evolutionCount: EVOLUTIONS.length,
      upgradeLevels: { ...p.upgradeLevels },
      evolutions: Object.entries(p.mods.evo).filter(([, v]) => v).map(([k2]) => k2),
      cratesOpened: this.cratesOpened,
      pendingLevelUps: this.pendingLevelUps,
      levelUpsShown: this.levelUpsShown,
      bulletinsShown: this.bulletinsShown,
      lastBulletin: this.lastBulletin,
      narrationMode: this.news.mode,
      damageTaken: Math.round(this.damageTaken),
      score: this.score.score,
      combo: this.score.combo,
      bestCombo: this.score.bestCombo,
      summary: this.lastSummary,
      fps: Math.round(this.game.loop.actualFps),
      stats: this.lastStats,
      destroyed: this.stats.buildings,
    };
  }
}
