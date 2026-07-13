/**
 * Guided-tour progress in localStorage — the persistence path for everything
 * that isn't a signed-in cloud read of a `db_` analysis: local mode, fixtures
 * viewed in cloud mode, `st_` share links, signed-out visitors.
 *
 * One key per analysis route id. Progress is keyed per analysis *version*
 * (a new upload has a new id and a new tour), matching the DB table.
 *
 * Safe to import anywhere: `normalizeFurthest` is pure, and the read/write
 * helpers guard every localStorage touch with try/catch (private browsing,
 * SSR, disabled storage all degrade to session-only behavior).
 */

const KEY_PREFIX = "tour-progress:";

function storageKey(analysisId: string): string {
  return `${KEY_PREFIX}${analysisId}`;
}

/**
 * Coerce a stored/received value into a valid furthest step: an integer in
 * `[0, total]`. Anything unparsable, negative or fractional collapses to 0;
 * values above `total` (e.g. hand-edited storage) clamp down to it.
 */
export function normalizeFurthest(raw: unknown, total: number): number {
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isInteger(n) || n <= 0) return 0;
  return Math.min(n, Math.max(total, 0));
}

/** The furthest step stored for `analysisId`, clamped to `[0, total]`. */
export function readLocalTourProgress(
  analysisId: string,
  total: number,
): number {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey(analysisId));
  } catch {}
  return normalizeFurthest(raw, total);
}

/**
 * Subscribe to cross-tab progress changes, for `useSyncExternalStore`
 * (client-only — `storage` fires in *other* tabs when one of them writes).
 */
export function subscribeTourProgress(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Raise the stored furthest step for `analysisId` to `step` (never lowers). */
export function writeLocalTourProgress(analysisId: string, step: number): void {
  if (!Number.isInteger(step) || step <= 0) return;
  try {
    const key = storageKey(analysisId);
    const existing = Number.parseInt(localStorage.getItem(key) ?? "", 10);
    if (Number.isInteger(existing) && existing >= step) return;
    localStorage.setItem(key, String(step));
  } catch {}
}
