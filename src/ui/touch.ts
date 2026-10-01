// Touch controls for phones and tablets, drawn on the UI scene (so they scale with the canvas):
// a floating joystick wherever the left thumb lands, and a stomp button on the right that fills as
// its cooldown runs down. Hidden until the first touch, so mouse and keyboard players never see them.
import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';

const STICK_R = 84; // how far the knob travels, in game pixels
// Up and in from the corner, clear of the pause and mute buttons.
const STOMP_X = VIEW_W - 160;
const STOMP_Y = VIEW_H - 250;
const STOMP_R = 74;

export class TouchControls {
  /** Movement from the joystick, length 0..1. */
  readonly move = new Phaser.Math.Vector2();
  private active = false;
  private playing = false;
  private enabled = false;
  private stickId = -1;
  private stompId = -1;
  private stompQueued = false;
  private origin = new Phaser.Math.Vector2();
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private stompBg: Phaser.GameObjects.Arc;
  private stompFill: Phaser.GameObjects.Graphics;
  private stompLabel: Phaser.GameObjects.Text;

  constructor(s: Phaser.Scene) {
    this.base = s.add.circle(0, 0, STICK_R + 26, 0xffffff, 0.08).setStrokeStyle(3, 0xffffff, 0.35).setDepth(40).setVisible(false);
    this.knob = s.add.circle(0, 0, 40, 0x9ffcff, 0.45).setStrokeStyle(3, 0xffffff, 0.7).setDepth(41).setVisible(false);
    this.stompBg = s.add.circle(STOMP_X, STOMP_Y, STOMP_R, 0x05060d, 0.45).setStrokeStyle(4, 0x5ff6ff, 0.8).setDepth(40).setVisible(false);
    this.stompFill = s.add.graphics().setDepth(40).setVisible(false);
    this.stompLabel = s.add
      .text(STOMP_X, STOMP_Y, 'STOMP', { fontFamily: 'Impact, "Arial Black", sans-serif', fontSize: '26px', color: '#ffffff', stroke: '#05060d', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(42)
      .setVisible(false);
    // Any touch on the page counts, including the HTML title menu's Start button.
    window.addEventListener('touchstart', () => (this.enabled = true), { capture: true, passive: true });
    s.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.down(p));
    s.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.drag(p));
    s.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.up(p));
    s.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (p: Phaser.Input.Pointer) => this.up(p));
  }

  /** True once the player has touched the screen. */
  get touched() {
    return this.enabled;
  }

  /** The stomp button was tapped since the last call. */
  takeStomp() {
    const q = this.stompQueued;
    this.stompQueued = false;
    return q;
  }

  /** Show the controls only while the kaiju is being steered (not under menus or cards). */
  update(playing: boolean, stompFrac: number) {
    this.playing = playing;
    const show = this.enabled && playing;
    if (show !== this.active) {
      this.active = show;
      if (!show) this.release();
      this.stompBg.setVisible(show);
      this.stompFill.setVisible(show);
      this.stompLabel.setVisible(show);
    }
    if (!show) return;
    // Cooldown: the ring fills clockwise; the button lights up when the stomp is ready.
    const ready = stompFrac >= 1;
    this.stompBg.setFillStyle(ready ? 0x5ff6ff : 0x05060d, ready ? 0.35 : 0.45);
    this.stompFill.clear();
    if (!ready) {
      this.stompFill.lineStyle(8, 0x5ff6ff, 0.9).beginPath();
      this.stompFill.arc(STOMP_X, STOMP_Y, STOMP_R - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * stompFrac).strokePath();
    }
    this.stompLabel.setAlpha(ready ? 1 : 0.55);
  }

  private down(p: Phaser.Input.Pointer) {
    if (!p.wasTouch) return;
    this.enabled = true;
    if (!this.playing) return; // the controls themselves appear on the next frame
    if (Phaser.Math.Distance.Between(p.x, p.y, STOMP_X, STOMP_Y) < STOMP_R + 24) {
      this.stompId = p.id;
      this.stompQueued = true;
      this.stompBg.setScale(0.92);
      return;
    }
    if (this.stickId !== -1 || p.x > VIEW_W * 0.62) return;
    this.stickId = p.id;
    this.origin.set(p.x, p.y);
    this.base.setPosition(p.x, p.y).setVisible(true);
    this.knob.setPosition(p.x, p.y).setVisible(true);
    this.move.set(0, 0);
  }

  private drag(p: Phaser.Input.Pointer) {
    if (p.id !== this.stickId) return;
    const dx = p.x - this.origin.x, dy = p.y - this.origin.y;
    const d = Math.hypot(dx, dy);
    const k = d > STICK_R ? STICK_R / d : 1;
    this.knob.setPosition(this.origin.x + dx * k, this.origin.y + dy * k);
    // A small dead zone, then full speed well before the rim.
    const m = Math.min(1, Math.max(0, (d - 8) / (STICK_R * 0.7)));
    this.move.set(d > 0 ? (dx / d) * m : 0, d > 0 ? (dy / d) * m : 0);
  }

  private up(p: Phaser.Input.Pointer) {
    if (p.id === this.stompId) {
      this.stompId = -1;
      this.stompBg.setScale(1);
    }
    if (p.id === this.stickId) this.release();
  }

  private release() {
    this.stickId = -1;
    this.move.set(0, 0);
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }
}
