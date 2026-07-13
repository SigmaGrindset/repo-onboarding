import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";

/**
 * POST /api/v1/analyses — publish an analysis.json from the CLI (cloud mode
 * only), authenticated by a personal API token instead of a Clerk session.
 *
 * Flow: cloud gate 503 → `Authorization: Bearer roa_…` → `resolveTokenUser`
 * (401 on missing/invalid/revoked) → request-specific size pre-check → the
 * shared `performUpload` pipeline. Success returns the new id plus an absolute
 * `url` the CLI can print for the user to open in a browser; failures pass the
 * pipeline's status/error/issues straight through.
 *
 * This route is listed in `proxy.ts`'s `isPublic` matcher (so Clerk does not
 * 401/redirect it) BECAUSE it performs its own bearer authentication here. All
 * cloud-only modules are imported lazily.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCloudMode()) {
    return NextResponse.json(
      { error: "Cloud mode is not configured. Uploads are disabled in local mode." },
      { status: 503 },
    );
  }

  const { resolveTokenUser } = await import("@/lib/tokens");
  const userId = await resolveTokenUser(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json(
      { error: "Invalid or missing API token." },
      { status: 401 },
    );
  }

  const { MAX_UPLOAD_BYTES, performUpload } = await import("@/lib/uploadAnalysis");

  // Request-specific early reject: bail before buffering an over-large body.
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (declaredLen && declaredLen > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)." }, { status: 413 });
  }

  const body = await req.text();
  const outcome = await performUpload(userId, body);

  if (outcome.ok) {
    const { siteUrl } = await import("@/lib/site");
    return NextResponse.json(
      {
        id: outcome.id,
        version: outcome.version,
        repoName: outcome.repoName,
        url: `${siteUrl()}/analysis/${outcome.id}`,
      },
      { status: 201 },
    );
  }

  const errorBody: Record<string, unknown> = { error: outcome.error };
  if (outcome.issues) errorBody.issues = outcome.issues;
  if (outcome.errors) errorBody.errors = outcome.errors;
  return NextResponse.json(errorBody, { status: outcome.status });
}
