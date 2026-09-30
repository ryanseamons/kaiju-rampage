// Flow-field navigation: a breadth-first distance map over the tile grid, rebuilt from the kaiju's
// tile a few times a second. Ground units follow it downhill, so they route around buildings instead
// of pressing into walls. Destroyed buildings open up their tiles.
import { COAST_ROW, MAP_H, MAP_W, TILE } from './config';
import type { City, Destructible } from './city';

const UNKNOWN = 0xffff;
const RADIUS = 44; // tiles searched around the kaiju
const DIRS: [number, number, number][] = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];

export class NavField {
  private blocked = new Uint8Array(MAP_W * MAP_H);
  private dist = new Uint16Array(MAP_W * MAP_H).fill(UNKNOWN);
  private queue = new Int32Array(MAP_W * MAP_H);
  private touched: number[] = [];

  constructor(city: City) {
    for (let ty = COAST_ROW; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) this.blocked[ty * MAP_W + tx] = 1;
    for (const d of city.all) if (d.alive && d.zone) this.mark(d, 1);
  }

  private mark(d: Destructible, v: number) {
    const x0 = Math.floor((d.x - d.w / 2) / TILE), x1 = Math.floor((d.x + d.w / 2 - 1) / TILE);
    const y0 = Math.floor((d.y - d.h / 2) / TILE), y1 = Math.floor((d.y + d.h / 2 - 1) / TILE);
    for (let ty = Math.max(0, y0); ty <= Math.min(MAP_H - 1, y1); ty++)
      for (let tx = Math.max(0, x0); tx <= Math.min(MAP_W - 1, x1); tx++) this.blocked[ty * MAP_W + tx] = v;
  }

  /** A building came down: its tiles are walkable now. */
  unblock(d: Destructible) {
    this.mark(d, 0);
  }

  /** Rebuild distances outward from the kaiju. Cheap: a bounded 8-neighbour Dijkstra-lite BFS. */
  update(px: number, py: number) {
    for (const i of this.touched) this.dist[i] = UNKNOWN;
    this.touched.length = 0;
    const sx = Math.max(0, Math.min(MAP_W - 1, Math.floor(px / TILE)));
    const sy = Math.max(0, Math.min(MAP_H - 1, Math.floor(py / TILE)));
    let head = 0, tail = 0;
    const start = sy * MAP_W + sx;
    this.dist[start] = 0;
    this.touched.push(start);
    this.queue[tail++] = start;
    while (head < tail) {
      const i = this.queue[head++];
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      const base = this.dist[i];
      for (const [dx, dy, cost] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (Math.abs(nx - sx) > RADIUS || Math.abs(ny - sy) > RADIUS) continue;
        const j = ny * MAP_W + nx;
        if (this.blocked[j]) continue;
        // no corner cutting through building edges
        if (dx && dy && (this.blocked[y * MAP_W + nx] || this.blocked[ny * MAP_W + x])) continue;
        const nd = base + cost;
        if (nd < this.dist[j]) {
          if (this.dist[j] === UNKNOWN) this.touched.push(j);
          this.dist[j] = nd;
          this.queue[tail++] = j;
        }
      }
    }
  }

  /** Unit vector toward the kaiju along the field, or null if this point isn't covered. */
  dir(x: number, y: number): [number, number] | null {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
    const here = this.dist[ty * MAP_W + tx];
    if (here === UNKNOWN || here === 0) return null;
    let best = here, bx = 0, by = 0;
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const v = this.dist[ny * MAP_W + nx];
      if (v < best) { best = v; bx = dx; by = dy; }
    }
    if (!bx && !by) return null;
    // Steer toward the centre of the next tile, so units stay off building corners.
    const cx = (tx + bx) * TILE + TILE / 2 - x, cy = (ty + by) * TILE + TILE / 2 - y;
    const L = Math.hypot(cx, cy) || 1;
    return [cx / L, cy / L];
  }
}
