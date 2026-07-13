/**
 * The shared upload pipeline: everything that happens AFTER authentication when
 * an analysis.json is published, regardless of how the caller authenticated.
 *
 * Two entry points share this exact behavior byte-for-byte:
 *  - `POST /api/analyses`     — browser upload, Clerk-session authenticated.
 *  - `POST /api/v1/analyses`  — CLI upload, bearer-token authenticated.
 *
 * Given a resolved `userId` and the raw request body, it runs: size guard →
 * JSON parse → schema validation → repo-key derivation → blob-first write →
 * atomic DB batch (analysis row + owner access row) → blob cleanup on DB
 * failure → cosmetic version count. The outcome is a discriminated union the
 * route handlers translate directly into HTTP responses; the response bodies
 * and status codes are identical to what the original inline handler produced.
 *
 * LAZY IMPORTS: like the routes, this module imports only types at the top
 * level. Clerk/DB/Blob/validation modules are `await import(...)`-ed so that
 * merely loading a route (which imports this) never evaluates cloud-only code
 * in local mode. `performUpload` is only ever called after a cloud gate.
 *
 * Server-only.
 */

import type { ValidationIssue } from "@/lib/validateAnalysis";

/** ~5 MB cap, matching the browser client-side pre-check. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * The result of an upload attempt. On success `id` is the public cloud id
 * (`db_<uuid>`) — ready to drop into `/analysis/<id>`. On failure the fields
 * mirror exactly the JSON body the original handler returned for that status.
 */
export type UploadOutcome =
  | {
      ok: true;
      status: 201;
      id: string;
      version: number;
      repoName: string;
    }
  | {
      ok: false;
      status: 400 | 413 | 500;
      error: string;
      /** Present for schema-validation 400s. */
      issues?: ValidationIssue[];
      /** Present for save-failure 500s (kept for body parity with the old route). */
      errors?: string[];
    };

/**
 * Run the full post-auth upload pipeline for `userId` over `rawBody` (the
 * request body already read as text). Never throws for expected failures —
 * they come back as `{ ok: false, ... }` outcomes.
 */
export async function performUpload(
  userId: string,
  rawBody: string,
): Promise<UploadOutcome> {
  if (rawBody.length > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: "File too large (max 5 MB)." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "Body is not valid JSON." };
  }

  const { validateAnalysis } = await import("@/lib/validateAnalysis");
  const result = await validateAnalysis(parsed);
  if (!result.valid) {
    return {
      ok: false,
      status: 400,
      error: "analysis.json failed schema validation.",
      issues: result.issues.slice(0, 50),
    };
  }
  const analysis = result.data;

  const { repoKeyFor } = await import("@/lib/repo-key");
  const repoKey = repoKeyFor(analysis.metadata.repoUrl, analysis.metadata.repoName);

  const id = crypto.randomUUID();

  // Store the payload first; if the DB write fails, best-effort remove the blob.
  const { blobKeyFor, putAnalysisPayload, deleteAnalysisPayload } = await import(
    "@/lib/blob"
  );
  const key = blobKeyFor(userId, id);
  const storedKey = await putAnalysisPayload(key, rawBody);

  try {
    const { getDb } = await import("@/db/db");
    const { analyses, analysisAccess } = await import("@/db/schema");
    const db = getDb();
    // Neon HTTP has no interactive transactions; batch runs atomically.
    await db.batch([
      db.insert(analyses).values({
        id,
        ownerId: userId,
        repoName: analysis.metadata.repoName,
        repoUrl: analysis.metadata.repoUrl,
        repoKey,
        blobKey: storedKey,
        summary: analysis.pitch.summary,
        commitSha: analysis.metadata.commitSha,
        analyzedAt: new Date(analysis.metadata.analyzedAt),
        tourSteps: analysis.tour.length,
      }),
      db.insert(analysisAccess).values({
        analysisId: id,
        userId,
        role: "owner",
      }),
    ]);
  } catch (err) {
    await deleteAnalysisPayload(storedKey);
    return {
      ok: false,
      status: 500,
      error: "Failed to save the analysis.",
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  // Post-hoc, cosmetic version number: count this owner's rows in the same
  // lineage. Read-time ordinals (see listVersionsFor) are authoritative; this is
  // only a friendly hint for the just-uploaded version and never persisted.
  let version = 1;
  try {
    const { getDb } = await import("@/db/db");
    const { analyses } = await import("@/db/schema");
    const { and, eq, count } = await import("drizzle-orm");
    const db = getDb();
    const rows = await db
      .select({ n: count() })
      .from(analyses)
      .where(and(eq(analyses.ownerId, userId), eq(analyses.repoKey, repoKey)));
    version = rows[0]?.n ?? 1;
  } catch {
    // Non-fatal: the row is already committed. Fall back to 1.
  }

  const { toCloudId } = await import("@/lib/ids");
  return {
    ok: true,
    status: 201,
    id: toCloudId(id),
    version,
    repoName: analysis.metadata.repoName,
  };
}
