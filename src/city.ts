// Procedural coastal city: tilemap ground, destructible buildings/props, streetlights.
import Phaser from 'phaser';
import { COAST_ROW, MAP_H, MAP_W, SIZE, TILE } from './config';
import { T } from './textures';
import { mulberry32, rint, type Rng } from './rng';
import { STAGE_DEF } from './stages';

export type DestructibleKind = 'car' | 'tree' | 'house' | 'warehouse' | 'tower';
/** Named landmarks: towers (and one house-sized gate) with their own art, HP and score. */
export type LandmarkId = 'pagoda' | 'castle' | 'tvtower' | 'torii';
export const LANDMARK: Record<LandmarkId, { hp: number; score: number; mass: number }> = {
  pagoda: { hp: 200, score: 3000, mass: 30 },
  castle: { hp: 340, score: 8000, mass: 60 },
  tvtower: { hp: 280, score: 6000, mass: 45 },
  torii: { hp: 30, score: 400, mass: 4 },
};
/** How the (English) news bank names each landmark. */
export const LANDMARK_NEWS: Record<LandmarkId, string> = { pagoda: 'the Old Town pagoda', castle: 'Shiokaze Castle', tvtower: 'the KBN-7 Tower', torii: 'a shrine gate' };

export interface Destructible {
  kind: DestructibleKind;
  sizeClass: number;
  hp: number;
  maxHp: number;
  /** Footprint centre and size (world px). */
  x: number;
  y: number;
  w: number;
  h: number;
  sprite: Phaser.GameObjects.Image;
  zone?: Phaser.GameObjects.Zone;
  district: string;
  alive: boolean;
  lastHit: number;
  landmark?: LandmarkId;
  /** Harbor fuel tank: explodes when destroyed, hurting enemies and setting off other tanks. */
  fuel?: boolean;
}

export class Grid<T extends { x: number; y: number; alive: boolean }> {
  private cells = new Map<number, T[]>();
  constructor(private size = 128) {}
  private key(cx: number, cy: number) {
    return cy * 4096 + cx;
  }
  insert(o: T) {
    const k = this.key(Math.floor(o.x / this.size), Math.floor(o.y / this.size));
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    c.push(o);
  }
  /** Candidates whose centre lies within r (+pad) of (x, y). */
  query(x: number, y: number, r: number, out: T[] = [], pad = 48): T[] {
    const R = r + pad;
    const x0 = Math.floor((x - R) / this.size), x1 = Math.floor((x + R) / this.size);
    const y0 = Math.floor((y - R) / this.size), y1 = Math.floor((y + R) / this.size);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.cells.get(this.key(cx, cy));
        if (!c) continue;
        for (const o of c) {
          if (!o.alive) continue;
          const dx = o.x - x, dy = o.y - y;
          if (dx * dx + dy * dy <= R * R) out.push(o);
        }
      }
    return out;
  }
}

/** Circle vs footprint rectangle. */
export function circleHits(d: Destructible, x: number, y: number, r: number) {
  const cx = Phaser.Math.Clamp(x, d.x - d.w / 2, d.x + d.w / 2);
  const cy = Phaser.Math.Clamp(y, d.y - d.h / 2, d.y + d.h / 2);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

export function districtAt(px: number, py: number): string {
  const tx = px / TILE, ty = py / TILE;
  if (ty >= 63) return 'the Harbor';
  if (Math.hypot(tx - 72, ty - 34) < 25) return 'Downtown';
  if (tx >= 100) return 'Neon Row';
  if (tx < 44) return 'Old Town';
  if (ty < 20) return 'Hillside';
  return 'Midtown';
}

const HP = { car: 1, tree: 1, house: 30, warehouse: 45, tower: 140 };

export class City {
  map!: Phaser.Tilemaps.Tilemap;
  layer!: Phaser.Tilemaps.TilemapLayer;
  solids!: Phaser.Physics.Arcade.StaticGroup;
  grid = new Grid<Destructible>(128);
  all: Destructible[] = [];
  private r: Rng;
  private special = new Map<string, LandmarkId>();
  /** Every landmark placed, for the minimap-free player to find (and tests). */
  landmarks: Destructible[] = [];

  constructor(private scene: Phaser.Scene, seed: number) {
    this.r = mulberry32(seed);
  }

  build() {
    const s = this.scene;
    const data: number[][] = [];
    for (let ty = 0; ty < MAP_H; ty++) {
      const row: number[] = [];
      for (let tx = 0; tx < MAP_W; tx++) row.push(this.groundTile(tx, ty));
      data.push(row);
    }
    this.map = s.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = this.map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)!;
    this.layer = this.map.createLayer(0, tileset, 0, 0)!;
    this.layer.setDepth(-100);
    this.solids = s.physics.add.staticGroup();

    // One castle in Old Town and the KBN-7 tower downtown; pagodas are scattered through the old quarters.
    this.special.set('2,4', 'castle');
    this.special.set('7,3', 'tvtower');
    for (let by = 0; by * 9 + 8 < 83; by++)
      for (let bx = 0; bx * 9 + 8 < MAP_W; bx++) this.fillBlock(bx, by);

    this.placeCars();
    this.placeLights();
    // animated bay
    s.time.addEvent({ delay: 650, loop: true, callback: () => this.map.swapByIndex(T.waterA, T.waterB, 0, COAST_ROW, MAP_W, MAP_H - COAST_ROW) });
  }

  private groundTile(tx: number, ty: number): number {
    if (ty >= COAST_ROW) return tx % 18 === 5 || tx % 18 === 6 ? (ty < COAST_ROW + 6 ? T.dock : T.waterA) : T.waterA;
    if (ty >= 88) return tx % 18 === 5 || tx % 18 === 6 ? T.dock : T.sand;
    if (ty >= 83) return T.sidewalk;
    const rc = tx % 9 < 2, rr = ty % 9 < 2;
    if (rc && rr) return T.cross;
    if (rc) return tx % 9 === 0 ? T.roadV : T.road;
    if (rr) return ty % 9 === 0 ? T.roadH : T.road;
    const lx = (tx % 9) - 2, ly = (ty % 9) - 2;
    if (lx === 0 || lx === 6 || ly === 0 || ly === 6) return T.sidewalk;
    return T.lot;
  }

  private fillBlock(bx: number, by: number) {
    const r = this.r;
    const tx0 = bx * 9 + 3, ty0 = by * 9 + 3; // first lot tile of the 5x5 interior
    const cx = (tx0 + 2.5) * TILE, cy = (ty0 + 2.5) * TILE;
    const district = districtAt(cx, cy);
    const weights: Record<string, [string, number][]> = {
      Downtown: [['towers', 0.7], ['mixed', 0.25], ['park', 0.05]],
      'Neon Row': [['towers', 0.4], ['mixed', 0.5], ['park', 0.1]],
      Midtown: [['mixed', 0.5], ['houses', 0.35], ['towers', 0.1], ['park', 0.05]],
      'Old Town': [['houses', 0.85], ['park', 0.15]],
      Hillside: [['houses', 0.6], ['park', 0.4]],
      'the Harbor': [['warehouse', 0.65], ['houses', 0.25], ['park', 0.1]],
    };
    let roll = r(), pattern = 'houses';
    for (const [p, w] of STAGE_DEF.blocks?.(district) ?? weights[district]) {
      if ((roll -= w) <= 0) { pattern = p; break; }
    }
    // Landmarks: the castle and KBN-7 tower every stage; pagodas in the old quarters (and all over the night market).
    const pagodaOdds = STAGE_DEF.id === 'market' ? 0.14 : STAGE_DEF.id === 'bay' || STAGE_DEF.id === 'typhoon' ? 0.1 : 0;
    const lm = this.special.get(`${bx},${by}`) ?? ((district === 'Old Town' || district === 'Hillside' || STAGE_DEF.id === 'market') && r() < pagodaOdds ? 'pagoda' : undefined);
    if (lm) return this.landmarkBlock(tx0, ty0, lm, district);
    if (pattern === 'stalls') return this.stallBlock(tx0, ty0, district);
    if (pattern === 'tanks') return this.tankBlock(tx0, ty0, district);
    const used = new Set<string>();
    const big = (lx: number, ly: number, kind: 'tower' | 'warehouse') => {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) used.add(`${lx + dx},${ly + dy}`);
      this.addBuilding(kind, (tx0 + lx) * TILE, (ty0 + ly) * TILE, district);
    };
    if (pattern === 'towers') for (const [lx, ly] of [[0, 0], [3, 0], [0, 3], [3, 3]]) big(lx, ly, 'tower');
    if (pattern === 'warehouse') for (const [lx, ly] of [[0, 0], [3, 0], [0, 3], [3, 3]]) if (r() < 0.85) big(lx, ly, 'warehouse');
    if (pattern === 'mixed') {
      big(0, 0, 'tower');
      if (r() < 0.6) big(3, 3, 'tower');
    }
    for (let ly = 0; ly < 5; ly++)
      for (let lx = 0; lx < 5; lx++) {
        if (used.has(`${lx},${ly}`)) continue;
        const px = (tx0 + lx) * TILE, py = (ty0 + ly) * TILE;
        if (pattern === 'park') {
          this.map.putTileAt(T.park, tx0 + lx, ty0 + ly);
          if (r() < 0.45) this.addProp('tree', px + 16 + rint(r, -6, 6), py + 16 + rint(r, -6, 6), district);
          continue;
        }
        if (pattern === 'towers' || pattern === 'warehouse') {
          if (lx === 2 || ly === 2) {
            this.map.putTileAt(T.sidewalk, tx0 + lx, ty0 + ly);
            if (r() < 0.2) this.addProp('tree', px + 16, py + 16, district);
          }
          continue;
        }
        const pHouse = pattern === 'houses' ? 0.78 : 0.6;
        if (r() < pHouse) this.addBuilding('house', px, py, district);
        else if (r() < 0.5) {
          this.map.putTileAt(T.park, tx0 + lx, ty0 + ly);
          this.addProp('tree', px + 16, py + 16, district);
        }
      }
  }

  /** Night market: rows of food stalls on a paved plaza. */
  private stallBlock(tx0: number, ty0: number, district: string) {
    const r = this.r;
    for (let ly = 0; ly < 5; ly++)
      for (let lx = 0; lx < 5; lx++) {
        this.map.putTileAt(T.sidewalk, tx0 + lx, ty0 + ly);
        if (ly % 2 === 0 && r() < 0.85) this.addProp('car', (tx0 + lx) * TILE + 16, (ty0 + ly) * TILE + 18, district, 0, `stall${rint(r, 0, 3)}`);
      }
  }

  /** Harbor tank farm: fuel tanks (they explode) and, sometimes, a container crane. */
  private tankBlock(tx0: number, ty0: number, district: string) {
    const r = this.r;
    const crane = r() < 0.3;
    if (crane) this.addBuilding('tower', (tx0 + 1) * TILE + 16, (ty0 + 1) * TILE, district, undefined, 'crane');
    for (let ly = 0; ly < 5; ly += 2)
      for (let lx = 0; lx < 5; lx += 2) {
        if (crane && lx >= 1 && lx <= 3 && ly <= 2) continue;
        if (r() < 0.85) {
          const d = this.addBuilding('house', (tx0 + lx) * TILE, (ty0 + ly) * TILE, district, undefined, 'fueltank');
          d.fuel = true;
          d.hp = d.maxHp = 20;
        }
      }
  }

  /** A landmark in the middle of the block, a torii in front, and a park around them. */
  private landmarkBlock(tx0: number, ty0: number, lm: LandmarkId, district: string) {
    const r = this.r;
    const d = this.addBuilding('tower', (tx0 + 1) * TILE + 16, (ty0 + 1) * TILE, district, lm);
    d.hp = d.maxHp = LANDMARK[lm].hp;
    if (lm !== 'tvtower') {
      const g = this.addBuilding('house', (tx0 + 2) * TILE, (ty0 + 4) * TILE, district, 'torii');
      g.hp = g.maxHp = LANDMARK.torii.hp;
    }
    for (let ly = 0; ly < 5; ly++)
      for (let lx = 0; lx < 5; lx++) {
        const inside = lx >= 1 && lx <= 3 && ly <= 2; // tall sprites rise over row 0
        this.map.putTileAt(lm === 'tvtower' ? T.sidewalk : T.park, tx0 + lx, ty0 + ly);
        if (!inside && !(lx === 2 && ly >= 3) && r() < 0.5) this.addProp('tree', (tx0 + lx) * TILE + 16 + rint(r, -6, 6), (ty0 + ly) * TILE + 16 + rint(r, -6, 6), district);
      }
  }

  private addBuilding(kind: 'house' | 'warehouse' | 'tower', px: number, py: number, district: string, landmark?: LandmarkId, tex?: string): Destructible {
    const s = this.scene, r = this.r;
    const v = kind === 'warehouse' ? rint(r, 0, 2) : rint(r, 0, 5);
    // footprint (collision) rectangle, bottom-aligned with the sprite
    const fw = kind === 'house' ? 28 : 60;
    const fh = kind === 'house' ? 26 : kind === 'warehouse' ? 44 : 58;
    const left = px + (kind === 'house' ? 2 : 2);
    const bottom = py + (kind === 'house' ? 30 : 62);
    const sprite = s.add.image(left + fw / 2, bottom, tex ?? landmark ?? `${kind}${v}`).setOrigin(0.5, 1).setDepth(bottom);
    const d: Destructible = {
      kind,
      sizeClass: kind === 'tower' ? SIZE.tower : SIZE.house,
      hp: HP[kind],
      maxHp: HP[kind],
      x: left + fw / 2,
      y: bottom - fh / 2,
      w: fw,
      h: fh,
      sprite,
      district,
      alive: true,
      lastHit: 0,
      landmark,
    };
    const zone = s.add.zone(d.x, d.y, fw, fh);
    this.solids.add(zone);
    zone.setData('d', d);
    d.zone = zone;
    this.grid.insert(d);
    this.all.push(d);
    if (landmark) this.landmarks.push(d);
    return d;
  }

  private addProp(kind: 'car' | 'tree', x: number, y: number, district: string, rot = 0, tex?: string) {
    const v = kind === 'car' ? rint(this.r, 0, 5) : rint(this.r, 0, 2);
    const sprite = this.scene.add.image(x, y, tex ?? `${kind}${v}`).setRotation(rot).setDepth(y + (kind === 'tree' ? 6 : 0));
    const d: Destructible = {
      kind, sizeClass: SIZE.car, hp: 1, maxHp: 1, x, y, w: kind === 'car' ? 12 : 12, h: kind === 'car' ? 8 : 12,
      sprite, district, alive: true, lastHit: 0,
    };
    this.grid.insert(d);
    this.all.push(d);
  }

  private placeCars() {
    const r = this.r;
    for (let ty = 0; ty < 83; ty++)
      for (let tx = 0; tx < MAP_W; tx++) {
        const rc = tx % 9 < 2, rr = ty % 9 < 2;
        if (rc === rr) continue; // skip intersections and lots
        if (r() > 0.16) continue;
        const x = tx * TILE + 16, y = ty * TILE + 16;
        const district = districtAt(x, y);
        if (STAGE_DEF.extras === 'stalls' && r() < 0.45) {
          this.addProp('car', x + rint(r, -6, 6), y + rint(r, -6, 6), district, 0, `stall${rint(r, 0, 3)}`);
          continue;
        }
        if (rc) this.addProp('car', x, y + rint(r, -8, 8), district, (tx % 9 === 0 ? 1 : -1) * Math.PI / 2);
        else this.addProp('car', x + rint(r, -8, 8), y, district, ty % 9 === 0 ? Math.PI : 0);
      }
  }

  private placeLights() {
    const s = this.scene;
    for (let ty = 0; ty < 83; ty += 9)
      for (let tx = 0; tx < MAP_W; tx += 9) {
        const x = tx * TILE + 32, y = ty * TILE + 32;
        const neon = districtAt(x, y) === 'Neon Row';
        const tint = neon ? (((tx + ty) / 9) % 2 ? 0xff3fa4 : 0x3ff0ff) : 0xffc070;
        s.add.image(x, y, 'glow').setTint(tint).setAlpha(neon ? 0.45 : 0.3).setScale(2.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(-50);
      }
    for (let tx = 2; tx < MAP_W; tx += 6)
      s.add.image(tx * TILE, 86 * TILE, 'glow').setTint(0xffe0a0).setAlpha(0.25).setScale(1.8).setBlendMode(Phaser.BlendModes.ADD).setDepth(-50);
    // Night market: strings of paper lanterns along the streets.
    if (STAGE_DEF.weather === 'lanterns')
      for (let ty = 0; ty < 83; ty += 9)
        for (let tx = 0; tx < MAP_W; tx += 2) {
          const l = s.add.image(tx * TILE + 16, ty * TILE + 4, 'lantern').setBlendMode(Phaser.BlendModes.ADD).setDepth(9000).setAlpha(0.85);
          s.tweens.add({ targets: l, alpha: 0.55, yoyo: true, repeat: -1, duration: 700 + ((tx * 37 + ty) % 600) });
        }
    // Neon Megacity: a pink-and-cyan glow on every block corner.
    if (STAGE_DEF.weather === 'neon')
      for (let ty = 0; ty < 83; ty += 9)
        for (let tx = 4; tx < MAP_W; tx += 9)
          s.add.image(tx * TILE + 16, ty * TILE + 48, 'glow').setTint((tx + ty) % 2 ? 0xff3fa4 : 0x3ff0ff).setAlpha(0.4).setScale(3.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(-50);
  }

  /** Centre of the nearest road tile (searches outward over the tilemap, so any street layout works). */
  snapToRoad(x: number, y: number): [number, number] {
    const road = new Set<number>([T.road, T.roadH, T.roadV, T.cross]);
    const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
    for (let r = 0; r <= 14; r++) {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tile = this.map.getTileAt(tx0 + dx, ty0 + dy);
          if (!tile || !road.has(tile.index)) continue;
          const cx = (tx0 + dx) * TILE + TILE / 2, cy = (ty0 + dy) * TILE + TILE / 2;
          const d = (cx - x) ** 2 + (cy - y) ** 2;
          if (d < bd) { bd = d; best = [cx, cy]; }
        }
      if (best) return best;
    }
    return [x, y];
  }

  /** Replace a destroyed building with rubble. */
  leaveRubble(d: Destructible) {
    const s = this.scene;
    if (d.kind === 'car' || d.kind === 'tree') {
      s.add.image(d.x, d.y, 'rubble').setScale(0.35).setDepth(-60).setTint(d.kind === 'tree' ? 0x335533 : 0x555566);
      return;
    }
    const n = d.kind === 'house' ? 1 : 3;
    for (let i = 0; i < n; i++)
      s.add
        .image(d.x + (n > 1 ? Phaser.Math.Between(-16, 16) : 0), d.y + (n > 1 ? Phaser.Math.Between(-14, 14) : 0), 'rubble')
        .setDepth(-60)
        .setScale(d.kind === 'house' ? 1 : 1.3)
        .setFlipX(Math.random() < 0.5);
  }
}
