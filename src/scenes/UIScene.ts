// HUD + modal overlays (title, level-up, breaking-news card). Renders unzoomed on top of the game.
import Phaser from 'phaser';
import { TIERS, VIEW_H, VIEW_W, WAVES, XP_TO_LEVEL } from '../config';
import { districtAt } from '../city';
import { CHANNEL, DEFAULT_MODEL, KAIJU_NAME, TIER_FLAVOR, type Bulletin, type RunStats } from '../shared/narration';
import type { UpgradeDef } from '../upgrades';
import type { GameScene } from './GameScene';

const FONT = '"Courier New", Courier, monospace';
const txt = (size: number, color = '#ffffff', extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT, fontStyle: 'bold', fontSize: `${size}px`, color, stroke: '#05060d', strokeThickness: Math.max(2, Math.round(size / 6)), ...extra,
});

type Modal = null | 'title' | 'levelup' | 'loading' | 'bulletin';

const KIND_COLOR: Record<UpgradeDef['kind'], number> = { weapon: 0xff7a2a, body: 0x56c46a, stomp: 0x5ff6ff, growth: 0xff5fd2 };

export class UIScene extends Phaser.Scene {
  private gs!: GameScene;
  private modal: Modal = null;
  private modalRoot?: Phaser.GameObjects.Container;
  private modalOpenedAt = 0;
  private onPick?: (i: number) => void;
  private onContinue?: () => void;
  private sel = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private pad = { left: false, right: false, a: false };

  // HUD
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private growBar!: Phaser.GameObjects.Rectangle;
  private growText!: Phaser.GameObjects.Text;
  private xpBar!: Phaser.GameObjects.Rectangle;
  private lvText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private districtText!: Phaser.GameObjects.Text;
  private destroyedText!: Phaser.GameObjects.Text;
  private stompBar!: Phaser.GameObjects.Rectangle;
  private stompText!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;
  private bossRoot!: Phaser.GameObjects.Container;
  private bossBarFill!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Container;
  private hurt!: Phaser.GameObjects.Rectangle;
  private bannerRoot?: Phaser.GameObjects.Container;

  constructor() {
    super('UI');
  }

  create() {
    this.add.image(VIEW_W / 2, VIEW_H / 2, 'vignette').setDisplaySize(VIEW_W, VIEW_H).setAlpha(0.9);
    this.hurt = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0xff0022, 0).setDepth(5);
    this.buildHud();
    const kb = this.input.keyboard!;
    kb.on('keydown', (ev: KeyboardEvent) => this.onKey(ev.code));
  }

  get currentModal() {
    return this.modal;
  }

  onGameReady(gs: GameScene) {
    this.gs = gs;
    this.showTitle();
  }

  reset() {
    this.closeModal();
    this.bannerRoot?.destroy();
    this.bannerRoot = undefined;
  }

  // ── HUD ──────────────────────────────────────────────────────────────────
  private buildHud() {
    const c = (this.hud = this.add.container(0, 0).setDepth(10));
    const panel = this.add.rectangle(12, 12, 300, 66, 0x05060d, 0.55).setOrigin(0).setStrokeStyle(2, 0x2a2d42);
    const hpBg = this.add.rectangle(22, 22, 280, 16, 0x2a0a12).setOrigin(0);
    this.hpBar = this.add.rectangle(22, 22, 280, 16, 0xff3355).setOrigin(0);
    this.hpText = this.add.text(28, 21, '', txt(13));
    const gBg = this.add.rectangle(22, 46, 280, 10, 0x0a2a2e).setOrigin(0);
    this.growBar = this.add.rectangle(22, 46, 0, 10, 0x5ff6ff).setOrigin(0);
    this.growText = this.add.text(22, 58, '', txt(12, '#9ffcff'));
    this.waveText = this.add.text(VIEW_W / 2, 14, '', txt(24, '#ffe14a')).setOrigin(0.5, 0);
    this.timerText = this.add.text(VIEW_W / 2, 44, '', txt(16, '#ffffff')).setOrigin(0.5, 0);
    this.districtText = this.add.text(VIEW_W - 16, 14, '', txt(16, '#ffb0e8')).setOrigin(1, 0);
    this.destroyedText = this.add.text(VIEW_W - 16, 38, '', txt(14, '#ffffff')).setOrigin(1, 0);
    const xpBg = this.add.rectangle(0, VIEW_H - 10, VIEW_W, 10, 0x0a1a12).setOrigin(0);
    this.xpBar = this.add.rectangle(0, VIEW_H - 10, 0, 10, 0x4dffb0).setOrigin(0);
    this.lvText = this.add.text(VIEW_W / 2, VIEW_H - 14, '', txt(14, '#4dffb0')).setOrigin(0.5, 1);
    const sBg = this.add.rectangle(16, VIEW_H - 50, 170, 26, 0x05060d, 0.6).setOrigin(0).setStrokeStyle(2, 0x2a2d42);
    this.stompBar = this.add.rectangle(18, VIEW_H - 48, 166, 22, 0x2a6a8a).setOrigin(0);
    this.stompText = this.add.text(101, VIEW_H - 37, '', txt(13)).setOrigin(0.5);
    this.fpsText = this.add.text(VIEW_W - 10, VIEW_H - 14, '', txt(11, '#8888aa')).setOrigin(1, 1);
    const bossBg = this.add.rectangle(0, 0, 560, 16, 0x2a0a12).setStrokeStyle(2, 0xff3355);
    this.bossBarFill = this.add.rectangle(-278, 0, 556, 12, 0xff3355).setOrigin(0, 0.5);
    const bossLabel = this.add.text(0, -20, 'M-01 SHIOKAZE GUARDIAN', txt(14, '#ff8899')).setOrigin(0.5);
    this.bossRoot = this.add.container(VIEW_W / 2, 92, [bossBg, this.bossBarFill, bossLabel]).setVisible(false);
    c.add([panel, hpBg, this.hpBar, this.hpText, gBg, this.growBar, this.growText, this.waveText, this.timerText, this.districtText,
      this.destroyedText, xpBg, this.xpBar, this.lvText, sBg, this.stompBar, this.stompText, this.fpsText, this.bossRoot]);
    c.setVisible(false);
  }

  update() {
    this.pollPad();
    const gs = this.gs;
    if (!gs?.player) return;
    this.hud.setVisible(gs.phase !== 'title');
    const p = gs.player;
    const hpF = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    this.hpBar.width = 280 * hpF;
    this.hpBar.fillColor = hpF < 0.25 ? (Math.floor(this.time.now / 200) % 2 ? 0xff3355 : 0xffffff) : 0xff3355;
    this.hpText.setText(`HP ${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`);
    this.growBar.width = 280 * p.growth;
    const next = p.nextTier;
    this.growText.setText(next ? `${p.tier.name} ▸ ${next.name}  ${Math.floor(p.growth * 100)}%` : `${p.tier.name} — MAX SIZE`);
    const w = gs.wave;
    this.waveText.setText(`WAVE ${w.wave}/${WAVES.length}`);
    if (w.boss) this.timerText.setText(gs.enemies.boss ? 'DESTROY THE MECH' : 'SOMETHING IS COMING…');
    else {
      const left = Math.max(0, gs.waveDuration - gs.waveTime);
      this.timerText.setText(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} until the army regroups`);
    }
    this.districtText.setText(districtAt(p.x, p.y).toUpperCase());
    this.destroyedText.setText(`BUILDINGS FLATTENED: ${gs.stats.buildings}`);
    this.xpBar.width = VIEW_W * Phaser.Math.Clamp(p.xp / XP_TO_LEVEL(p.level), 0, 1);
    this.lvText.setText(`LV ${p.level}`);
    const ready = p.stompCd <= 0;
    this.stompBar.width = 166 * (ready ? 1 : 1 - p.stompCd / (5 * p.mods.stompCd));
    this.stompBar.fillColor = ready ? 0x5ff6ff : 0x2a4a5a;
    this.stompText.setText(ready ? '[SPACE] STOMP!' : 'STOMP…');
    this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
    const b = gs.enemies.boss;
    this.bossRoot.setVisible(!!b && !b.dead);
    if (b) this.bossBarFill.width = 556 * Phaser.Math.Clamp(b.hp / b.maxHp, 0, 1);
  }

  hurtFlash(frac: number) {
    this.hurt.setAlpha(Math.min(0.35, 0.08 + frac * 2));
    this.tweens.killTweensOf(this.hurt);
    this.tweens.add({ targets: this.hurt, alpha: 0, duration: 220 });
  }

  banner(title: string, sub: string, danger = false) {
    this.bannerRoot?.destroy();
    const bg = this.add.rectangle(0, 0, VIEW_W, 96, danger ? 0x3a0010 : 0x05060d, 0.78);
    const stripe = this.add.rectangle(0, -48, VIEW_W, 4, danger ? 0xff3355 : 0xffe14a);
    const stripe2 = this.add.rectangle(0, 48, VIEW_W, 4, danger ? 0xff3355 : 0xffe14a);
    const t = this.add.text(0, -16, title, txt(40, danger ? '#ff5577' : '#ffe14a')).setOrigin(0.5);
    const s = this.add.text(0, 24, sub, txt(18, '#ffffff')).setOrigin(0.5);
    const root = (this.bannerRoot = this.add.container(VIEW_W / 2, 210, [bg, stripe, stripe2, t, s]).setDepth(20));
    root.setScale(1, 0);
    this.tweens.add({ targets: root, scaleY: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: root, alpha: 0, delay: 2300, duration: 400,
      onComplete: () => { if (this.bannerRoot === root) this.bannerRoot = undefined; root.destroy(); },
    });
  }

  // ── Modals ───────────────────────────────────────────────────────────────
  private openModal(kind: Modal, children: Phaser.GameObjects.GameObject[]) {
    this.closeModal();
    this.modal = kind;
    this.modalOpenedAt = this.time.now;
    this.modalRoot = this.add.container(0, 0, children).setDepth(50);
  }

  private closeModal() {
    this.modalRoot?.destroy();
    this.modalRoot = undefined;
    this.modal = null;
    this.cards = [];
  }

  private showTitle() {
    const dim = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.55);
    const t = this.add.text(VIEW_W / 2, 170, 'KAIJU RAMPAGE', txt(84, '#5ff6ff', { strokeThickness: 10 })).setOrigin(0.5);
    const t2 = this.add.text(VIEW_W / 2, 250, `${KAIJU_NAME} vs. SHIOKAZE BAY · 5 WAVES · 3 SIZES`, txt(22, '#ffe14a')).setOrigin(0.5);
    const lines = [
      'WASD / ARROWS ...... move (gamepad: left stick)',
      'auto ............... claw swipe + unlocked weapons',
      'SPACE .............. STOMP shockwave (gamepad: A)',
      '1 / 2 / 3 .......... pick an upgrade on level-up',
      '',
      'Crush the city to GROW. Kill the military to LEVEL UP.',
      'Bigger kaiju crush bigger things: cars → houses → towers.',
    ];
    const body = this.add.text(VIEW_W / 2, 400, lines.join('\n'), txt(18, '#e8e8f0', { align: 'left', lineSpacing: 6 })).setOrigin(0.5);
    const go = this.add.text(VIEW_W / 2, 580, 'PRESS ENTER TO RAMPAGE', txt(30, '#ffffff')).setOrigin(0.5);
    this.tweens.add({ targets: go, alpha: 0.25, yoyo: true, repeat: -1, duration: 500 });
    this.openModal('title', [dim, t, t2, body, go]);
  }

  showLevelUp(offer: UpgradeDef[], levels: Record<string, number>, onPick: (i: number) => void) {
    this.onPick = onPick;
    this.sel = 0;
    const dim = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.7);
    const title = this.add.text(VIEW_W / 2, 150, 'LEVEL UP!', txt(56, '#4dffb0', { strokeThickness: 8 })).setOrigin(0.5);
    const sub = this.add.text(VIEW_W / 2, 200, 'Choose a mutation  ·  [1] [2] [3]  or ←/→ + ENTER', txt(18, '#e8e8f0')).setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [dim, title, sub];
    this.cards = offer.map((u, i) => {
      const x = VIEW_W / 2 + (i - (offer.length - 1) / 2) * 340;
      const lv = levels[u.id] ?? 0;
      const col = KIND_COLOR[u.kind];
      const bg = this.add.rectangle(0, 0, 310, 230, 0x10121e, 0.96).setStrokeStyle(4, col);
      const key = this.add.text(-140, -100, `[${i + 1}]`, txt(20, '#ffffff'));
      const tag = this.add.text(140, -100, lv === 0 ? 'NEW!' : `LV ${lv}→${lv + 1}`, txt(16, lv === 0 ? '#ffe14a' : '#9ffcff')).setOrigin(1, 0);
      const name = this.add.text(0, -40, u.name.toUpperCase(), txt(24, Phaser.Display.Color.IntegerToColor(col).rgba, { align: 'center', wordWrap: { width: 280 } })).setOrigin(0.5);
      const desc = this.add.text(0, 30, u.desc(lv + 1), txt(17, '#e8e8f0', { align: 'center', wordWrap: { width: 270 }, strokeThickness: 2 })).setOrigin(0.5, 0);
      const kind = this.add.text(0, 92, u.kind.toUpperCase(), txt(12, '#8888aa')).setOrigin(0.5);
      const card = this.add.container(x, 400, [bg, key, tag, name, desc, kind]).setSize(310, 230);
      card.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.pick(i)).on('pointerover', () => this.select(i));
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 200, delay: i * 70, ease: 'Back.easeOut' });
      children.push(card);
      return card;
    });
    this.openModal('levelup', children);
    this.cards = children.slice(3) as Phaser.GameObjects.Container[];
    this.select(0);
  }

  private select(i: number) {
    this.sel = i;
    this.cards.forEach((c, j) => ((c.list[0] as Phaser.GameObjects.Rectangle).setFillStyle(j === i ? 0x1e2236 : 0x10121e, 0.96)));
  }

  private pick(i: number) {
    if (this.modal !== 'levelup' || i >= this.cards.length || this.time.now - this.modalOpenedAt < 250) return;
    const cb = this.onPick;
    this.closeModal();
    cb?.(i);
  }

  showNewsLoading(outcome: RunStats['outcome']) {
    const dim = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.8);
    const label = outcome === 'wave-cleared' ? 'WAVE CLEARED — THE ARMY PULLS BACK' : outcome === 'victory' ? 'THE MECH IS DOWN' : `${KAIJU_NAME} HAS FALLEN`;
    const t = this.add.text(VIEW_W / 2, VIEW_H / 2 - 30, label, txt(38, '#ffe14a')).setOrigin(0.5);
    const s = this.add.text(VIEW_W / 2, VIEW_H / 2 + 30, `switching to ${CHANNEL}…`, txt(20, '#9ffcff')).setOrigin(0.5);
    this.tweens.add({ targets: s, alpha: 0.3, yoyo: true, repeat: -1, duration: 250 });
    this.openModal('loading', [dim, t, s]);
  }

  showBulletin(b: Bulletin, st: RunStats, onContinue: () => void) {
    this.onContinue = onContinue;
    const W = 1060, H = 560, x0 = (VIEW_W - W) / 2, y0 = (VIEW_H - H) / 2;
    const ch: Phaser.GameObjects.GameObject[] = [];
    ch.push(this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.82));
    ch.push(this.add.rectangle(VIEW_W / 2, VIEW_H / 2, W, H, 0x0c1330).setStrokeStyle(4, 0x2a3a6a));
    // red header
    ch.push(this.add.rectangle(x0, y0, W, 64, 0xc8102e).setOrigin(0));
    ch.push(this.add.text(x0 + 24, y0 + 12, 'BREAKING NEWS', txt(38, '#ffffff', { strokeThickness: 0 })));
    const live = this.add.text(x0 + W - 24, y0 + 10, '● LIVE', txt(20, '#ffffff', { strokeThickness: 0 })).setOrigin(1, 0);
    this.tweens.add({ targets: live, alpha: 0.2, yoyo: true, repeat: -1, duration: 450 });
    ch.push(live, this.add.text(x0 + W - 24, y0 + 36, CHANNEL, txt(14, '#ffd0d8', { strokeThickness: 0 })).setOrigin(1, 0));
    // headline
    ch.push(this.add.rectangle(x0, y0 + 64, W, 84, 0x10204a).setOrigin(0));
    ch.push(this.add.text(x0 + 24, y0 + 106, b.headline, txt(36, '#ffe14a', { wordWrap: { width: W - 48 } })).setOrigin(0, 0.5));
    // anchor
    const portrait = this.add.image(x0 + 110, y0 + 270, 'anchor').setScale(5);
    const glow = this.add.image(x0 + 110, y0 + 250, 'glow').setScale(4).setTint(0x3a5aff).setAlpha(0.35);
    ch.push(glow, portrait);
    ch.push(this.add.text(x0 + 30, y0 + 360, 'ANCHOR DESK', txt(13, '#8899cc')));
    ch.push(this.add.text(x0 + 230, y0 + 180, `“${b.anchor}”`, txt(22, '#ffffff', { wordWrap: { width: 470 }, lineSpacing: 6, strokeThickness: 2 })));
    // stats box
    const sx = x0 + 730, sy = y0 + 170;
    ch.push(this.add.rectangle(sx, sy, 300, 250, 0x081028).setOrigin(0).setStrokeStyle(2, 0x2a3a6a));
    const lines = [
      `WAVE ${st.wave} OF ${st.totalWaves} REPORT`,
      '',
      `Buildings flattened  ${st.buildingsDestroyed} (+${st.waveBuildingsDestroyed})`,
      `Towers toppled       ${st.towersDestroyed}`,
      `Vehicles crushed     ${st.carsCrushed}`,
      `Infantry routed      ${st.soldiersDefeated}`,
      `Tanks destroyed      ${st.tanksDestroyed}`,
      `Near-death moments   ${st.nearDeathMoments}`,
      '',
      `SIZE: ${TIERS[st.tier - 1].name}`,
      `(${TIER_FLAVOR[st.tier].size})`,
      `Last seen: ${st.district}`,
    ];
    ch.push(this.add.text(sx + 14, sy + 12, lines.join('\n'), txt(14, '#dfe6ff', { strokeThickness: 0, lineSpacing: 2, wordWrap: { width: 276 } })));
    // source tag (honest about AI vs canned)
    const src = b.source === 'ai' ? `AI DESK · ${DEFAULT_MODEL} (optional live path)` : 'KBN-7 WIRE DESK';
    ch.push(this.add.text(x0 + 24, y0 + H - 118, src, txt(12, b.source === 'ai' ? '#7ef0ff' : '#aa9977', { strokeThickness: 0 })));
    // ticker
    const tickY = y0 + H - 96;
    ch.push(this.add.rectangle(x0, tickY, W, 40, 0xffe14a).setOrigin(0));
    ch.push(this.add.rectangle(x0, tickY, 130, 40, 0xc8102e).setOrigin(0));
    const tickerStr = b.ticker.map((t) => t.toUpperCase()).join('   ◆   ');
    const tick = this.add.text(x0 + W, tickY + 20, tickerStr + '   ◆   ' + tickerStr, txt(20, '#0c1330', { strokeThickness: 0 })).setOrigin(0, 0.5);
    const mask = this.make.graphics({}).fillRect(x0 + 130, tickY, W - 130, 40);
    tick.setMask(mask.createGeometryMask());
    const dist = tick.width / 2 + W;
    this.tweens.add({ targets: tick, x: x0 + W - dist, duration: dist * 9, repeat: -1 });
    ch.push(tick, this.add.text(x0 + 16, tickY + 20, 'TICKER', txt(18, '#ffffff', { strokeThickness: 0 })).setOrigin(0, 0.5));
    // footer
    const nextLabel = st.outcome === 'wave-cleared' ? `PRESS ENTER — WAVE ${st.wave + 1}` : st.outcome === 'victory' ? 'YOU WIN! PRESS ENTER FOR A NEW RUN' : 'GAME OVER · PRESS ENTER TO TRY AGAIN';
    const foot = this.add.text(VIEW_W / 2, y0 + H - 26, nextLabel, txt(22, '#ffffff')).setOrigin(0.5);
    this.tweens.add({ targets: foot, alpha: 0.35, yoyo: true, repeat: -1, duration: 550 });
    ch.push(foot);
    // scanlines
    const scan = this.add.graphics();
    scan.fillStyle(0x000000, 0.12);
    for (let y = y0; y < y0 + H; y += 3) scan.fillRect(x0, y, W, 1);
    ch.push(scan);
    this.openModal('bulletin', ch);
    this.modalRoot!.setAlpha(0);
    this.tweens.add({ targets: this.modalRoot!, alpha: 1, duration: 200 });
    // keep the mask graphics alive with the modal
    this.modalRoot!.once(Phaser.GameObjects.Events.DESTROY, () => mask.destroy());
  }

  private continueFromBulletin() {
    if (this.modal !== 'bulletin' || this.time.now - this.modalOpenedAt < 600) return;
    const cb = this.onContinue;
    this.closeModal();
    cb?.();
  }

  // ── Input ────────────────────────────────────────────────────────────────
  private onKey(code: string) {
    if (this.modal === 'title' && (code === 'Enter' || code === 'Space')) {
      if (this.time.now - this.modalOpenedAt < 200) return;
      this.closeModal();
      this.gs.startRun();
    } else if (this.modal === 'levelup') {
      if (code === 'Digit1' || code === 'Numpad1') this.pick(0);
      else if (code === 'Digit2' || code === 'Numpad2') this.pick(1);
      else if (code === 'Digit3' || code === 'Numpad3') this.pick(2);
      else if (code === 'ArrowLeft' || code === 'KeyA') this.select(Math.max(0, this.sel - 1));
      else if (code === 'ArrowRight' || code === 'KeyD') this.select(Math.min(this.cards.length - 1, this.sel + 1));
      else if (code === 'Enter') this.pick(this.sel);
    } else if (this.modal === 'bulletin' && code === 'Enter') {
      this.continueFromBulletin();
    }
  }

  private pollPad() {
    const pad = this.input.gamepad?.pad1;
    if (!pad) return;
    const now = { left: pad.left || pad.leftStick.x < -0.5, right: pad.right || pad.leftStick.x > 0.5, a: pad.A };
    if (now.left && !this.pad.left) this.onKey('ArrowLeft');
    if (now.right && !this.pad.right) this.onKey('ArrowRight');
    if (now.a && !this.pad.a) this.onKey(this.modal === 'title' ? 'Enter' : 'Enter');
    this.pad = now;
  }
}
