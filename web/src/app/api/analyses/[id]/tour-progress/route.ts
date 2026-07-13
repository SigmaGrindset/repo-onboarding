import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";

/**
 * POST /api/analyses/[id]/tour-progress — record the furthest guided-tour step
 * the signed-in user has reached (cloud mode, `db_` ids only; every other id
 * persists to localStorage client-side and never calls this).
 *
 * Guard ladder mirrors the sibling routes: cloud-mode 503 → id 404 → auth 401
 * → access 403. Gated on read access (not ownership) — viewers take tours too.
 * The write is a monotonic GREATEST upsert, so replays and out-of-order
 * requests can never lower progress.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sanity cap; real tours are single digits. */
const MAX_STEP = 1000;

export async function POST(
  req: Request,
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

  const { canReadAnalysis } = await import("@/lib/access");
  if (!(await canReadAnalysis(userId, uuid))) {
    return NextResponse.json(
      { error: "You do not have access to this analysis." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON." }, { status: 400 });
  }
  const furthestStep = (body as { furthestStep?: unknown })?.furthestStep;
  if (
    typeof furthestStep !== "number" ||
    !Number.isInteger(furthestStep) ||
    furthestStep < 1 ||
    furthestStep > MAX_STEP
  ) {
    return NextResponse.json(
      { error: `furthestStep must be an integer between 1 and ${MAX_STEP}.` },
      { status: 400 },
    );
  }

  const { setTourProgress } = await import("@/lib/tour-progress");
  await setTourProgress(userId, uuid, furthestStep);

  return NextResponse.json({ ok: true });
}
