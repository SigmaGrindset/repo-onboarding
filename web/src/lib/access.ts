/**
 * The single authorization chokepoint for user-uploaded analyses.
 *
 * EVERY read of a cloud analysis must pass through `canReadAnalysis`, and every
 * per-user listing through `listAnalysesFor`. Both consult `analysis_access`,
 * so the moment a future "share" feature inserts a role='viewer' row, that user
 * can read and see the analysis with no other code change.
 *
 * Server-only: imports the Neon client. Only reachable in cloud mode.
 */

import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/db/db";
import { analyses, analysisAccess } from "@/db/schema";

/**
 * Can `userId` read the analysis with database id `analysisId`?
 * True iff an `analysis_access` row exists for the pair (any role). Owner-only
 * today; viewer rows will satisfy this automatically.
 */
export async function canReadAnalysis(
  userId: string,
  analysisId: string,
): Promise<boolean> {
  if (!userId || !analysisId) return false;
  const rows = await getDb()
    .select({ role: analysisAccess.role })
    .from(analysisAccess)
    .where(
      and(
        eq(analysisAccess.analysisId, analysisId),
        eq(analysisAccess.userId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Is `userId` the owner of `analysisId`? Gate for destructive actions. */
export async function isOwner(
  userId: string,
  analysisId: string,
): Promise<boolean> {
  if (!userId || !analysisId) return false;
  const rows = await getDb()
    .select({ role: analysisAccess.role })
    .from(analysisAccess)
    .where(
      and(
        eq(analysisAccess.analysisId, analysisId),
        eq(analysisAccess.userId, userId),
        eq(analysisAccess.role, "owner"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** A metadata row a user is allowed to see, joined through `analysis_access`. */
export interface AccessibleAnalysis {
  id: string;
  repoName: string;
  repoUrl: string | null;
  summary: string;
  createdAt: Date;
}

/**
 * Every analysis `userId` may read, newest first. Joins through
 * `analysis_access` so shared (viewer) rows appear alongside owned ones.
 */
export async function listAnalysesFor(
  userId: string,
): Promise<AccessibleAnalysis[]> {
  if (!userId) return [];
  return getDb()
    .select({
      id: analyses.id,
      repoName: analyses.repoName,
      repoUrl: analyses.repoUrl,
      summary: analyses.summary,
      createdAt: analyses.createdAt,
    })
    .from(analysisAccess)
    .innerJoin(analyses, eq(analyses.id, analysisAccess.analysisId))
    .where(eq(analysisAccess.userId, userId))
    .orderBy(desc(analyses.createdAt));
}

/** Fetch the blob key for an analysis (used after an access check passes). */
export async function getBlobKey(analysisId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ blobKey: analyses.blobKey })
    .from(analyses)
    .where(eq(analyses.id, analysisId))
    .limit(1);
  return rows[0]?.blobKey ?? null;
}

/**
 * Resolve an analysis by its unlisted-link share token. Returns its id + blob
 * key, or null when no analysis has that (non-null) token. The secret token is
 * the capability — this bypasses `canReadAnalysis` by design, so anyone with the
 * link can read the payload without signing in.
 */
export async function getAnalysisByShareToken(
  token: string,
): Promise<{ id: string; blobKey: string } | null> {
  if (!token) return null;
  const rows = await getDb()
    .select({ id: analyses.id, blobKey: analyses.blobKey })
    .from(analyses)
    .where(eq(analyses.shareToken, token))
    .limit(1);
  return rows[0] ?? null;
}

/** The Clerk user ids granted viewer access to `analysisId`. */
export async function listViewers(analysisId: string): Promise<string[]> {
  if (!analysisId) return [];
  const rows = await getDb()
    .select({ userId: analysisAccess.userId })
    .from(analysisAccess)
    .where(
      and(
        eq(analysisAccess.analysisId, analysisId),
        eq(analysisAccess.role, "viewer"),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * Grant `userId` viewer access to `analysisId`. Idempotent: the composite PK
 * makes a repeat share a no-op via `onConflictDoNothing`.
 */
export async function addViewer(
  analysisId: string,
  userId: string,
): Promise<void> {
  await getDb()
    .insert(analysisAccess)
    .values({ analysisId, userId, role: "viewer" })
    .onConflictDoNothing();
}

/**
 * Revoke `userId`'s viewer access to `analysisId`. Constrained to role='viewer'
 * so the owner row can never be removed by this path.
 */
export async function removeViewer(
  analysisId: string,
  userId: string,
): Promise<void> {
  await getDb()
    .delete(analysisAccess)
    .where(
      and(
        eq(analysisAccess.analysisId, analysisId),
        eq(analysisAccess.userId, userId),
        eq(analysisAccess.role, "viewer"),
      ),
    );
}

/** The current unlisted-link share token for `analysisId`, or null if off. */
export async function getShareToken(
  analysisId: string,
): Promise<string | null> {
  const rows = await getDb()
    .select({ shareToken: analyses.shareToken })
    .from(analyses)
    .where(eq(analyses.id, analysisId))
    .limit(1);
  return rows[0]?.shareToken ?? null;
}

/**
 * Set (or clear) the unlisted-link share token for `analysisId`. Passing a new
 * token rotates the link; passing null turns link sharing off.
 */
export async function setShareToken(
  analysisId: string,
  token: string | null,
): Promise<void> {
  await getDb()
    .update(analyses)
    .set({ shareToken: token })
    .where(eq(analyses.id, analysisId));
}
