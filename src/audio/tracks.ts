// Recorded soundtrack (Epidemic Sound, licensed): the list is tracks.json; the files stream from
// the CDN (AUDIO_BASE). A track that fails to load is dropped and the composer covers for it.
import trackList from './tracks.json';
import { AUDIO_BASE } from '../config';
import type { MusicContext } from './composer';

export interface TrackInfo {
  id: string;
  title: string;
  artist: string;
  /** Where it plays. 'candidate': only in the Sound Test, waiting for a vote. */
  contexts: (MusicContext | 'candidate')[];
  /** Candidates: the stage it was picked for. */
  suggest?: MusicContext;
  /** Added in the latest batch (badged in the Sound Test). */
  new?: boolean;
  /** Epidemic's genre and mood tags, for the Sound Test. */
  tags?: string[];
  /** Seconds to skip at the start: a quiet intro that would sit far under the effects. */
  start?: number;
}

let list: TrackInfo[] | null = null;
const cursor = new Map<MusicContext, number>();
const order = new Map<MusicContext, TrackInfo[]>();

const disabled = new URLSearchParams(location.search).get('music') === 'composed';

function shuffle<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const tracks = {
  load(): Promise<TrackInfo[]> {
    list ??= disabled ? [] : (trackList as { tracks: TrackInfo[] }).tracks;
    return Promise.resolve(list);
  },
  /** null until the list has loaded; [] when there is none. */
  get ready() {
    return list;
  },
  /** The next track for a context, rotating through a per-session shuffle. */
  next(ctx: MusicContext): TrackInfo | null {
    if (!list) return null;
    let o = order.get(ctx);
    if (!o) {
      o = shuffle(list.filter((t) => t.contexts.includes(ctx)));
      order.set(ctx, o);
    }
    if (!o.length) return null;
    const i = cursor.get(ctx) ?? 0;
    cursor.set(ctx, i + 1);
    return o[i % o.length];
  },
  /** Every track, in list order ([] until loaded or when there is none). */
  all: (): TrackInfo[] => list ?? [],
  url: (t: TrackInfo) => `${AUDIO_BASE}music/${t.id}.mp3`,
  /** A track failed to load: stop offering it. */
  drop(t: TrackInfo) {
    for (const [c, o] of order) order.set(c, o.filter((x) => x.id !== t.id));
  },
};
