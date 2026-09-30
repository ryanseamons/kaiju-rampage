// Client side of the news desk: prefetch during the wave, never block the break.
import { BULLETIN_WAIT_MS } from './config';
import { bankBulletin, type Bulletin, type RunStats } from './shared/narration';

/** True only when the local server is up AND has an API key; otherwise the run never touches the network. */
async function liveNarrationAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.ok === true && json.hasKey === true;
  } catch {
    return false;
  }
}

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
  /** Checked once per run, in the background. */
  private live = liveNarrationAvailable();
  mode: 'unknown' | 'live' | 'bank' = 'unknown';

  constructor() {
    void this.live.then((ok) => (this.mode = ok ? 'live' : 'bank'));
  }

  prefetch(stats: RunStats) {
    this.prefetchedFor = stats.wave;
    this.pending = this.live.then((ok) => (ok ? fetchBulletin(stats) : null));
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
