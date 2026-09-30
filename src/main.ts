import Phaser from 'phaser';
import './style.css';
import { RENDERER, VIEW_H, VIEW_W } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

new Phaser.Game({
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
  scene: [BootScene, GameScene, UIScene],
});
