import Phaser from 'phaser';
import './style.css';
import { RENDERER, VIEW_H, VIEW_W } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const game = new Phaser.Game({
  type: RENDERER === 'canvas' ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#05060d',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  // Three pointers: a thumb on the joystick and another on stomp at the same time.
  input: { gamepad: true, activePointers: 3 },
  fps: { target: 60 },
  render: { powerPreference: 'high-performance' },
  scene: [BootScene, GameScene, UIScene],
});
(window as unknown as { __kaijuGame: Phaser.Game }).__kaijuGame = game;

// High-refresh displays (120 Hz ProMotion, 144 Hz monitors) would have Phaser update and draw at the
// display's rate: double the work for no gameplay benefit, and stutter on a busy machine. Measure the
// refresh rate and, only above ~75 Hz, step the game every Nth display frame (120 Hz → 60 fps,
// 144 Hz → 72, 240 Hz → 60). Whole frames only: a plain 60 fps limit skips a step every so often
// (144 Hz gave 48 fps, 60 Hz gave 33 ms hitches). The first frames are slow while the textures are
// built, so the probe keeps measuring in short windows until it sees the display's real rate.
{
  const gaps: number[] = [];
  let last = 0;
  let windows = 0;
  const probe = (t: number) => {
    if (last) gaps.push(t - last);
    last = t;
    if (gaps.length < 30) return void requestAnimationFrame(probe);
    gaps.sort((a, b) => a - b);
    const frame = gaps[gaps.length >> 1];
    gaps.length = 0;
    last = 0;
    const every = Math.floor(1000 / frame / 60 + 0.1);
    if (every >= 2) {
      const loop = game.loop as unknown as { fpsLimit: number; hasFpsLimit: boolean; _limitRate: number; sleep(): void; wake(): void };
      loop.fpsLimit = Math.round(1000 / frame / every);
      loop.hasFpsLimit = true;
      loop._limitRate = frame * (every - 0.5); // tolerant of half a frame of jitter either way
      loop.sleep();
      loop.wake();
      console.info(`[perf] ${Math.round(1000 / frame)} Hz display: game stepped every ${every} frames (~${loop.fpsLimit} fps)`);
    } else if (++windows < 12) setTimeout(() => requestAnimationFrame(probe), 400);
  };
  requestAnimationFrame(probe);
}
