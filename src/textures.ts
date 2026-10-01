// Every sprite in the game is drawn here at boot with Canvas 2D. No image files.
// Shapes are drawn with normal canvas calls, then alpha is hard-thresholded and a
// 1px outline is added, which gives a crisp pixel-art look.
import Phaser from 'phaser';
import { TILE } from './config';
import { mulberry32 } from './rng';
import { STAGE_DEF as SD } from './stages';

type Ctx = CanvasRenderingContext2D;

const OUTLINE: [number, number, number] = [8, 8, 18];

function pixelTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void, outline = true) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 100 ? 255 : 0;
  if (outline) {
    const solid = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) solid[p] = d[p * 4 + 3] ? 1 : 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (solid[p]) continue;
        const n =
          (x > 0 && solid[p - 1]) || (x < w - 1 && solid[p + 1]) || (y > 0 && solid[p - w]) || (y < h - 1 && solid[p + w]);
        if (n) {
          d[p * 4] = OUTLINE[0];
          d[p * 4 + 1] = OUTLINE[1];
          d[p * 4 + 2] = OUTLINE[2];
          d[p * 4 + 3] = 255;
        }
      }
  }
  ctx.putImageData(img, 0, 0);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

function softTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  scene.textures.addCanvas(key, canvas);
}

const ell = (c: Ctx, x: number, y: number, rx: number, ry: number, color: string) => {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
};
const rect = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
};
const poly = (c: Ctx, pts: number[], color: string) => {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fill();
};

// ── Kaiju ────────────────────────────────────────────────────────────────────
function drawKaiju(c: Ctx, frame: 0 | 1 | 2) {
  const dark = '#1f5a3a', mid = '#2f8a4f', light = '#56c46a', belly = '#e6d58a', spine = '#5ff6ff';
  // tail
  poly(c, [1, 17, 10, 12, 11, 19, 4, 20], dark);
  poly(c, [1, 17, 6, 15, 7, 18], mid);
  // legs (behind body)
  const legA = frame === 1 ? 1 : 0;
  rect(c, 8 - legA, 18, 4, 5 + legA, dark);
  rect(c, 15 + legA, 18, 4, 5 - legA, dark);
  rect(c, 7 - legA, 22 + legA, 6, 2, '#10301f');
  rect(c, 14 + legA, 22 - legA, 6, 2, '#10301f');
  // body
  ell(c, 13, 14, 7, 6, mid);
  ell(c, 14, 16, 4.5, 3.5, belly);
  // spines
  poly(c, [6, 11, 8, 5, 10, 10], spine);
  poly(c, [9, 9, 12, 3, 13, 9], spine);
  poly(c, [13, 8, 16, 2, 17, 8], spine);
  // head
  ell(c, 20, 8, 4.5, 4, mid);
  rect(c, 21, 7, 6, 5, mid);
  rect(c, 21, 6, 5, 2, light);
  // mouth
  if (frame === 2) {
    rect(c, 22, 10, 6, 3, '#3a0c12');
    rect(c, 23, 10, 1, 1, '#ffffff');
    rect(c, 25, 10, 1, 1, '#ffffff');
    rect(c, 24, 12, 1, 1, '#ffffff');
  } else {
    rect(c, 22, 10, 5, 1, '#10301f');
  }
  // eye
  rect(c, 21, 6, 2, 2, '#ffe14a');
  rect(c, 22, 6, 1, 1, '#ff3b3b');
  // arm + claws
  rect(c, 17, 12, 4, 3, light);
  rect(c, 21, 13, 1, 1, '#ffffff');
  rect(c, 21, 15, 1, 1, '#ffffff');
  // belly highlight
  rect(c, 10, 11, 5, 1, light);
}

// ── Military ─────────────────────────────────────────────────────────────────
function drawSoldier(c: Ctx, frame: 0 | 1) {
  rect(c, 1 + frame, 7, 2, 2, '#1d2415');
  rect(c, 4 - frame, 7, 2, 2, '#1d2415');
  rect(c, 1, 3, 5, 5, '#5c6b3a');
  ell(c, 3.5, 2.5, 2.5, 2.2, '#3f4a28');
  rect(c, 5, 4, 3, 1, '#222');
}

function drawRocket(c: Ctx, frame: 0 | 1) {
  rect(c, 1 + frame, 7, 2, 2, '#1d2415');
  rect(c, 4 - frame, 7, 2, 2, '#1d2415');
  rect(c, 1, 3, 5, 5, '#46567a');
  ell(c, 3.5, 2.5, 2.5, 2.2, '#2f3b58');
  rect(c, 3, 1, 6, 2, '#8a8f99'); // launcher tube on the shoulder
  rect(c, 8, 1, 1, 2, '#ffb040');
}

function drawHeli(c: Ctx, frame: 0 | 1) {
  // tail boom + rotor
  rect(c, 1, 9, 10, 2, '#3f4a28');
  rect(c, 0, 7, 2, 6, '#2c3320');
  ell(c, 16, 10, 7, 4.5, '#5d6a3c');
  ell(c, 19, 10, 3, 2.5, '#9fd4ff');
  rect(c, 13, 6, 4, 1, '#2c3320');
  c.strokeStyle = 'rgba(210,220,230,0.9)';
  c.lineWidth = 1;
  c.beginPath();
  if (frame === 0) { c.moveTo(5, 10); c.lineTo(27, 10); c.moveTo(16, 1); c.lineTo(16, 19); }
  else { c.moveTo(8, 3); c.lineTo(24, 17); c.moveTo(24, 3); c.lineTo(8, 17); }
  c.stroke();
}

function drawCannon(c: Ctx) {
  rect(c, 0, 1, 20, 10, '#3a4155');
  rect(c, 15, 2, 5, 8, '#23283a');
  rect(c, 16, 3, 3, 3, '#9fd4ff');
  ell(c, 7, 6, 4.5, 4.5, '#6d7890');
  ell(c, 7, 6, 2.5, 2.5, '#5ff6ff');
  rect(c, 1, 0, 3, 1, '#1a1d28');
  rect(c, 1, 11, 3, 1, '#1a1d28');
  rect(c, 12, 0, 3, 1, '#1a1d28');
  rect(c, 12, 11, 3, 1, '#1a1d28');
}

function drawJet(c: Ctx) {
  poly(c, [24, 7, 4, 0, 8, 7, 4, 14], '#8a93a8');
  poly(c, [24, 7, 12, 5, 12, 9], '#c9d0de');
  rect(c, 0, 6, 6, 2, '#ff9a3b');
  rect(c, 19, 6, 3, 2, '#9fd4ff');
}

function drawTankHull(c: Ctx) {
  rect(c, 0, 0, 20, 4, '#262a1c');
  rect(c, 0, 12, 20, 4, '#262a1c');
  for (let x = 1; x < 20; x += 3) {
    rect(c, x, 1, 1, 2, '#4a5034');
    rect(c, x, 13, 1, 2, '#4a5034');
  }
  rect(c, 1, 3, 18, 10, '#5d6a3c');
  rect(c, 2, 4, 16, 2, '#76854c');
  rect(c, 16, 6, 3, 4, '#3f4a28');
}

function drawTankTurret(c: Ctx) {
  rect(c, 8, 3, 12, 2, '#2c3320');
  ell(c, 6, 4, 5, 3.5, '#6b7a44');
  rect(c, 4, 2, 3, 2, '#8a9a5a');
}

function drawMech(c: Ctx, frame: 0 | 1) {
  const steel = '#6d7890', dark = '#3a4155', light = '#aab6cc', red = '#ff3355';
  const s = frame ? 1 : 0;
  // legs
  rect(c, 10 - s, 32, 7, 13 + s, dark);
  rect(c, 27 + s, 32, 7, 13 - s, dark);
  rect(c, 8 - s, 44 + s, 11, 4 - s, '#23283a');
  rect(c, 25 + s, 44 - s, 11, 4 + s, '#23283a');
  // torso
  poly(c, [6, 12, 38, 12, 34, 34, 10, 34], steel);
  rect(c, 12, 16, 20, 6, light);
  rect(c, 18, 24, 8, 6, '#ffb400');
  // shoulders + arms
  rect(c, 1, 12, 7, 8, dark);
  rect(c, 36, 12, 7, 8, dark);
  rect(c, 2, 20, 5, 12, steel);
  rect(c, 37, 20, 5, 12, steel);
  rect(c, 1, 31, 7, 4, '#23283a');
  rect(c, 36, 31, 7, 4, '#23283a');
  // head
  rect(c, 15, 3, 14, 10, steel);
  rect(c, 16, 7, 12, 3, red);
  rect(c, 21, 0, 2, 4, light);
  // missile pods
  rect(c, 8, 9, 6, 4, '#2d3346');
  rect(c, 30, 9, 6, 4, '#2d3346');
}

// ── City ─────────────────────────────────────────────────────────────────────
// Palettes come from the stage (src/stages.ts); Shiokaze Bay is the original look.
const ROOFS = SD.roofs;
const WINDOW_LIT = SD.windowLit;

function drawHouse(c: Ctx, v: number) {
  const r = mulberry32(v * 101 + 7);
  const roof = ROOFS[v % ROOFS.length];
  // facade (below roof) – 3/4 view
  rect(c, 2, 20, 26, 12, '#2b2a3a');
  rect(c, 2, 20, 26, 2, '#3b3a50');
  for (let i = 0; i < 3; i++) {
    const lit = r() < 0.6;
    rect(c, 5 + i * 8, 24, 4, 4, lit ? WINDOW_LIT[Math.floor(r() * 2)] : '#15141f');
  }
  // roof
  poly(c, [0, 20, 15, 2, 30, 20], roof);
  poly(c, [15, 2, 30, 20, 15, 20], shade(roof, -0.25));
  rect(c, 14, 2, 2, 18, shade(roof, 0.2));
  if (SD.snow) {
    poly(c, [3, 17, 15, 4, 27, 17, 22, 14, 15, 8, 8, 14], '#eef3fa');
    rect(c, 2, 19, 26, 1, '#eef3fa');
  }
}

function drawTower(c: Ctx, v: number) {
  const r = mulberry32(v * 977 + 3);
  const w = 60, roofH = 56, faceH = 30;
  const body = SD.towerBodies[v % SD.towerBodies.length];
  // facade with window grid
  rect(c, 0, roofH - 4, w, faceH + 4, shade(body, -0.15));
  for (let y = roofH; y < roofH + faceH - 3; y += 6)
    for (let x = 3; x < w - 3; x += 6) {
      const lit = r() < 0.55;
      rect(c, x, y, 3, 3, lit ? WINDOW_LIT[Math.floor(r() * WINDOW_LIT.length)] : '#10111c');
    }
  // roof slab
  rect(c, 0, 0, w, roofH, body);
  rect(c, 3, 3, w - 6, roofH - 6, shade(body, 0.12));
  // rooftop clutter
  rect(c, 8, 8, 12, 8, '#4a4f66');
  rect(c, 38, 30, 14, 10, '#4a4f66');
  rect(c, 40, 32, 4, 4, '#6a7090');
  ell(c, 16, 40, 6, 6, '#3a3f55');
  rect(c, 44, 8, 2, 14, '#9aa0b8');
  rect(c, 44, 6, 2, 2, '#ff3355');
  if (SD.snow) rect(c, 3, 3, w - 6, 10, '#e6edf6');
  if (mulberry32(v * 31 + 5)() < SD.neonSigns) {
    // neon sign on the facade
    rect(c, 10, roofH + 6, 40, 8, '#12060f');
    rect(c, 12, roofH + 8, 36, 4, ['#ff3fa4', '#3ff0ff', '#ffe23f', '#c08aff'][v % 4]);
  }
}

// ── Landmarks ────────────────────────────────────────────────────────────────
/** Five-storey pagoda: stacked flared roofs over red walls, a gold spire. 60 x 104. */
function drawPagoda(c: Ctx) {
  const roof = '#2c3444', edge = '#56627a', wall = '#9a2a2a';
  rect(c, 28, 0, 4, 14, '#e0b23b');
  for (let i = 0; i < 5; i++) ell(c, 30, 3 + i * 2.4, 3 - i * 0.3, 1, '#ffd66b');
  for (let i = 0; i < 5; i++) {
    const y = 16 + i * 17, hw = 12 + i * 4.5;
    rect(c, 30 - hw * 0.62, y + 6, hw * 1.24, 11, wall);
    rect(c, 30 - hw * 0.62, y + 6, hw * 1.24, 2, shade(wall, 0.2));
    rect(c, 27, y + 9, 6, 7, i % 2 ? '#ffd66b' : '#2a0e0e');
    poly(c, [30 - hw - 3, y + 8, 30 - hw, y + 3, 30, y - 2, 30 + hw, y + 3, 30 + hw + 3, y + 8, 30, y + 5], roof);
    poly(c, [30 - hw - 3, y + 8, 30, y + 5, 30 + hw + 3, y + 8, 30, y + 7], edge);
  }
  rect(c, 8, 98, 44, 6, '#6a6a76');
  rect(c, 8, 98, 44, 1, '#8a8a96');
}

/** Castle keep on a stone base: white walls, dark tiered roofs, gold ornaments. 62 x 106. */
function drawCastle(c: Ctx) {
  const roof = '#34454c', edge = '#6a8088', wall = '#e8e4d8';
  poly(c, [0, 106, 6, 76, 56, 76, 62, 106], '#5a5a66');
  for (let y = 80; y < 106; y += 6) rect(c, 2, y, 58, 1, '#44444e');
  for (let y = 80, o = 0; y < 106; y += 6, o = 1 - o) for (let x = 4 + o * 5; x < 58; x += 10) rect(c, x, y, 1, 6, '#44444e');
  const tiers: [number, number, number][] = [[58, 24, 18], [38, 20, 14], [20, 15, 11]];
  for (const [y, hw, wh] of tiers) {
    rect(c, 31 - hw * 0.75, y + 4, hw * 1.5, wh, wall);
    for (let x = 31 - hw * 0.6; x < 31 + hw * 0.6; x += 7) rect(c, x, y + 7, 3, 4, '#23283a');
    poly(c, [31 - hw - 4, y + 5, 31 - hw + 2, y - 3, 31 + hw - 2, y - 3, 31 + hw + 4, y + 5], roof);
    rect(c, 31 - hw - 4, y + 4, hw * 2 + 8, 1, edge);
    poly(c, [31 - 6, y - 3, 31, y - 9, 31 + 6, y - 3], shade(roof, 0.15)); // gable
  }
  rect(c, 22, 6, 18, 12, wall);
  poly(c, [16, 10, 22, 2, 40, 2, 46, 10], roof);
  ell(c, 21, 2, 2, 2, '#e0b23b');
  ell(c, 41, 2, 2, 2, '#e0b23b');
}

/** The KBN-7 broadcast tower: a red-and-white lattice with an observation deck. 60 x 150. */
function drawTvTower(c: Ctx) {
  rect(c, 29, 0, 2, 20, '#c8ccd8');
  rect(c, 28, 0, 4, 2, '#ff3355');
  for (let y = 20; y < 150; y += 8) {
    const hw = 3 + ((y - 20) / 130) ** 1.4 * 24;
    const band = Math.floor(y / 16) % 2 ? '#e04040' : '#f0f0f0';
    rect(c, 30 - hw, y, 2, 8, band);
    rect(c, 30 + hw - 2, y, 2, 8, band);
    poly(c, [30 - hw, y, 30 + hw, y + 8, 30 + hw - 2, y + 8, 30 - hw + 2, y], shade(band, -0.25));
    rect(c, 30 - hw, y + 7, hw * 2, 1, band);
  }
  ell(c, 30, 58, 15, 6, '#2a2f44');
  ell(c, 30, 56, 15, 4, '#3a4058');
  for (let x = 18; x < 43; x += 4) rect(c, x, 57, 2, 2, WINDOW_LIT[x % 3 ? 0 : 1]);
  rect(c, 22, 88, 16, 4, '#2a2f44');
  rect(c, 6, 146, 48, 4, '#4a4f66');
}

/** A vermilion torii gate. 30 x 30 (house-sized). */
function drawTorii(c: Ctx) {
  const red = '#d23a2a';
  rect(c, 6, 9, 3, 21, red);
  rect(c, 21, 9, 3, 21, red);
  rect(c, 3, 11, 24, 2, red);
  poly(c, [0, 5, 30, 5, 28, 8, 2, 8], '#1a1418');
  rect(c, 2, 3, 26, 2, '#1a1418');
  rect(c, 13, 8, 4, 3, red);
  rect(c, 5, 28, 5, 2, '#3a3a44');
  rect(c, 20, 28, 5, 2, '#3a3a44');
}

function drawWarehouse(c: Ctx, v: number) {
  const w = 62, roofH = 34;
  const roof = ['#3b4a5a', '#5a4a3b', '#3b5a4a'][v % 3];
  rect(c, 0, roofH - 2, w, 12, '#23222e');
  rect(c, 8, roofH + 2, 14, 8, '#3a3848');
  rect(c, 36, roofH + 2, 14, 8, '#3a3848');
  rect(c, 26, roofH + 2, 4, 3, '#ffd66b');
  rect(c, 0, 0, w, roofH, roof);
  for (let x = 2; x < w; x += 6) rect(c, x, 0, 2, roofH, shade(roof, 0.15));
}

function drawCar(c: Ctx, v: number) {
  const body = ['#c23b3b', '#3b6bc2', '#e0e0e0', '#e0b23b', '#3bc27a', '#8a3bc2'][v % 6];
  rect(c, 0, 1, 14, 7, body);
  rect(c, 4, 2, 6, 5, shade(body, -0.35));
  rect(c, 5, 3, 4, 3, '#9fd4ff');
  rect(c, 13, 1, 1, 2, '#fff6b0');
  rect(c, 13, 6, 1, 2, '#fff6b0');
  rect(c, 0, 1, 1, 2, '#ff2a2a');
  rect(c, 0, 6, 1, 2, '#ff2a2a');
}

function drawTree(c: Ctx, v: number) {
  rect(c, 6, 10, 3, 4, '#3a2a1c');
  const leaf = SD.leaves[v % SD.leaves.length];
  if (SD.snow) {
    // a snowy pine
    poly(c, [7.5, 0, 14, 11, 1, 11], leaf);
    poly(c, [7.5, 0, 11, 6, 4, 6], '#eef3fa');
    rect(c, 3, 9, 9, 1, '#eef3fa');
    return;
  }
  ell(c, 7.5, 7, 6.5, 6, leaf);
  ell(c, 6, 5, 3, 2.5, shade(leaf, 0.35));
}

/** Night-market food stall: a striped awning over a counter. 16 x 14 (car-sized, crushable). */
function drawStall(c: Ctx, v: number) {
  const stripe = ['#d23a2a', '#e0a02a', '#2a7ad2', '#2aa05a'][v % 4];
  rect(c, 1, 7, 14, 6, '#5a3a2a');
  rect(c, 2, 8, 12, 2, '#ffd38a');
  for (let x = 0; x < 16; x += 4) rect(c, x, 2, 2, 5, stripe), rect(c, x + 2, 2, 2, 5, '#f2e6d0');
  rect(c, 0, 1, 16, 1, shade(stripe, -0.3));
  ell(c, 4, 11, 1.5, 1, '#ffb24a');
}

/** Fuel tank: a squat cylinder with hazard stripes. 30 x 32 (house-sized; explodes). */
function drawFuelTank(c: Ctx) {
  ell(c, 15, 26, 14, 5, '#3a3a36');
  rect(c, 1, 9, 28, 17, '#c8c2b0');
  rect(c, 1, 9, 6, 17, '#a8a290');
  for (let x = 2; x < 28; x += 6) poly(c, [x, 20, x + 3, 20, x + 6, 24, x + 3, 24], '#d0a020');
  ell(c, 15, 9, 14, 5, '#e2dccb');
  ell(c, 15, 9, 6, 2, '#a8a290');
  rect(c, 22, 4, 2, 6, '#7a7468');
  rect(c, 19, 13, 8, 4, '#d23a2a');
}

/** Container crane: a tall red gantry. 60 x 140 (tower-sized). */
function drawCrane(c: Ctx) {
  const red = '#c23a2a';
  rect(c, 6, 40, 4, 100, red);
  rect(c, 50, 40, 4, 100, red);
  for (let y = 48; y < 136; y += 16) poly(c, [10, y, 50, y + 12, 50, y + 14, 10, y + 2], shade(red, -0.25));
  rect(c, 0, 30, 60, 10, red);
  rect(c, 0, 30, 60, 2, shade(red, 0.25));
  rect(c, 20, 0, 6, 30, red);
  poly(c, [23, 0, 58, 30, 54, 30, 23, 4], shade(red, -0.15));
  rect(c, 30, 40, 1, 40, '#2a2a2a');
  rect(c, 24, 80, 14, 10, '#3a7ad2');
  rect(c, 2, 136, 56, 4, '#4a4a4a');
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? x + (255 - x) * amt : x * (1 + amt))));
  r = f(r); g = f(g); b = f(b);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ── Tiles ────────────────────────────────────────────────────────────────────
export const T = {
  lot: 0, sidewalk: 1, road: 2, roadH: 3, roadV: 4, cross: 5, park: 6, sand: 7, waterA: 8, waterB: 9, dock: 10, scorch: 11,
} as const;

function drawTiles(scene: Phaser.Scene) {
  const n = 12;
  const canvas = document.createElement('canvas');
  canvas.width = TILE * n;
  canvas.height = TILE;
  const c = canvas.getContext('2d')!;
  const r = mulberry32(42);
  const noise = (ox: number, base: string, amt: number, count: number) => {
    for (let i = 0; i < count; i++) rect(c, ox + Math.floor(r() * TILE), Math.floor(r() * TILE), 1, 1, shade(base, (r() - 0.5) * amt));
  };
  const at = (i: number) => i * TILE;
  rect(c, at(T.lot), 0, TILE, TILE, SD.lot); noise(at(T.lot), SD.lot, 0.4, 40);
  rect(c, at(T.sidewalk), 0, TILE, TILE, SD.sidewalk);
  for (let k = 0; k < TILE; k += 8) { rect(c, at(T.sidewalk) + k, 0, 1, TILE, shade(SD.sidewalk, -0.15)); rect(c, at(T.sidewalk), k, TILE, 1, shade(SD.sidewalk, -0.15)); }
  for (const i of [T.road, T.roadH, T.roadV, T.cross]) {
    rect(c, at(i), 0, TILE, TILE, SD.road); noise(at(i), SD.road, 0.5, 30);
    if (SD.weather === 'rain') for (let k = 0; k < 3; k++) rect(c, at(i) + Math.floor(r() * 24), Math.floor(r() * 28), 6 + Math.floor(r() * 6), 2, '#2a4a6a'); // flooded
  }
  rect(c, at(T.roadH) + 4, 30, 10, 2, SD.roadLine); rect(c, at(T.roadH) + 20, 30, 10, 2, SD.roadLine);
  rect(c, at(T.roadV) + 30, 4, 2, 10, SD.roadLine); rect(c, at(T.roadV) + 30, 20, 2, 10, SD.roadLine);
  for (let k = 2; k < TILE; k += 6) rect(c, at(T.cross) + k, 2, 3, 6, '#3a3c4a');
  rect(c, at(T.park), 0, TILE, TILE, SD.park); noise(at(T.park), SD.parkHi, 0.6, 60);
  rect(c, at(T.sand), 0, TILE, TILE, SD.sand); noise(at(T.sand), shade(SD.sand, 0.15), 0.5, 50);
  for (const [i, off] of [[T.waterA, 0], [T.waterB, 8]] as const) {
    rect(c, at(i), 0, TILE, TILE, SD.water);
    for (let y = 4; y < TILE; y += 10) rect(c, at(i) + ((y + off) % 20), y, 8, 1, SD.waterHi);
    rect(c, at(i) + ((off + 13) % 28), (off + 22) % 30, 3, 1, '#5aa0d8');
  }
  rect(c, at(T.dock), 0, TILE, TILE, '#3b2f28');
  for (let y = 0; y < TILE; y += 6) rect(c, at(T.dock), y, TILE, 1, '#241c18');
  rect(c, at(T.scorch), 0, TILE, TILE, '#15131a'); noise(at(T.scorch), '#2a2020', 0.7, 80);
  scene.textures.addCanvas('tiles', canvas);
}

export function generateTextures(scene: Phaser.Scene) {
  drawTiles(scene);
  pixelTex(scene, 'kaiju0', 28, 25, (c) => drawKaiju(c, 0));
  pixelTex(scene, 'kaiju1', 28, 25, (c) => drawKaiju(c, 1));
  pixelTex(scene, 'kaiju2', 28, 25, (c) => drawKaiju(c, 2));
  pixelTex(scene, 'soldier0', 9, 10, (c) => drawSoldier(c, 0));
  pixelTex(scene, 'soldier1', 9, 10, (c) => drawSoldier(c, 1));
  pixelTex(scene, 'tankHull', 20, 16, drawTankHull);
  pixelTex(scene, 'tankTurret', 20, 8, drawTankTurret, false);
  pixelTex(scene, 'rocket0', 10, 10, (c) => drawRocket(c, 0));
  pixelTex(scene, 'rocket1', 10, 10, (c) => drawRocket(c, 1));
  pixelTex(scene, 'heli0', 28, 20, (c) => drawHeli(c, 0));
  pixelTex(scene, 'heli1', 28, 20, (c) => drawHeli(c, 1));
  pixelTex(scene, 'cannon', 20, 12, drawCannon);
  pixelTex(scene, 'jet', 25, 15, drawJet);
  pixelTex(scene, 'crate', 14, 12, (c) => {
    rect(c, 0, 2, 14, 10, '#6b5a2f');
    rect(c, 0, 2, 14, 2, '#8a7640');
    for (let x = 1; x < 14; x += 4) poly(c, [x, 12, x + 2, 12, x + 4, 4, x + 2, 4], '#e0b23b');
    rect(c, 5, 0, 4, 3, '#ff5fd2');
  });
  pixelTex(scene, 'itemMagnet', 11, 11, (c) => {
    c.strokeStyle = '#e8384f'; c.lineWidth = 3; c.beginPath(); c.arc(5.5, 5, 3.5, Math.PI, 0, true); c.stroke();
    rect(c, 1, 5, 3, 4, '#e8384f'); rect(c, 7, 5, 3, 4, '#e8384f');
    rect(c, 1, 8, 3, 2, '#dfe6ff'); rect(c, 7, 8, 3, 2, '#dfe6ff');
  });
  pixelTex(scene, 'itemQuake', 11, 11, (c) => {
    ell(c, 5.5, 5.5, 5, 5, '#c26a2a'); ell(c, 5.5, 5.5, 3, 3, '#ffb13b');
    c.strokeStyle = '#3a1a0a'; c.lineWidth = 1; c.beginPath(); c.moveTo(2, 4); c.lineTo(5, 6); c.lineTo(4, 9); c.moveTo(6, 2); c.lineTo(7, 5); c.lineTo(10, 6); c.stroke();
  });
  pixelTex(scene, 'itemRage', 11, 11, (c) => {
    ell(c, 5.5, 5.5, 5, 5, '#d7263d'); ell(c, 7.5, 4.5, 4, 4, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'destination-out'; ell(c, 7.5, 4, 3.6, 3.6, '#000'); c.globalCompositeOperation = 'source-over';
    rect(c, 3, 6, 1, 1, '#ffd0d8');
  });
  pixelTex(scene, 'mech0', 44, 49, (c) => drawMech(c, 0));
  pixelTex(scene, 'mech1', 44, 49, (c) => drawMech(c, 1));
  for (let v = 0; v < 6; v++) {
    pixelTex(scene, `car${v}`, 14, 9, (c) => drawCar(c, v));
    if (v < 4) pixelTex(scene, `stall${v}`, 16, 14, (c) => drawStall(c, v));
    pixelTex(scene, `house${v}`, 30, 32, (c) => drawHouse(c, v));
    pixelTex(scene, `tower${v}`, 60, 86, (c) => drawTower(c, v));
  }
  for (let v = 0; v < 3; v++) {
    pixelTex(scene, `warehouse${v}`, 62, 46, (c) => drawWarehouse(c, v));
    pixelTex(scene, `tree${v}`, 15, 14, (c) => drawTree(c, v));
  }
  pixelTex(scene, 'pagoda', 60, 104, drawPagoda);
  pixelTex(scene, 'castle', 62, 106, drawCastle);
  pixelTex(scene, 'tvtower', 60, 150, drawTvTower);
  pixelTex(scene, 'torii', 30, 30, drawTorii);
  pixelTex(scene, 'fueltank', 30, 32, drawFuelTank);
  pixelTex(scene, 'crane', 60, 140, drawCrane);
  softTex(scene, 'lantern', 24, 24, (c) => {
    const g = c.createRadialGradient(12, 12, 1, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,190,90,0.95)');
    g.addColorStop(0.3, 'rgba(255,120,40,0.55)');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 24, 24);
  });
  softTex(scene, 'rain', 128, 128, (c) => {
    const r = mulberry32(9);
    c.strokeStyle = 'rgba(170,200,255,0.55)';
    c.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const x = r() * 128, y = r() * 128;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - 4, y + 14);
      c.stroke();
    }
  });
  softTex(scene, 'snowfall', 128, 128, (c) => {
    const r = mulberry32(11);
    for (let i = 0; i < 60; i++) {
      c.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.5})`;
      c.beginPath();
      c.arc(r() * 128, r() * 128, 0.6 + r() * 1.4, 0, Math.PI * 2);
      c.fill();
    }
  });
  // pickups & projectiles
  pixelTex(scene, 'gem', 7, 9, (c) => { poly(c, [3.5, 0, 7, 4.5, 3.5, 9, 0, 4.5], '#4dffb0'); rect(c, 2, 3, 2, 2, '#e8fff4'); });
  pixelTex(scene, 'gemBig', 11, 13, (c) => { poly(c, [5.5, 0, 11, 6.5, 5.5, 13, 0, 6.5], '#ff5fd2'); rect(c, 3, 4, 3, 3, '#fff0fb'); });
  pixelTex(scene, 'heart', 9, 8, (c) => { ell(c, 2.5, 2.5, 2.5, 2.5, '#ff4466'); ell(c, 6.5, 2.5, 2.5, 2.5, '#ff4466'); poly(c, [0, 3, 9, 3, 4.5, 8], '#ff4466'); rect(c, 2, 1, 1, 1, '#fff'); });
  pixelTex(scene, 'bullet', 3, 3, (c) => rect(c, 0, 0, 3, 3, '#ffe66b'), false);
  pixelTex(scene, 'shell', 6, 6, (c) => ell(c, 3, 3, 3, 3, '#ff9a3b'));
  pixelTex(scene, 'missile', 10, 4, (c) => { rect(c, 0, 1, 8, 2, '#dddddd'); rect(c, 8, 1, 2, 2, '#ff3355'); rect(c, 0, 0, 2, 4, '#888'); });
  pixelTex(scene, 'spine', 10, 4, (c) => { poly(c, [0, 0, 10, 2, 0, 4], '#5ff6ff'); });
  pixelTex(scene, 'px', 2, 2, (c) => rect(c, 0, 0, 2, 2, '#ffffff'), false);
  pixelTex(scene, 'chunk', 5, 5, (c) => { rect(c, 0, 0, 5, 5, '#8a8aa0'); rect(c, 0, 0, 3, 2, '#b4b4c8'); }, false);
  pixelTex(scene, 'rubble', 30, 22, (c) => {
    const r = mulberry32(5);
    for (let i = 0; i < 26; i++) rect(c, Math.floor(r() * 26), 4 + Math.floor(r() * 16), 2 + Math.floor(r() * 4), 2 + Math.floor(r() * 3), shade('#4a4658', (r() - 0.5) * 0.6));
  });
  pixelTex(scene, 'claw', 32, 32, (c) => {
    c.strokeStyle = '#ffffff'; c.lineWidth = 3;
    for (const off of [-5, 0, 5]) { c.beginPath(); c.arc(8, 16 + off, 18, -0.9, 0.9); c.stroke(); }
  }, false);
  softTex(scene, 'smoke', 24, 24, (c) => {
    const g = c.createRadialGradient(12, 12, 1, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 24, 24);
  });
  softTex(scene, 'glow', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(0.4, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
  softTex(scene, 'ring', 128, 128, (c) => {
    c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 12; c.beginPath(); c.arc(64, 64, 52, 0, Math.PI * 2); c.stroke();
  });
  softTex(scene, 'shadow', 32, 16, (c) => {
    const g = c.createRadialGradient(16, 8, 1, 16, 8, 16);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 16);
  });
  softTex(scene, 'beam', 64, 16, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 16);
    g.addColorStop(0, 'rgba(95,246,255,0)'); g.addColorStop(0.5, 'rgba(230,255,255,1)'); g.addColorStop(1, 'rgba(95,246,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 16);
  });
  softTex(scene, 'vignette', 256, 144, (c) => {
    const g = c.createRadialGradient(128, 72, 40, 128, 72, 150);
    g.addColorStop(0, 'rgba(0,0,10,0)'); g.addColorStop(1, 'rgba(0,0,10,0.75)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 144);
  });
  // Fictional pixel news anchor (generic figure behind a desk).
  pixelTex(scene, 'anchor', 26, 30, (c) => {
    rect(c, 6, 13, 14, 12, '#23304f'); // suit
    poly(c, [11, 13, 15, 13, 13, 19], '#e8e8f0'); // shirt
    rect(c, 12, 14, 2, 5, '#b8283a'); // tie
    ell(c, 13, 8, 5, 5.5, '#e0b08a'); // face
    ell(c, 13, 4.5, 5.5, 3.5, '#2a1c14'); // hair
    rect(c, 7, 4, 2, 6, '#2a1c14');
    rect(c, 11, 8, 1, 1, '#1a1010');
    rect(c, 15, 8, 1, 1, '#1a1010');
    rect(c, 12, 11, 3, 1, '#9a5a4a');
    rect(c, 0, 23, 26, 7, '#4a3a5a'); // desk
    rect(c, 0, 23, 26, 2, '#6a5a7a');
    rect(c, 18, 21, 5, 3, '#e8e8f0'); // papers
  });
  softTex(scene, 'searchlight', 256, 96, (c) => {
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 46);
    c.lineTo(256, 0);
    c.lineTo(256, 96);
    c.lineTo(0, 50);
    c.closePath();
    c.fill();
  });
  softTex(scene, 'white', 4, 4, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); });
}
