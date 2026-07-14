/**
 * Per-user guided-tour progress (cloud mode).
 *
 * Progress rows are self-scoped: every query here filters by `userId`, so a
 * user can only ever read or write their own rows. Whether the user may see
 * the *analysis* is the caller's job (`canReadAnalysis` in `@/lib/access`) —
 * same layering as the rest of the DB helpers.
 *
 * Server-only: imports the Neon client. Only reachable in cloud mode.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/db";
import { tourProgress } from "@/db/schema";

/** The furthest tour step `userId` has reached in `analysisId`, or 0 if none. */
export async function getTourProgress(
  userId: string,
  analysisId: string,
): Promise<number> {
  if (!userId || !analysisId) return 0;
  const rows = await getDb()
    .select({ furthestStep: tourProgress.furthestStep })
    .from(tourProgress)
    .where(
      and(
        eq(tourProgress.analysisId, analysisId),
        eq(tourProgress.userId, userId),
      ),
    )
    .limit(1);
  return rows[0]?.furthestStep ?? 0;
}

/**
 * `userId`'s progress across many analyses in one query — feeds the index
 * page's "4/9 steps" badges. Ids without a row are simply absent from the map.
 */
export async function getTourProgressMap(
  userId: string,
  analysisIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!userId || analysisIds.length === 0) return map;
  const rows = await getDb()
    .select({
      analysisId: tourProgress.analysisId,
      furthestStep: tourProgress.furthestStep,
    })
    .from(tourProgress)
    .where(
      and(
        eq(tourProgress.userId, userId),
        inArray(tourProgress.analysisId, analysisIds),
      ),
    );
  for (const r of rows) map.set(r.analysisId, r.furthestStep);
  return map;
}

/**
 * Record that `userId` reached `furthestStep` in `analysisId`. Monotonic: the
 * GREATEST upsert means progress never decreases, so late or out-of-order
 * writes are harmless.
 */
export async function setTourProgress(
  userId: string,
  analysisId: string,
  furthestStep: number,
): Promise<void> {
  await getDb()
    .insert(tourProgress)
    .values({ analysisId, userId, furthestStep })
    .onConflictDoUpdate({
      target: [tourProgress.analysisId, tourProgress.userId],
      set: {
        furthestStep: sql`GREATEST(${tourProgress.furthestStep}, EXCLUDED.furthest_step)`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Forget `userId`'s progress in `analysisId` (the "Reset progress" action).
 * Deleting the row — rather than zeroing it — is what lets the next
 * `setTourProgress` land below the old furthest despite the GREATEST upsert.
 * Idempotent: deleting a missing row is a no-op.
 */
export async function resetTourProgress(
  userId: string,
  analysisId: string,
): Promise<void> {
  if (!userId || !analysisId) return;
  await getDb()
    .delete(tourProgress)
    .where(
      and(
        eq(tourProgress.analysisId, analysisId),
        eq(tourProgress.userId, userId),
      ),
    );
}
