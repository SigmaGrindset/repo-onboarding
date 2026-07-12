/**
 * The single authorization chokepoint for user-uploaded analyses.
 *
 * EVERY read of a cloud analysis must pass through `canReadAnalysis`, and every
 * per-user listing through `listAnalysesFor`. Both consult `analysis_access`,
 * so the moment a future "share" feature inserts a role='viewer' row, that user
 * can read and see the analysis with no other code change.
 *
 * This is also the ONE place lineage ("versions") queries may live:
 * `listVersionsFor` groups a repo's analyses by (`owner_id`, `repo_key`) and is
 * likewise access-gated through `analysis_access`. Keeping it here preserves the
 * chokepoint doctrine — no other module may join on `repo_key`.
 *
 * Server-only: imports the Neon client. Only reachable in cloud mode.
 */

import { and, eq, asc, desc } from "drizzle-orm";
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
  repoKey: string;
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
      repoKey: analyses.repoKey,
      summary: analyses.summary,
      createdAt: analyses.createdAt,
    })
    .from(analysisAccess)
    .innerJoin(analyses, eq(analyses.id, analysisAccess.analysisId))
    .where(eq(analysisAccess.userId, userId))
    .orderBy(desc(analyses.createdAt));
}

/** One entry in a repo's version lineage, oldest = version 1. */
export interface AnalysisVersion {
  id: string; // db uuid (caller wraps with toCloudId)
  version: number; // 1-based ordinal within rows visible to this user, oldest = 1
  createdAt: Date;
  analyzedAt: Date | null; // null for pre-migration rows
  commitSha: string | null;
  summary: string;
  isLatest: boolean;
}

/**
 * The ordered version lineage of the analysis `analysisId`, restricted to rows
 * `userId` may read (INNER JOINed through `analysis_access`). The anchor row
 * defines the lineage via its (`owner_id`, `repo_key`); versions are read-time
 * ordinals (oldest = 1), never stored.
 *
 * Returns [] when the anchor is missing, either id is falsy, or the anchor
 * itself is not among the readable rows (the user can't see it).
 */
export async function listVersionsFor(
  userId: string,
  analysisId: string,
): Promise<AnalysisVersion[]> {
  if (!userId || !analysisId) return [];

  const db = getDb();

  // Resolve the anchor's lineage coordinates.
  const anchorRows = await db
    .select({ ownerId: analyses.ownerId, repoKey: analyses.repoKey })
    .from(analyses)
    .where(eq(analyses.id, analysisId))
    .limit(1);
  const anchor = anchorRows[0];
  if (!anchor) return [];

  // Empty repo_key must never group (shouldn't happen post-backfill): treat the
  // anchor as a lone v1, but only if the user actually has access to it.
  if (anchor.repoKey === "") {
    if (!(await canReadAnalysis(userId, analysisId))) return [];
    const soloRows = await db
      .select({
        id: analyses.id,
        createdAt: analyses.createdAt,
        analyzedAt: analyses.analyzedAt,
        commitSha: analyses.commitSha,
        summary: analyses.summary,
      })
      .from(analyses)
      .where(eq(analyses.id, analysisId))
      .limit(1);
    const solo = soloRows[0];
    if (!solo) return [];
    return [{ ...solo, version: 1, isLatest: true }];
  }

  // Lineage rows the user can read, oldest first.
  const rows = await db
    .select({
      id: analyses.id,
      createdAt: analyses.createdAt,
      analyzedAt: analyses.analyzedAt,
      commitSha: analyses.commitSha,
      summary: analyses.summary,
    })
    .from(analyses)
    .innerJoin(analysisAccess, eq(analysisAccess.analysisId, analyses.id))
    .where(
      and(
        eq(analyses.ownerId, anchor.ownerId),
        eq(analyses.repoKey, anchor.repoKey),
        eq(analysisAccess.userId, userId),
      ),
    )
    .orderBy(asc(analyses.createdAt));

  // Safety: if the anchor isn't in the readable set, the user can't read it.
  if (!rows.some((r) => r.id === analysisId)) return [];

  return rows.map((r, i) => ({
    ...r,
    version: i + 1,
    isLatest: i === rows.length - 1,
  }));
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
