// A scripted player. It reads the game's read-only debug snapshot (window.__kaiju.state())
// and drives the game ONLY through keyboard input, like a human would. No state poking.
import type { Page } from '@playwright/test';

export type KState = {
  phase: string;
  modal: string | null;
  wave: number;
  elapsed: number;
  tier: number;
  maxTierReached: number;
  level: number;
  hp: number;
  maxHp: number;
  stompReady: boolean;
  player: { x: number; y: number; r: number; scale: number };
  world: { w: number; h: number };
  view: { x: number; y: number; w: number; h: number };
  enemies: { type: string; x: number; y: number; hp: number }[];
  enemyTypesSpawned: string[];
  enemyRoster: string[];
  pickups: { x: number; y: number; kind: string }[];
  shots: { x: number; y: number; vx: number; vy: number }[];
  narrationMode: 'unknown' | 'live' | 'bank';
  damageTaken: number;
  targets: { x: number; y: number; w: number; h: number; kind: string; sizeClass: number }[];
  offer: { id: string; name: string }[];
  upgradePoolSize: number;
  levelUpsShown: number;
  bulletinsShown: number;
  lastBulletin: { headline: string; anchor: string; ticker: string[]; source: 'ai' | 'bank' } | null;
  fps: number;
  destroyed: number;
};

export const getState = (page: Page) => page.evaluate(() => (window as any).__kaiju?.state() as KState | undefined);

const PREFS = ['hide', 'regen', 'breath', 'plating', 'tail', 'aura', 'claws', 'frenzy', 'rampage', 'spines', 'hormone', 'magnet', 'reach', 'speed', 'aftershock', 'tectonic'];

export interface BotHooks {
  /** Called once per tick with fresh state; return true to stop. */
  onTick?: (s: KState) => Promise<boolean | void> | boolean | void;
  /** Called when a level-up modal is open, before the bot picks. */
  onLevelUp?: (s: KState) => Promise<void> | void;
  /** Called when a bulletin card is open, before the bot continues. */
  onBulletin?: (s: KState) => Promise<void> | void;
}

export class Bot {
  private held = new Set<string>();
  private lastPos = { x: 0, y: 0, t: 0 };
  private unstickUntil = 0;
  private unstickDir = { x: 0, y: 0 };
  private wanderAngle = Math.random() * Math.PI * 2;
  fpsSamples: number[] = [];
  minHpPct = 100;

  constructor(private page: Page) {}

  private async setKeys(want: Set<string>) {
    for (const k of [...this.held]) if (!want.has(k)) { await this.page.keyboard.up(k); this.held.delete(k); }
    for (const k of want) if (!this.held.has(k)) { await this.page.keyboard.down(k); this.held.add(k); }
  }

  async releaseAll() {
    await this.setKeys(new Set());
  }

  private steer(s: KState): { x: number; y: number; stomp: boolean } {
    const p = s.player, k = p.scale;
    const hpPct = (s.hp / s.maxHp) * 100;
    let fx = 0, fy = 0;
    const now = Date.now();

    // Threats: tanks/mech push us away (unless we can crush them); soldiers are food.
    let close = 0;
    for (const e of s.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 70 * Math.max(1, k)) close++;
      if (e.type === 'soldier') {
        // Soldiers are food once we're big or healthy; at tier 1 on low HP, keep away from rifle range.
        if (s.tier >= 2 || hpPct > 60) {
          if (d < 220 * Math.max(1, k * 0.6)) { fx -= (dx / d) * 0.5; fy -= (dy / d) * 0.5; }
        } else if (d < 160) { fx += (dx / d) * 0.6; fy += (dy / d) * 0.6; }
        continue;
      }
      const crushable = e.type === 'tank' && s.tier >= 3;
      const danger = e.type === 'mech' ? 3 : 1.4;
      const R = (e.type === 'mech' ? 320 : 200) * Math.max(1, k * 0.5);
      if (crushable) { if (d < 300 * k) { fx -= (dx / d) * 1.2; fy -= (dy / d) * 1.2; } continue; }
      if (d < R) {
        const w = danger * (1 - d / R) * (hpPct < 40 ? 2.5 : 1.2);
        fx += (dx / d) * w * 3;
        fy += (dy / d) * w * 3;
      }
    }

    // Incoming shells: sidestep off the shot line (perpendicular to its velocity, away from the line).
    for (const sh of s.shots ?? []) {
      const rx = p.x - sh.x, ry = p.y - sh.y;
      const sp = Math.hypot(sh.vx, sh.vy) || 1;
      const ux = sh.vx / sp, uy = sh.vy / sp;
      const along = rx * ux + ry * uy;
      if (along < 0) continue;
      const t = along / sp;
      if (t > 1.3) continue;
      const perp = rx * -uy + ry * ux;
      if (Math.abs(perp) > p.r + 50) continue;
      const side = perp >= 0 ? 1 : -1;
      const w = (1.3 - t) * 2.5;
      fx += -uy * side * w;
      fy += ux * side * w;
    }

    // Food: nearest crushable/damageable building or pickup.
    let best: { x: number; y: number; score: number } | null = null;
    for (const t of s.targets) {
      if (t.sizeClass > s.tier + 1) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      const value = t.sizeClass <= s.tier ? (t.kind === 'tower' ? 6 : t.kind === 'car' || t.kind === 'tree' ? 1 : 3) : 1.5;
      const score = value / (d + 30);
      if (!best || score > best.score) best = { x: t.x, y: t.y, score };
    }
    for (const g of s.pickups) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      const score = (g.kind === 'heart' ? (hpPct < 60 ? 20 : 2) : 2) / (d + 30);
      if (!best || score > best.score) best = { x: g.x, y: g.y, score };
    }
    if (best) {
      const dx = best.x - p.x, dy = best.y - p.y, d = Math.hypot(dx, dy) || 1;
      const w = hpPct < 30 ? 0.6 : 1.4;
      fx += (dx / d) * w;
      fy += (dy / d) * w;
    } else {
      this.wanderAngle += (Math.random() - 0.5) * 0.4;
      fx += Math.cos(this.wanderAngle) * 0.8;
      fy += Math.sin(this.wanderAngle) * 0.8;
    }

    // Solid buildings (too big to crush or hurt): slide around them.
    for (const t of s.targets) {
      if (t.sizeClass <= s.tier + 1) continue;
      const cx = Math.max(t.x - t.w / 2, Math.min(p.x, t.x + t.w / 2));
      const cy = Math.max(t.y - t.h / 2, Math.min(p.y, t.y + t.h / 2));
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) || 0.1;
      const R = p.r + 24;
      if (d < R) { fx += (dx / d) * (1 - d / R) * 2.5; fy += (dy / d) * (1 - d / R) * 2.5; }
    }

    // World edges and the bay.
    const m = 60 * Math.max(1, k * 0.5);
    if (p.x < m) fx += 2; if (p.x > s.world.w - m) fx -= 2;
    if (p.y < m) fy += 2; if (p.y > s.world.h - m) fy -= 2.5;

    // Stuck detection → pick a random direction for a moment.
    if (now - this.lastPos.t > 700) {
      const moved = Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y);
      if (moved < 6 * Math.max(1, k * 0.5) && now > this.unstickUntil) {
        const a = Math.random() * Math.PI * 2;
        this.unstickDir = { x: Math.cos(a), y: Math.sin(a) };
        this.unstickUntil = now + 800;
      }
      this.lastPos = { x: p.x, y: p.y, t: now };
    }
    if (now < this.unstickUntil) { fx = this.unstickDir.x * 2 + fx * 0.3; fy = this.unstickDir.y * 2 + fy * 0.3; }

    const stomp = s.stompReady && (close >= 3 || s.enemies.some((e) => e.type !== 'soldier' && Math.hypot(e.x - p.x, e.y - p.y) < 90 * k));
    return { x: fx, y: fy, stomp };
  }

  /** Play until hooks.onTick returns true, or the deadline passes. Returns the last state. */
  async play(hooks: BotHooks, deadlineMs: number): Promise<KState> {
    const end = Date.now() + deadlineMs;
    let s: KState | undefined;
    while (Date.now() < end) {
      s = await getState(this.page);
      if (!s) { await this.page.waitForTimeout(200); continue; }
      if (s.fps > 0 && s.phase === 'playing') this.fpsSamples.push(s.fps);
      this.minHpPct = Math.min(this.minHpPct, (s.hp / s.maxHp) * 100);
      if (await hooks.onTick?.(s)) break;

      if (s.modal === 'title') {
        await this.releaseAll();
        await this.page.waitForTimeout(300);
        await this.page.keyboard.press('Enter');
      } else if (s.modal === 'levelup' && s.offer.length) {
        await this.releaseAll();
        await this.page.waitForTimeout(350);
        await hooks.onLevelUp?.(s);
        const ranked = s.offer.map((o, i) => ({ i, r: PREFS.indexOf(o.id) })).sort((a, b) => a.r - b.r);
        await this.page.keyboard.press(`Digit${ranked[0].i + 1}`);
      } else if (s.modal === 'bulletin') {
        await this.releaseAll();
        await this.page.waitForTimeout(900);
        await hooks.onBulletin?.(s);
        await this.page.keyboard.press('Enter');
      } else if (s.phase === 'playing') {
        const { x, y, stomp } = this.steer(s);
        const want = new Set<string>();
        const L = Math.hypot(x, y) || 1;
        if (x / L > 0.38) want.add('KeyD');
        if (x / L < -0.38) want.add('KeyA');
        if (y / L > 0.38) want.add('KeyS');
        if (y / L < -0.38) want.add('KeyW');
        await this.setKeys(want);
        if (stomp) await this.page.keyboard.press('Space');
      } else if (s.phase === 'gameover' || s.phase === 'dying') {
        await this.releaseAll();
      }
      await this.page.waitForTimeout(80);
    }
    await this.releaseAll();
    return s!;
  }
}

/** Start a run from the title screen. The title ignores a key in its first 250 ms (so a carried-over
 * Enter can't start a run by accident), so keep pressing until the game is actually playing. */
export async function startFromTitle(page: Page, key: 'Enter' | 'Space' = 'Enter') {
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press(key);
    const ok = await page
      .waitForFunction(() => (window as any).__kaiju?.state()?.phase === 'playing', null, { timeout: 1500 })
      .then(() => true, () => false);
    if (ok) return;
  }
  throw new Error('run never started from the title');
}
