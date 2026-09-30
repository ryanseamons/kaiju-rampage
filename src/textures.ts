// Every sprite in the game is drawn here at boot with Canvas 2D. No image files.
// Shapes are drawn with normal canvas calls, then alpha is hard-thresholded and a
// 1px outline is added, which gives a crisp pixel-art look.
import Phaser from 'phaser';
import { TILE } from './config';
import { mulberry32 } from './rng';

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
const ROOFS = ['#7a2f38', '#2f4f7a', '#6b4b2f', '#3f6b4b', '#5a3f6b', '#6b6b6b'];
const WINDOW_LIT = ['#ffd66b', '#ffe9a8', '#7ef0ff', '#ff8adf'];

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
}

function drawTower(c: Ctx, v: number) {
  const r = mulberry32(v * 977 + 3);
  const w = 60, roofH = 56, faceH = 30;
  const body = ['#252a44', '#2d2440', '#1f3340', '#322a2a'][v % 4];
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
  if (v % 3 === 0) {
    // neon sign on the facade
    rect(c, 10, roofH + 6, 40, 8, '#12060f');
    rect(c, 12, roofH + 8, 36, 4, ['#ff3fa4', '#3ff0ff', '#ffe23f'][v % 3 === 0 ? (v >> 2) % 3 : 0]);
  }
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
  ell(c, 7.5, 7, 6.5, 6, ['#1f4a2e', '#24553a', '#2a4a24'][v % 3]);
  ell(c, 6, 5, 3, 2.5, '#3a7a4a');
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
  rect(c, at(T.lot), 0, TILE, TILE, '#191c2c'); noise(at(T.lot), '#191c2c', 0.4, 40);
  rect(c, at(T.sidewalk), 0, TILE, TILE, '#2a2d42');
  for (let k = 0; k < TILE; k += 8) { rect(c, at(T.sidewalk) + k, 0, 1, TILE, '#23263a'); rect(c, at(T.sidewalk), k, TILE, 1, '#23263a'); }
  for (const i of [T.road, T.roadH, T.roadV, T.cross]) { rect(c, at(i), 0, TILE, TILE, '#12131c'); noise(at(i), '#12131c', 0.5, 30); }
  rect(c, at(T.roadH) + 4, 30, 10, 2, '#8a7424'); rect(c, at(T.roadH) + 20, 30, 10, 2, '#8a7424');
  rect(c, at(T.roadV) + 30, 4, 2, 10, '#8a7424'); rect(c, at(T.roadV) + 30, 20, 2, 10, '#8a7424');
  for (let k = 2; k < TILE; k += 6) rect(c, at(T.cross) + k, 2, 3, 6, '#3a3c4a');
  rect(c, at(T.park), 0, TILE, TILE, '#132a20'); noise(at(T.park), '#1a3a2a', 0.6, 60);
  rect(c, at(T.sand), 0, TILE, TILE, '#3d3a30'); noise(at(T.sand), '#4a4636', 0.5, 50);
  for (const [i, off] of [[T.waterA, 0], [T.waterB, 8]] as const) {
    rect(c, at(i), 0, TILE, TILE, '#0a1c38');
    for (let y = 4; y < TILE; y += 10) rect(c, at(i) + ((y + off) % 20), y, 8, 1, '#1d3f6e');
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
  pixelTex(scene, 'mech0', 44, 49, (c) => drawMech(c, 0));
  pixelTex(scene, 'mech1', 44, 49, (c) => drawMech(c, 1));
  for (let v = 0; v < 6; v++) {
    pixelTex(scene, `car${v}`, 14, 9, (c) => drawCar(c, v));
    pixelTex(scene, `house${v}`, 30, 32, (c) => drawHouse(c, v));
    pixelTex(scene, `tower${v}`, 60, 86, (c) => drawTower(c, v));
  }
  for (let v = 0; v < 3; v++) {
    pixelTex(scene, `warehouse${v}`, 62, 46, (c) => drawWarehouse(c, v));
    pixelTex(scene, `tree${v}`, 15, 14, (c) => drawTree(c, v));
  }
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
  softTex(scene, 'white', 4, 4, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); });
}
