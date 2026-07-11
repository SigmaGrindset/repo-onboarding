import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";

/**
 * DELETE /api/analyses/[id] — remove an analysis (owner only, cloud mode only).
 *
 * Ownership is enforced via `isOwner` (role='owner' in analysis_access).
 * Deleting the `analyses` row cascades to its `analysis_access` rows; the
 * private blob is removed best-effort afterwards.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isCloudMode()) {
    return NextResponse.json(
      { error: "Cloud mode is not configured." },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  const { uuidFromCloudId } = await import("@/lib/ids");
  const uuid = uuidFromCloudId(id);
  if (!uuid) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in." }, { status: 401 });
  }

  const { isOwner, getBlobKey } = await import("@/lib/access");
  if (!(await isOwner(userId, uuid))) {
    return NextResponse.json(
      { error: "Only the owner can delete this analysis." },
      { status: 403 },
    );
  }

  const key = await getBlobKey(uuid);

  const { getDb } = await import("@/db/db");
  const { analyses } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  // FK cascade removes the analysis_access rows.
  await getDb().delete(analyses).where(eq(analyses.id, uuid));

  if (key) {
    const { deleteAnalysisPayload } = await import("@/lib/blob");
    await deleteAnalysisPayload(key);
  }

  return NextResponse.json({ ok: true });
}
