// Client side of the news desk: prefetch during the wave, never block the break.
import { BULLETIN_WAIT_MS } from './config';
import { bankBulletin, type Bulletin, type RunStats } from './shared/narration';

async function fetchBulletin(stats: RunStats): Promise<Bulletin | null> {
  try {
    const res = await fetch('/api/bulletin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stats }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.ok && json.bulletin ? ({ ...json.bulletin, source: 'ai' } as Bulletin) : null;
  } catch {
    return null;
  }
}

export class NewsDesk {
  private pending: Promise<Bulletin | null> | null = null;
  prefetchedFor = -1;
  history: Bulletin[] = [];
  /** Bank lines already used this run (no repeats across waves). */
  private used = new Set<string>();

  prefetch(stats: RunStats) {
    this.prefetchedFor = stats.wave;
    this.pending = fetchBulletin(stats);
  }

  /** Resolves within BULLETIN_WAIT_MS: the optional AI bulletin if a key is configured and it's ready, else one from the shipped bank built from final stats. */
  async take(stats: RunStats): Promise<Bulletin> {
    if (!this.pending || this.prefetchedFor !== stats.wave) this.prefetch(stats);
    const pending = this.pending!;
    this.pending = null;
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), BULLETIN_WAIT_MS));
    const got = await Promise.race([pending, timeout]);
    const b = got ?? bankBulletin(stats, this.used);
    this.history.push(b);
    return b;
  }
}
