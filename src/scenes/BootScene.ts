import Phaser from 'phaser';
import { generateTextures } from '../textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateTextures(this);
    const a = this.anims;
    a.create({ key: 'kaiju-walk', frames: [{ key: 'kaiju0' }, { key: 'kaiju1' }], frameRate: 6, repeat: -1 });
    a.create({ key: 'soldier-walk', frames: [{ key: 'soldier0' }, { key: 'soldier1' }], frameRate: 8, repeat: -1 });
    a.create({ key: 'mech-walk', frames: [{ key: 'mech0' }, { key: 'mech1' }], frameRate: 3, repeat: -1 });
    this.scene.launch('UI');
    this.scene.start('Game');
  }
}
