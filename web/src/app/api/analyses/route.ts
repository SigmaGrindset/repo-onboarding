import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";

/**
 * POST /api/analyses — upload a new analysis.json (cloud mode only).
 *
 * Flow: require auth → size guard → parse JSON → validate against
 * analysis.schema.json (Ajv) → store payload to private Blob → insert the
 * `analyses` row AND an owner `analysis_access` row atomically → return the new
 * cloud id. All cloud-only modules are imported lazily so local mode never
 * loads Clerk/DB/Blob.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // ~5 MB

export async function POST(req: Request) {
  if (!isCloudMode()) {
    return NextResponse.json(
      { error: "Cloud mode is not configured. Uploads are disabled in local mode." },
      { status: 503 },
    );
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (declaredLen && declaredLen > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)." }, { status: 413 });
  }

  const body = await req.text();
  if (body.length > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON." }, { status: 400 });
  }

  const { validateAnalysis } = await import("@/lib/validateAnalysis");
  const result = await validateAnalysis(parsed);
  if (!result.valid) {
    return NextResponse.json(
      {
        error: "analysis.json failed schema validation.",
        errors: result.errors.slice(0, 50),
      },
      { status: 400 },
    );
  }
  const analysis = result.data;

  const id = crypto.randomUUID();

  // Store the payload first; if the DB write fails, best-effort remove the blob.
  const { blobKeyFor, putAnalysisPayload, deleteAnalysisPayload } = await import(
    "@/lib/blob"
  );
  const key = blobKeyFor(userId, id);
  const storedKey = await putAnalysisPayload(key, body);

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
        blobKey: storedKey,
        summary: analysis.pitch.summary,
      }),
      db.insert(analysisAccess).values({
        analysisId: id,
        userId,
        role: "owner",
      }),
    ]);
  } catch (err) {
    await deleteAnalysisPayload(storedKey);
    return NextResponse.json(
      {
        error: "Failed to save the analysis.",
        errors: [err instanceof Error ? err.message : String(err)],
      },
      { status: 500 },
    );
  }

  const { toCloudId } = await import("@/lib/ids");
  return NextResponse.json({ id: toCloudId(id) }, { status: 201 });
}
