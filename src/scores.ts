// Local run records (per browser). A global leaderboard would need a backend; see README follow-ups.
import { START_WAVE } from './config';

export interface BestRun {
  wave: number;
  buildings: number;
  victory: boolean;
}

const BEST_KEY = 'kaiju.best';

export function loadBest(): BestRun | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? (JSON.parse(raw) as BestRun) : null;
  } catch {
    return null;
  }
}

/** Saves the run if it beats the stored best. Debug starts (?startWave) never count. */
export function recordBest(run: BestRun) {
  if (START_WAVE > 1) return;
  const best = loadBest();
  const better =
    !best || (run.victory && !best.victory) || (run.victory === best.victory && (run.wave > best.wave || (run.wave === best.wave && run.buildings > best.buildings)));
  if (!better) return;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(run));
  } catch {
    /* private mode etc. */
  }
}
