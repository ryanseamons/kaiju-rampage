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
  input: { gamepad: true },
  fps: { target: 60 },
  render: { powerPreference: 'high-performance' },
  scene: [BootScene, GameScene, UIScene],
});
(window as unknown as { __kaijuGame: Phaser.Game }).__kaijuGame = game;

// High-refresh displays (120 Hz ProMotion, 144 Hz monitors) would have Phaser update and draw at the
// display's rate: double the work for no gameplay benefit, and stutter on a busy machine. Measure the
// refresh rate once and, only above ~75 Hz, step the game at ~60 fps. (A plain 60 fps limit misfires
// on 60 Hz screens: a frame arriving a hair early gets skipped, giving 33 ms hitches.)
{
  const gaps: number[] = [];
  let last = 0;
  const probe = (t: number) => {
    if (last) gaps.push(t - last);
    last = t;
    if (gaps.length < 40) return void requestAnimationFrame(probe);
    gaps.sort((a, b) => a - b);
    const median = gaps[gaps.length >> 1];
    if (median < 13) {
      const loop = game.loop as unknown as { fpsLimit: number; hasFpsLimit: boolean; _limitRate: number; sleep(): void; wake(): void };
      loop.fpsLimit = 60;
      loop.hasFpsLimit = true;
      loop._limitRate = 15; // a step every other 120 Hz frame (16.7 ms); tolerant of jitter
      loop.sleep();
      loop.wake();
      console.info(`[perf] ${Math.round(1000 / median)} Hz display: game stepped at ~60 fps`);
    }
  };
  requestAnimationFrame(probe);
}
