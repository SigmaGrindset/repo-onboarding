import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";
import type { OnboardingProgressAction } from "@/lib/onboarding-progress-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INDEX = 1000;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: "Cloud mode is not configured." }, { status: 503 });
  }
  const { id } = await ctx.params;
  const { uuidFromCloudId } = await import("@/lib/ids");
  const uuid = uuidFromCloudId(id);
  if (!uuid) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const { canReadAnalysis } = await import("@/lib/access");
  if (!(await canReadAnalysis(userId, uuid))) {
    return NextResponse.json({ error: "You do not have access to this analysis." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || typeof (body as { action?: unknown }).action !== "string") {
    return NextResponse.json({ error: "A valid action is required." }, { status: 400 });
  }
  const input = body as OnboardingProgressAction;
  const progress = await import("@/lib/tour-progress");

  switch (input.action) {
    case "markArchitectureRead":
      await progress.markArchitectureRead(userId, uuid);
      break;
    case "setSetupCompleted":
      if (typeof input.completed !== "boolean") {
        return NextResponse.json({ error: "completed must be a boolean." }, { status: 400 });
      }
      await progress.setSetupCompleted(userId, uuid, input.completed);
      break;
    case "reachTourStep":
      if (!Number.isInteger(input.step) || input.step < 1 || input.step > MAX_INDEX) {
        return NextResponse.json({ error: `step must be an integer between 1 and ${MAX_INDEX}.` }, { status: 400 });
      }
      await progress.setTourProgress(userId, uuid, input.step);
      break;
    case "resetTour":
      await progress.resetTourProgress(userId, uuid);
      break;
    case "selectTask":
      if (input.taskIndex !== null &&
          (!Number.isInteger(input.taskIndex) || input.taskIndex < 0 || input.taskIndex > MAX_INDEX)) {
        return NextResponse.json({ error: `taskIndex must be null or an integer between 0 and ${MAX_INDEX}.` }, { status: 400 });
      }
      await progress.setSelectedTask(userId, uuid, input.taskIndex);
      break;
    default:
      return NextResponse.json({ error: "Unknown onboarding progress action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
