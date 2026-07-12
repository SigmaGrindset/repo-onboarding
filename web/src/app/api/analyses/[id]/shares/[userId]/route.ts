import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";

/**
 * DELETE /api/analyses/[id]/shares/[userId] — revoke a viewer's access
 * (owner only, cloud mode only).
 *
 * Same guard ladder as the sibling routes. `removeViewer` is constrained to
 * role='viewer', so the owner row can never be removed here.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> },
) {
  if (!isCloudMode()) {
    return NextResponse.json(
      { error: "Cloud mode is not configured." },
      { status: 503 },
    );
  }

  const { id, userId: targetUserId } = await ctx.params;
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

  const { isOwner, removeViewer } = await import("@/lib/access");
  if (!(await isOwner(userId, uuid))) {
    return NextResponse.json(
      { error: "Only the owner can manage sharing." },
      { status: 403 },
    );
  }

  await removeViewer(uuid, targetUserId);

  return NextResponse.json({ ok: true });
}
