// HUD + in-game overlays (level-up, breaking-news card, pause). The title and menus are HTML
// (src/ui/overlay.ts); this scene renders unzoomed on top of the game.
import Phaser from 'phaser';
import { VIEW_H, VIEW_W, WAVES, XP_TO_LEVEL } from '../config';
import { districtAt } from '../city';
import { CHANNEL, DEFAULT_MODEL, type Bulletin, type RunStats } from '../shared/narration';
import { UPGRADES, type UpgradeDef } from '../upgrades';
import type { GameScene, RunSummary } from './GameScene';
import { lastName, submit } from '../scores';
import { comboMult } from '../config';
import { sfx } from '../sfx';
import { districtName, gameFont, getLang, JP_FONT, onLang, t, tierName, upDesc, upGlyph, upName } from '../i18n';
import { overlay } from '../ui/overlay';
import { uiSound } from '../audio/ui-sounds';

const txt = (size: number, color = '#ffffff', extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => {
  const ja = getLang() === 'ja';
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: gameFont(), fontStyle: 'bold', fontSize: `${ja ? Math.round(size * 0.92) : size}px`, color, stroke: '#05060d',
    strokeThickness: Math.max(2, Math.round(size / 6)), ...extra,
  };
  // Japanese has no spaces to break on.
  if (ja && style.wordWrap) style.wordWrap = { ...style.wordWrap, useAdvancedWrap: true };
  return style;
};

type Modal = null | 'title' | 'levelup' | 'loading' | 'bulletin' | 'paused' | 'exitConfirm' | 'results';

export interface LevelUpOpts {
  rerolls: number;
  reroll: () => void;
  skip: () => void;
}

const KIND_COLOR: Record<UpgradeDef['kind'], number> = { weapon: 0xff7a2a, body: 0x56c46a, stomp: 0x5ff6ff, growth: 0xff5fd2 };
const up = (s: string) => (getLang() === 'ja' ? s : s.toUpperCase());

export class UIScene extends Phaser.Scene {
  private gs!: GameScene;
  private modal: Modal = null;
  private pauseSel = 0;
  private confirmSel = 1;
  private modalRoot?: Phaser.GameObjects.Container;
  private modalOpenedAt = 0;
  private onPick?: (i: number) => void;
  private onContinue?: () => void;
  private levelOpts?: LevelUpOpts;
  private results?: { summary: RunSummary; onDone: (c: 'new' | 'endless') => void; name: string[]; cursor: number; entering: boolean; saved: boolean; nameText?: Phaser.GameObjects.Text };
  private sel = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private pad = { left: false, right: false, up: false, down: false, a: false };

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
  private stompBox!: Phaser.GameObjects.Rectangle;
  private stompBar!: Phaser.GameObjects.Rectangle;
  private stompText!: Phaser.GameObjects.Text;
  private stompHint!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;
  private bossRoot!: Phaser.GameObjects.Container;
  private bossBarFill!: Phaser.GameObjects.Rectangle;
  private chips!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private comboBar!: Phaser.GameObjects.Rectangle;
  private rageText!: Phaser.GameObjects.Text;
  private chipSig = '';
  private hud!: Phaser.GameObjects.Container;
  private hurt!: Phaser.GameObjects.Rectangle;
  private bannerRoot?: Phaser.GameObjects.Container;
  private whiteFlash!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('UI');
  }

  create() {
    this.add.image(VIEW_W / 2, VIEW_H / 2, 'vignette').setDisplaySize(VIEW_W, VIEW_H).setAlpha(0.9);
    this.hurt = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0xff0022, 0).setDepth(5);
    this.whiteFlash = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0xffffff, 0).setDepth(60);
    this.buildHud();
    const kb = this.input.keyboard!;
    kb.on('keydown', (ev: KeyboardEvent) => this.onKey(ev.code));
    // The on-screen pause button (HTML, beside mute) behaves like P.
    window.addEventListener('kaiju-pause', () => this.onKey('KeyP'));
    overlay.init(() => this.gs?.startRun());
    onLang(() => this.rebuildHud());
  }

  get currentModal(): Modal {
    return overlay.isOpen() ? 'title' : this.modal;
  }

  onGameReady(gs: GameScene) {
    this.gs = gs;
    this.chipSig = '';
    const src = gs.textures.get('kaiju0').getSourceImage() as HTMLCanvasElement;
    overlay.setMonster(src);
    overlay.show();
  }

  reset() {
    this.closeModal();
    this.bannerRoot?.destroy();
    this.bannerRoot = undefined;
  }

  // ── HUD ──────────────────────────────────────────────────────────────────
  private rebuildHud() {
    const vis = this.hud?.visible ?? false;
    this.hud?.destroy();
    this.chipSig = '';
    this.buildHud();
    this.hud.setVisible(vis);
  }

  private buildHud() {
    const c = (this.hud = this.add.container(0, 0).setDepth(10));
    const panel = this.add.rectangle(12, 12, 300, 66, 0x05060d, 0.55).setOrigin(0).setStrokeStyle(2, 0x2a2d42);
    const hpBg = this.add.rectangle(22, 22, 280, 16, 0x2a0a12).setOrigin(0);
    this.hpBar = this.add.rectangle(22, 22, 280, 16, 0xff3355).setOrigin(0);
    this.hpText = this.add.text(28, 21, '', txt(13));
    const gBg = this.add.rectangle(22, 46, 280, 10, 0x0a2a2e).setOrigin(0);
    this.growBar = this.add.rectangle(22, 46, 0, 10, 0x5ff6ff).setOrigin(0);
    this.growText = this.add.text(22, 58, '', txt(12, '#9ffcff'));
    this.chips = this.add.container(12, 86);
    this.waveText = this.add.text(VIEW_W / 2, 14, '', txt(24, '#ffe14a')).setOrigin(0.5, 0);
    this.timerText = this.add.text(VIEW_W / 2, 44, '', txt(16, '#ffffff')).setOrigin(0.5, 0);
    this.districtText = this.add.text(VIEW_W - 16, 14, '', txt(16, '#ffb0e8')).setOrigin(1, 0);
    this.destroyedText = this.add.text(VIEW_W - 16, 38, '', txt(14, '#ffffff')).setOrigin(1, 0);
    this.scoreText = this.add.text(VIEW_W - 16, 58, '', txt(18, '#ffe14a')).setOrigin(1, 0);
    this.comboText = this.add.text(VIEW_W / 2, 68, '', txt(20, '#ff8a1f')).setOrigin(0.5, 0);
    this.comboBar = this.add.rectangle(VIEW_W / 2 - 80, 94, 160, 4, 0xff8a1f).setOrigin(0, 0.5);
    this.rageText = this.add.text(16, VIEW_H - 88, '', txt(18, '#ff3355')).setOrigin(0, 1);
    const xpBg = this.add.rectangle(0, VIEW_H - 10, VIEW_W, 10, 0x0a1a12).setOrigin(0);
    this.xpBar = this.add.rectangle(0, VIEW_H - 10, 0, 10, 0x4dffb0).setOrigin(0);
    this.lvText = this.add.text(VIEW_W / 2, VIEW_H - 14, '', txt(14, '#4dffb0')).setOrigin(0.5, 1);
    this.stompBox = this.add.rectangle(16, VIEW_H - 50, 190, 26, 0x05060d, 0.6).setOrigin(0).setStrokeStyle(2, 0x2a2d42);
    this.stompBar = this.add.rectangle(18, VIEW_H - 48, 186, 22, 0x2a6a8a).setOrigin(0);
    this.stompText = this.add.text(111, VIEW_H - 37, '', txt(13)).setOrigin(0.5);
    this.stompHint = this.add.text(16, VIEW_H - 60, '', txt(16, '#ffe14a')).setOrigin(0, 1).setVisible(false);
    this.tweens.add({ targets: this.stompHint, alpha: 0.35, yoyo: true, repeat: -1, duration: 380 });
    this.fpsText = this.add.text(VIEW_W - 10, VIEW_H - 14, '', txt(11, '#8888aa')).setOrigin(1, 1);
    const bossBg = this.add.rectangle(0, 0, 560, 16, 0x2a0a12).setStrokeStyle(2, 0xff3355);
    this.bossBarFill = this.add.rectangle(-278, 0, 556, 12, 0xff3355).setOrigin(0, 0.5);
    const bossLabel = this.add.text(0, -20, t('bossName'), txt(14, '#ff8899')).setOrigin(0.5);
    this.bossRoot = this.add.container(VIEW_W / 2, 92, [bossBg, this.bossBarFill, bossLabel]).setVisible(false);
    c.add([panel, hpBg, this.hpBar, this.hpText, gBg, this.growBar, this.growText, this.chips, this.waveText, this.timerText, this.districtText,
      this.destroyedText, this.scoreText, this.comboText, this.comboBar, this.rageText, xpBg, this.xpBar, this.lvText, this.stompBox, this.stompBar, this.stompText, this.stompHint, this.fpsText, this.bossRoot]);
    c.setVisible(false);
  }

  /** One chip per owned mutation: its kanji, coloured by kind, with the level. */
  private refreshChips() {
    const levels = this.gs.player.upgradeLevels;
    const sig = UPGRADES.map((u) => levels[u.id] ?? 0).join('');
    if (sig === this.chipSig) return;
    this.chipSig = sig;
    this.chips.removeAll(true);
    let x = 0;
    for (const u of UPGRADES) {
      const lv = levels[u.id];
      if (!lv) continue;
      const col = KIND_COLOR[u.kind];
      const bg = this.add.rectangle(x, 0, 30, 30, 0x05060d, 0.75).setOrigin(0).setStrokeStyle(2, col);
      const glyph = this.add
        .text(x + 15, 14, upGlyph(u.id), { fontFamily: JP_FONT, fontStyle: 'bold', fontSize: '17px', color: Phaser.Display.Color.IntegerToColor(col).rgba })
        .setOrigin(0.5);
      const lvT = this.add.text(x + 28, 29, String(lv), txt(10, '#ffffff', { strokeThickness: 3 })).setOrigin(1, 1);
      this.chips.add([bg, glyph, lvT]);
      x += 34;
    }
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
    this.hpText.setText(`${t('hp')} ${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`);
    this.growBar.width = 280 * p.growth;
    const next = p.nextTier;
    const cur = tierName(p.tier.tier);
    this.growText.setText(next ? `${cur} ▸ ${tierName(next.tier)}  ${Math.floor(p.growth * 100)}%` : t('maxSize', { a: cur }));
    const w = gs.wave;
    this.waveText.setText(w.endless ? t('waveEndless', { n: w.wave }) : t('wave', { n: w.wave, total: WAVES.length }));
    if (w.boss) this.timerText.setText(gs.enemies.boss ? t('destroyMech') : t('somethingComing'));
    else {
      const left = Math.max(0, gs.waveDuration - gs.waveTime);
      this.timerText.setText(t('timer', { t: `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` }));
    }
    this.districtText.setText(up(districtName(districtAt(p.x, p.y))));
    this.destroyedText.setText(t('flattened', { n: gs.stats.buildings }));
    this.scoreText.setText(t('score', { n: gs.score.score.toLocaleString() }));
    const combo = gs.score.combo;
    this.comboText.setVisible(combo >= 5).setText(t('combo', { n: combo, m: comboMult(combo).toFixed(1) }));
    this.comboText.setScale(1 + Math.min(0.4, combo / 200));
    this.comboBar.setVisible(combo >= 5).setSize(160 * Phaser.Math.Clamp(gs.score.comboT / 2.2, 0, 1), 4);
    this.rageText.setVisible(p.mods.rage > 0).setText(t('rage', { s: Math.ceil(p.mods.rage) }));
    this.bossRoot.y = combo >= 5 ? 124 : 92;
    this.xpBar.width = VIEW_W * Phaser.Math.Clamp(p.xp / XP_TO_LEVEL(p.level), 0, 1);
    this.lvText.setText(`LV ${p.level}`);
    const ready = p.stompCd <= 0;
    this.stompBar.width = 186 * (ready ? 1 : 1 - p.stompCd / (5 * p.mods.stompCd));
    this.stompBar.fillColor = ready ? 0x5ff6ff : 0x2a4a5a;
    this.stompText.setText(ready ? t('stompReady') : t('stompCharging'));
    const hint = gs.stompHint;
    this.stompHint.setVisible(!!hint);
    if (hint) this.stompHint.setText(`▼ ${t(hint)}`);
    this.stompBox.setStrokeStyle(2, hint ? 0xffe14a : 0x2a2d42);
    this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
    const b = gs.enemies.boss;
    this.bossRoot.setVisible(!!b && !b.dead);
    if (b) this.bossBarFill.width = 556 * Phaser.Math.Clamp(b.hp / b.maxHp, 0, 1);
    this.refreshChips();
  }

  flashWhite() {
    this.whiteFlash.setAlpha(0.85);
    this.tweens.killTweensOf(this.whiteFlash);
    this.tweens.add({ targets: this.whiteFlash, alpha: 0, duration: 450, ease: 'Quad.easeOut' });
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
    const tt = this.add.text(0, -16, title, txt(40, danger ? '#ff5577' : '#ffe14a')).setOrigin(0.5);
    const s = this.add.text(0, 24, sub, txt(18, '#ffffff')).setOrigin(0.5);
    const root = (this.bannerRoot = this.add.container(VIEW_W / 2, 210, [bg, stripe, stripe2, tt, s]).setDepth(20));
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

  showLevelUp(offer: UpgradeDef[], levels: Record<string, number>, onPick: (i: number) => void, opts?: LevelUpOpts) {
    this.onPick = onPick;
    this.levelOpts = opts;
    this.sel = 0;
    const dim = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.7);
    const title = this.add.text(VIEW_W / 2, 150, t('levelUp'), txt(56, '#4dffb0', { strokeThickness: 8 })).setOrigin(0.5);
    const sub = this.add.text(VIEW_W / 2, 200, t('chooseMutation'), txt(18, '#e8e8f0')).setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [dim, title, sub];
    this.cards = offer.map((u, i) => {
      const x = VIEW_W / 2 + (i - (offer.length - 1) / 2) * 340;
      const lv = levels[u.id] ?? 0;
      const col = KIND_COLOR[u.kind];
      const colS = Phaser.Display.Color.IntegerToColor(col).rgba;
      const bg = this.add.rectangle(0, 0, 310, 250, 0x10121e, 0.96).setStrokeStyle(4, col);
      const key = this.add.text(-140, -110, `[${i + 1}]`, txt(20, '#ffffff'));
      const tag = this.add.text(140, -110, lv === 0 ? t('new') : `LV ${lv}→${lv + 1}`, txt(16, lv === 0 ? '#ffe14a' : '#9ffcff')).setOrigin(1, 0);
      const glyph = this.add.text(0, -62, upGlyph(u.id), { fontFamily: JP_FONT, fontStyle: 'bold', fontSize: '40px', color: colS, stroke: '#05060d', strokeThickness: 6 }).setOrigin(0.5);
      const name = this.add.text(0, -12, up(upName(u.id)), txt(22, colS, { align: 'center', wordWrap: { width: 280 } })).setOrigin(0.5);
      const desc = this.add.text(0, 24, upDesc(u.id, lv + 1), txt(16, '#e8e8f0', { align: 'center', wordWrap: { width: 270 }, strokeThickness: 2 })).setOrigin(0.5, 0);
      const kind = this.add.text(0, 104, t(`kind_${u.kind}` as 'kind_weapon'), txt(12, '#8888aa')).setOrigin(0.5);
      const card = this.add.container(x, 410, [bg, key, tag, glyph, name, desc, kind]).setSize(310, 250);
      card.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.pick(i)).on('pointerover', () => this.select(i, true));
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 200, delay: i * 70, ease: 'Back.easeOut' });
      children.push(card);
      return card;
    });
    const cardsOnly = children.slice(3) as Phaser.GameObjects.Container[];
    if (opts) {
      const rr = this.add.text(VIEW_W / 2 - 170, 580, t('reroll', { n: opts.rerolls }), txt(18, opts.rerolls > 0 ? '#9ffcff' : '#555a70')).setOrigin(0.5);
      const sk = this.add.text(VIEW_W / 2 + 170, 580, t('skip'), txt(18, '#ff9fb0')).setOrigin(0.5);
      rr.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.rerollOffer()).on('pointerover', () => uiSound.hover());
      sk.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.skipOffer()).on('pointerover', () => uiSound.hover());
      children.push(rr, sk);
    }
    this.openModal('levelup', children);
    this.cards = cardsOnly;
    this.select(0);
  }

  private rerollOffer() {
    if (this.modal !== 'levelup' || !this.levelOpts || this.levelOpts.rerolls <= 0 || this.time.now - this.modalOpenedAt < 250) return;
    const o = this.levelOpts;
    uiSound.press();
    this.closeModal();
    o.reroll();
  }

  private skipOffer() {
    if (this.modal !== 'levelup' || !this.levelOpts || this.time.now - this.modalOpenedAt < 250) return;
    const o = this.levelOpts;
    uiSound.press();
    this.closeModal();
    o.skip();
  }

  private select(i: number, fromPointer = false) {
    if (i !== this.sel || fromPointer) uiSound.hover(fromPointer);
    this.sel = i;
    this.cards.forEach((c, j) => ((c.list[0] as Phaser.GameObjects.Rectangle).setFillStyle(j === i ? 0x1e2236 : 0x10121e, 0.96)));
  }

  private pick(i: number) {
    if (this.modal !== 'levelup' || i >= this.cards.length || this.time.now - this.modalOpenedAt < 250) return;
    const cb = this.onPick;
    uiSound.press();
    this.closeModal();
    cb?.(i);
  }

  showNewsLoading(outcome: RunStats['outcome']) {
    const dim = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.8);
    const label = outcome === 'wave-cleared' ? t('waveCleared') : outcome === 'victory' ? t('mechDown') : t('kaijuFallen', { kaiju: t('kaijuName') });
    const tt = this.add.text(VIEW_W / 2, VIEW_H / 2 - 30, label, txt(38, '#ffe14a')).setOrigin(0.5);
    const s = this.add.text(VIEW_W / 2, VIEW_H / 2 + 30, t('switching', { ch: CHANNEL }), txt(20, '#9ffcff')).setOrigin(0.5);
    this.tweens.add({ targets: s, alpha: 0.3, yoyo: true, repeat: -1, duration: 250 });
    this.openModal('loading', [dim, tt, s]);
  }

  showBulletin(b: Bulletin, st: RunStats, onContinue: () => void) {
    this.onContinue = onContinue;
    const W = 1060, H = 560, x0 = (VIEW_W - W) / 2, y0 = (VIEW_H - H) / 2;
    const ch: Phaser.GameObjects.GameObject[] = [];
    ch.push(this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.82));
    ch.push(this.add.rectangle(VIEW_W / 2, VIEW_H / 2, W, H, 0x0c1330).setStrokeStyle(4, 0x2a3a6a));
    ch.push(this.add.rectangle(x0, y0, W, 64, 0xc8102e).setOrigin(0));
    ch.push(this.add.text(x0 + 24, y0 + 12, t('breaking'), txt(38, '#ffffff', { strokeThickness: 0 })));
    const live = this.add.text(x0 + W - 24, y0 + 10, t('live'), txt(20, '#ffffff', { strokeThickness: 0 })).setOrigin(1, 0);
    this.tweens.add({ targets: live, alpha: 0.2, yoyo: true, repeat: -1, duration: 450 });
    ch.push(live, this.add.text(x0 + W - 24, y0 + 36, CHANNEL, txt(14, '#ffd0d8', { strokeThickness: 0 })).setOrigin(1, 0));
    ch.push(this.add.rectangle(x0, y0 + 64, W, 84, 0x10204a).setOrigin(0));
    ch.push(this.add.text(x0 + 24, y0 + 106, b.headline, txt(36, '#ffe14a', { wordWrap: { width: W - 48 } })).setOrigin(0, 0.5));
    const portrait = this.add.image(x0 + 110, y0 + 270, 'anchor').setScale(5);
    const glow = this.add.image(x0 + 110, y0 + 250, 'glow').setScale(4).setTint(0x3a5aff).setAlpha(0.35);
    ch.push(glow, portrait);
    ch.push(this.add.text(x0 + 30, y0 + 360, t('anchorDesk'), txt(13, '#8899cc')));
    const q = getLang() === 'ja' ? ['「', '」'] : ['“', '”'];
    ch.push(this.add.text(x0 + 230, y0 + 180, `${q[0]}${b.anchor}${q[1]}`, txt(22, '#ffffff', { wordWrap: { width: 470 }, lineSpacing: 6, strokeThickness: 2 })));
    const sx = x0 + 730, sy = y0 + 170;
    ch.push(this.add.rectangle(sx, sy, 300, 250, 0x081028).setOrigin(0).setStrokeStyle(2, 0x2a3a6a));
    const row = (k: Parameters<typeof t>[0], v: string) => `${t(k).padEnd(getLang() === 'ja' ? 10 : 20, getLang() === 'ja' ? '　' : ' ')} ${v}`;
    const lines = [
      t('report', { n: st.wave, t: st.totalWaves }),
      '',
      row('st_buildings', `${st.buildingsDestroyed} (+${st.waveBuildingsDestroyed})`),
      row('st_towers', String(st.towersDestroyed)),
      row('st_cars', String(st.carsCrushed)),
      row('st_soldiers', String(st.soldiersDefeated)),
      row('st_tanks', String(st.tanksDestroyed)),
      row('st_near', String(st.nearDeathMoments)),
      '',
      t('size', { x: tierName(st.tier) }),
      `(${t((['size1', 'size2', 'size3'] as const)[st.tier - 1])})`,
      t('lastSeen', { d: districtName(st.district) }),
    ];
    ch.push(this.add.text(sx + 14, sy + 12, lines.join('\n'), txt(14, '#dfe6ff', { strokeThickness: 0, lineSpacing: 2, wordWrap: { width: 276 } })));
    const src = b.source === 'ai' ? t('srcAi', { model: DEFAULT_MODEL }) : t('srcBank');
    ch.push(this.add.text(x0 + 24, y0 + H - 118, src, txt(12, b.source === 'ai' ? '#7ef0ff' : '#aa9977', { strokeThickness: 0 })));
    const tickY = y0 + H - 96;
    ch.push(this.add.rectangle(x0, tickY, W, 40, 0xffe14a).setOrigin(0));
    ch.push(this.add.rectangle(x0, tickY, 130, 40, 0xc8102e).setOrigin(0));
    const tickerStr = b.ticker.map((s) => up(s)).join('   ◆   ');
    const tick = this.add.text(x0 + W, tickY + 20, tickerStr + '   ◆   ' + tickerStr, txt(20, '#0c1330', { strokeThickness: 0 })).setOrigin(0, 0.5);
    const mask = this.make.graphics({}).fillRect(x0 + 130, tickY, W - 130, 40);
    tick.setMask(mask.createGeometryMask());
    const dist = tick.width / 2 + W;
    this.tweens.add({ targets: tick, x: x0 + W - dist, duration: dist * 9, repeat: -1 });
    ch.push(tick, this.add.text(x0 + 16, tickY + 20, t('ticker'), txt(18, '#ffffff', { strokeThickness: 0 })).setOrigin(0, 0.5));
    const nextLabel = st.outcome === 'wave-cleared' ? t('nextWave', { n: st.wave + 1 }) : st.outcome === 'victory' ? t('youWin') : t('gameOver');
    const foot = this.add.text(VIEW_W / 2, y0 + H - 26, nextLabel, txt(22, '#ffffff')).setOrigin(0.5);
    this.tweens.add({ targets: foot, alpha: 0.35, yoyo: true, repeat: -1, duration: 550 });
    ch.push(foot);
    const scan = this.add.graphics();
    scan.fillStyle(0x000000, 0.12);
    for (let y = y0; y < y0 + H; y += 3) scan.fillRect(x0, y, W, 1);
    ch.push(scan);
    this.openModal('bulletin', ch);
    this.modalRoot!.setAlpha(0);
    this.tweens.add({ targets: this.modalRoot!, alpha: 1, duration: 200 });
    this.modalRoot!.once(Phaser.GameObjects.Events.DESTROY, () => mask.destroy());
  }

  /** A clickable pill button for the pause screen. `focus` draws it highlighted (keyboard selection). */
  private pauseButton(x: number, y: number, w: number, label: string, color: number, focus: boolean, onClick: () => void) {
    const bg = this.add.rectangle(x, y, w, 46, focus ? color : 0x10121e, focus ? 1 : 0.92).setStrokeStyle(2, color).setInteractive({ useHandCursor: true });
    const tx = this.add.text(x, y, label, txt(18, focus ? '#05060d' : '#ffffff', { strokeThickness: focus ? 0 : 3 })).setOrigin(0.5);
    bg.on('pointerover', () => uiSound.hover());
    bg.on('pointerdown', () => {
      uiSound.press();
      onClick();
    });
    return [bg, tx];
  }

  private showPaused(sel = this.pauseSel) {
    this.pauseSel = sel;
    const dim = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.72);
    const tt = this.add.text(VIEW_W / 2, 84, t('paused'), txt(52, '#ffffff', { strokeThickness: 8 })).setOrigin(0.5);
    const s = this.add.text(VIEW_W / 2, 130, `${t('pauseHint')}  ·  ${t('s_difficulty')}: ${t(`diff_${this.gs.diff.id}` as 'diff_easy')}`, txt(16, '#9ffcff')).setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [dim, tt, s];
    children.push(
      ...this.pauseButton(VIEW_W / 2 - 170, 184, 300, t('p_resume'), 0x4dffb0, sel === 0, () => this.resumeFromPause()),
      ...this.pauseButton(VIEW_W / 2 + 170, 184, 300, t('p_exit'), 0xff5577, sel === 1, () => this.showExitConfirm()),
    );
    children.push(this.add.text(VIEW_W / 2, 238, t('yourMutations'), txt(18, '#ffe14a')).setOrigin(0.5));
    const owned = UPGRADES.filter((u) => this.gs.player.upgradeLevels[u.id]);
    if (!owned.length) children.push(this.add.text(VIEW_W / 2, 280, t('noMutations'), txt(16, '#c9d0ea')).setOrigin(0.5));
    owned.forEach((u, i) => {
      const col = i % 2, rowI = Math.floor(i / 2);
      const x = VIEW_W / 2 - 520 + col * 540, y = 262 + rowI * 54;
      const lv = this.gs.player.upgradeLevels[u.id];
      const c = KIND_COLOR[u.kind];
      children.push(
        this.add.rectangle(x, y, 500, 48, 0x10121e, 0.92).setOrigin(0).setStrokeStyle(2, c),
        this.add.text(x + 26, y + 24, upGlyph(u.id), { fontFamily: JP_FONT, fontStyle: 'bold', fontSize: '26px', color: Phaser.Display.Color.IntegerToColor(c).rgba }).setOrigin(0.5),
        this.add.text(x + 52, y + 5, `${up(upName(u.id))}  LV ${lv}/${u.max}`, txt(15, '#ffffff', { strokeThickness: 2 })),
        this.add.text(x + 52, y + 26, upDesc(u.id, Math.min(lv, 2)), txt(13, '#c9d0ea', { strokeThickness: 0, wordWrap: { width: 430 } })),
      );
    });
    this.openModal('paused', children);
  }

  private resumeFromPause() {
    if (this.modal !== 'paused' && this.modal !== 'exitConfirm') return;
    this.closeModal();
    this.gs.resumeGame();
  }

  /** "Exit this run?" Defaults to Keep playing, so a stray Enter never ends a run. */
  private showExitConfirm(sel = 1) {
    this.confirmSel = sel;
    const dim = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.86);
    const box = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, 660, 250, 0x10121e, 0.98).setStrokeStyle(3, 0xff5577);
    const title = this.add.text(VIEW_W / 2, VIEW_H / 2 - 78, t('exitTitle'), txt(30, '#ff5577', { strokeThickness: 5 })).setOrigin(0.5);
    const body = this.add.text(VIEW_W / 2, VIEW_H / 2 - 26, t('exitBody'), txt(16, '#e8e8f0', { strokeThickness: 0, align: 'center', wordWrap: { width: 580, useAdvancedWrap: true } })).setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [dim, box, title, body];
    children.push(
      ...this.pauseButton(VIEW_W / 2 - 150, VIEW_H / 2 + 60, 270, t('exitYes'), 0xff5577, sel === 0, () => this.confirmExit()),
      ...this.pauseButton(VIEW_W / 2 + 150, VIEW_H / 2 + 60, 270, t('exitNo'), 0x4dffb0, sel === 1, () => this.showPaused(0)),
    );
    this.openModal('exitConfirm', children);
  }

  private confirmExit() {
    if (this.modal !== 'exitConfirm') return;
    this.closeModal();
    this.gs.exitToTitle();
  }

  showResults(summary: RunSummary, onDone: (c: 'new' | 'endless') => void) {
    const name = (lastName() + 'AAA').slice(0, 3).split('');
    this.results = { summary, onDone, name, cursor: 0, entering: summary.rank > 0, saved: false };
    this.renderResults();
  }

  private renderResults() {
    const r = this.results!;
    const sm = r.summary;
    const ch: Phaser.GameObjects.GameObject[] = [];
    ch.push(this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x05060d, 0.88));
    const title = sm.outcome === 'victory' && !sm.endless ? t('resVictory') : sm.endless ? t('resEndless') : t('resDefeat');
    ch.push(this.add.text(VIEW_W / 2, 78, title, txt(48, sm.outcome === 'victory' ? '#ffe14a' : '#ff5577', { strokeThickness: 8 })).setOrigin(0.5));
    if (sm.daily) ch.push(this.add.text(VIEW_W / 2, 120, t('dailyBadge', { date: sm.daily }), txt(16, '#9ffcff')).setOrigin(0.5));
    const diffCol = { easy: '#7fd48a', medium: '#ffc94a', hard: '#ff4b5c' }[sm.difficulty];
    ch.push(this.add.text(VIEW_W / 2, sm.daily ? 142 : 120, `${t('s_difficulty')}: ${t(`diff_${sm.difficulty}` as 'diff_easy')}`.toUpperCase(), txt(15, diffCol)).setOrigin(0.5));
    ch.push(this.add.text(VIEW_W / 2 - 250, 170, t('finalScore'), txt(18, '#8f97b8')).setOrigin(0.5));
    ch.push(this.add.text(VIEW_W / 2 - 250, 222, sm.score.toLocaleString(), txt(56, '#ffffff', { strokeThickness: 6 })).setOrigin(0.5));
    ch.push(this.add.text(VIEW_W / 2 + 250, 170, t('grade'), txt(18, '#8f97b8')).setOrigin(0.5));
    const gradeCol = { S: '#ff5fd2', A: '#ffe14a', B: '#5ff6ff', C: '#4dffb0', D: '#c9d0ea' }[sm.grade] ?? '#ffffff';
    const g = this.add.text(VIEW_W / 2 + 250, 230, sm.grade, txt(96, gradeCol, { strokeThickness: 10 })).setOrigin(0.5).setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: g, scale: 1, alpha: 1, duration: 380, ease: 'Back.easeOut', delay: 200 });
    ch.push(g);
    const mm = Math.floor(sm.seconds / 60), ss = String(sm.seconds % 60).padStart(2, '0');
    const rows: [Parameters<typeof t>[0], string][] = [
      ['r_waves', sm.endless ? t('resEndlessShort', { n: sm.wave }) : String(sm.outcome === 'victory' ? sm.wave : sm.wave - 1)],
      ['r_time', `${mm}:${ss}`],
      ['st_buildings', sm.buildings.toLocaleString()],
      ['r_kills', sm.kills.toLocaleString()],
      ['r_combo', String(sm.bestCombo)],
      ['r_level', String(sm.level)],
      ['r_evos', sm.evolutions.length ? sm.evolutions.join(', ') : '—'],
    ];
    rows.forEach(([k, v], i) => {
      ch.push(this.add.text(VIEW_W / 2 - 330, 300 + i * 30, t(k), txt(17, '#c9d0ea', { strokeThickness: 2 })));
      ch.push(this.add.text(VIEW_W / 2 + 330, 300 + i * 30, v, txt(17, '#ffffff', { strokeThickness: 2 })).setOrigin(1, 0));
    });
    if (r.entering) {
      ch.push(this.add.text(VIEW_W / 2, 530, t('newHigh', { n: sm.rank }), txt(22, '#ffe14a')).setOrigin(0.5));
      const nameText = this.add.text(VIEW_W / 2, 578, '', { fontFamily: '"Courier New", monospace', fontStyle: 'bold', fontSize: '44px', color: '#ffffff', stroke: '#05060d', strokeThickness: 6 }).setOrigin(0.5);
      r.nameText = nameText;
      ch.push(nameText, this.add.text(VIEW_W / 2, 624, t('nameHint'), txt(14, '#8f97b8')).setOrigin(0.5));
      this.updateName();
    } else {
      if (r.saved && sm.rank) ch.push(this.add.text(VIEW_W / 2, 540, t('newHigh', { n: sm.rank }), txt(22, '#ffe14a')).setOrigin(0.5));
      const opts = [t('resNew'), ...(sm.outcome === 'victory' && !sm.endless ? [t('resEndlessGo')] : [])];
      const foot = this.add.text(VIEW_W / 2, 600, opts.join('      '), txt(22, '#ffffff')).setOrigin(0.5);
      this.tweens.add({ targets: foot, alpha: 0.4, yoyo: true, repeat: -1, duration: 550 });
      ch.push(foot);
    }
    this.openModal('results', ch);
  }

  private updateName() {
    const r = this.results;
    if (!r?.nameText) return;
    r.nameText.setText(r.name.map((c, i) => (i === r.cursor ? `[${c}]` : ` ${c} `)).join(''));
  }

  private resultsKey(code: string) {
    const r = this.results;
    if (!r || this.time.now - this.modalOpenedAt < 500) return;
    if (r.entering) {
      const A = 'A'.charCodeAt(0);
      const bump = (d: number) => {
        const c = r.name[r.cursor].charCodeAt(0) - A;
        r.name[r.cursor] = String.fromCharCode(A + ((c + d + 26) % 26));
      };
      if (code !== 'Enter' && code !== 'Space') uiSound.hover(false);
      else uiSound.press();
      if (code === 'ArrowUp') bump(1);
      else if (code === 'ArrowDown') bump(-1);
      else if (code === 'ArrowLeft') r.cursor = Math.max(0, r.cursor - 1);
      else if (code === 'ArrowRight') r.cursor = Math.min(2, r.cursor + 1);
      else if (/^Key[A-Z]$/.test(code)) {
        r.name[r.cursor] = code.slice(3);
        r.cursor = Math.min(2, r.cursor + 1);
      } else if (code === 'Enter' || code === 'Space') {
        const sm = r.summary;
        const res = submit({ name: r.name.join(''), score: sm.score, grade: sm.grade, wave: sm.wave, victory: sm.outcome === 'victory', endless: sm.endless, level: sm.level, difficulty: sm.difficulty });
        sm.rank = res.rank || res.dailyRank;
        r.entering = false;
        r.saved = true;
        this.renderResults();
        return;
      }
      this.updateName();
      return;
    }
    if (code === 'Enter' || code === 'Space') {
      uiSound.press();
      const cb = r.onDone;
      this.results = undefined;
      this.closeModal();
      cb('new');
    } else if (code === 'KeyE' && r.summary.outcome === 'victory' && !r.summary.endless) {
      const cb = r.onDone;
      this.results = undefined;
      this.closeModal();
      cb('endless');
    }
  }

  private continueFromBulletin() {
    if (this.modal !== 'bulletin' || this.time.now - this.modalOpenedAt < 600) return;
    const cb = this.onContinue;
    uiSound.press();
    this.closeModal();
    cb?.();
  }

  // ── Input ────────────────────────────────────────────────────────────────
  private onKey(code: string) {
    if (code === 'KeyM') {
      sfx.toggleMute();
      return;
    }
    if (overlay.isOpen()) return; // the HTML front page handles its own keys
    if (this.modal === 'exitConfirm') {
      if (code === 'KeyY') this.confirmExit();
      else if (code === 'KeyN' || code === 'Escape' || code === 'KeyP') this.showPaused(0);
      else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
        uiSound.hover(false);
        this.showExitConfirm(1 - this.confirmSel);
      } else if (code === 'Enter' || code === 'Space') {
        uiSound.press();
        if (this.confirmSel === 0) this.confirmExit();
        else this.showPaused(0);
      }
      return;
    }
    if (code === 'KeyP' || code === 'Escape') {
      if (this.modal === null && this.gs.phase === 'playing') {
        this.gs.pauseGame();
        this.showPaused(0);
      } else if (this.modal === 'paused') this.resumeFromPause();
      return;
    }
    if (this.modal === 'paused') {
      if (code === 'KeyQ') {
        uiSound.press();
        this.showExitConfirm();
      } else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD' || code === 'ArrowUp' || code === 'ArrowDown') {
        uiSound.hover(false);
        this.showPaused(1 - this.pauseSel);
      } else if (code === 'Enter' || code === 'Space') {
        uiSound.press();
        if (this.pauseSel === 0) this.resumeFromPause();
        else this.showExitConfirm();
      }
      return;
    }
    if (this.modal === 'levelup') {
      if (code === 'Digit1' || code === 'Numpad1') this.pick(0);
      else if (code === 'Digit2' || code === 'Numpad2') this.pick(1);
      else if (code === 'Digit3' || code === 'Numpad3') this.pick(2);
      else if (code === 'ArrowLeft' || code === 'KeyA') this.select(Math.max(0, this.sel - 1));
      else if (code === 'ArrowRight' || code === 'KeyD') this.select(Math.min(this.cards.length - 1, this.sel + 1));
      else if (code === 'Enter') this.pick(this.sel);
      // Space confirms too, but not in the first moments: a player mashing Space to stomp mustn't pick blind.
      else if (code === 'Space' && this.time.now - this.modalOpenedAt > 450) this.pick(this.sel);
      else if (code === 'KeyR') this.rerollOffer();
      else if (code === 'KeyX') this.skipOffer();
    } else if (this.modal === 'bulletin' && (code === 'Enter' || code === 'Space')) {
      this.continueFromBulletin();
    } else if (this.modal === 'results') {
      this.resultsKey(code);
    }
  }

  private pollPad() {
    const pad = this.input.gamepad?.pad1;
    if (!pad) return;
    const now = {
      left: pad.left || pad.leftStick.x < -0.5, right: pad.right || pad.leftStick.x > 0.5,
      up: pad.up || pad.leftStick.y < -0.5, down: pad.down || pad.leftStick.y > 0.5, a: pad.A,
    };
    if (overlay.isOpen()) {
      if (now.up && !this.pad.up) overlay.press('ArrowUp');
      if (now.down && !this.pad.down) overlay.press('ArrowDown');
      if (now.a && !this.pad.a) overlay.press('Enter');
    } else {
      if (now.left && !this.pad.left) this.onKey('ArrowLeft');
      if (now.right && !this.pad.right) this.onKey('ArrowRight');
      if (now.a && !this.pad.a) this.onKey('Enter');
    }
    this.pad = now;
  }
}
