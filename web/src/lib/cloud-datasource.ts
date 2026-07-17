/**
 * Cloud-mode data source: Neon Postgres (metadata) + Vercel Blob (payload),
 * gated by the `analysis_access` authorization table.
 *
 * Implements the same `DataSource` contract as the fs source, so every page and
 * API talks to one interface. This module is imported ONLY in cloud mode (via
 * `resolveDataSource`), so its Clerk/DB/Blob imports never load locally.
 *
 * Id handling:
 *  - `st_<token>` share ids resolve first, WITHOUT auth — the unlisted-link
 *    token is itself the capability, so anyone with the URL can view.
 *  - `db_<uuid>` ids resolve here (DB + Blob, access-checked).
 *  - Fixture ids fall through to the fs source, so public demo analyses stay
 *    viewable by direct link even in cloud mode.
 *
 * The signed-in user is read from Clerk inside `getAnalysis`/`listAnalyses`,
 * which keeps the `DataSource` interface unchanged AND guarantees every read
 * path passes through the access helper — callers cannot bypass it.
 */

import { auth } from "@clerk/nextjs/server";
import type { Analysis } from "@schema/analysis";
import type { AnalysisSummary, DataSource } from "./datasource";
import { fsDataSource } from "./datasource";
import {
  isCloudId,
  isShareId,
  toCloudId,
  tokenFromShareId,
  uuidFromCloudId,
} from "./ids";
import {
  canReadAnalysis,
  getAnalysisByShareToken,
  getBlobKey,
  listAnalysesFor,
} from "./access";
import { getAnalysisPayload } from "./blob";
import { getOnboardingProgressMap } from "./tour-progress";

async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

export const cloudDataSource: DataSource = {
  async listAnalyses(): Promise<AnalysisSummary[]> {
    const userId = await currentUserId();
    if (!userId) return [];
    const rows = await listAnalysesFor(userId);
    // One batched read of this user's tour progress across all listed rows,
    // so the index cards render "4/9 steps" server-side.
    const progress = await getOnboardingProgressMap(
      userId,
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({
      id: toCloudId(r.id),
      repoName: r.repoName,
      repoUrl: r.repoUrl,
      repoKey: r.repoKey,
      // Language/size stats live only in the payload, not the metadata table.
      // The index card degrades gracefully when these are empty/zero.
      primaryLanguage: "",
      totalFiles: 0,
      totalLoc: 0,
      analyzedAt: r.createdAt.toISOString(),
      summary: r.summary,
      tourSteps: r.tourSteps,
      firstTaskCount: 0,
      tourFurthest: Math.min(progress.get(r.id)?.tourFurthest ?? 0, r.tourSteps),
      onboardingProgress: progress.get(r.id),
    }));
  },

  async getAnalysis(id: string): Promise<Analysis | null> {
    // Unlisted-link ids resolve by their secret token — NO auth, NO access
    // check. Holding the token is the capability to view.
    if (isShareId(id)) {
      const token = tokenFromShareId(id);
      if (!token) return null;
      const row = await getAnalysisByShareToken(token);
      if (!row) return null;
      const raw = await getAnalysisPayload(row.blobKey);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Analysis;
      } catch {
        return null;
      }
    }

    // Fixtures remain public demos, readable by direct link in cloud mode too.
    if (!isCloudId(id)) return fsDataSource.getAnalysis(id);

    const uuid = uuidFromCloudId(id);
    if (!uuid) return null;

    const userId = await currentUserId();
    if (!userId) return null;

    // THE authorization chokepoint — no cloud payload is returned without it.
    if (!(await canReadAnalysis(userId, uuid))) return null;

    const blobKey = await getBlobKey(uuid);
    if (!blobKey) return null;

    const raw = await getAnalysisPayload(blobKey);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as Analysis;
    } catch {
      return null;
    }
  },
};
