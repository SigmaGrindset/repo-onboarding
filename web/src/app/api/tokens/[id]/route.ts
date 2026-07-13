import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";

/**
 * DELETE /api/tokens/[id] — revoke (hard-delete) one of the caller's API
 * tokens (cloud mode only).
 *
 * Guard ladder: cloud-mode 503 → Clerk auth 401 → 404 when the id is not one
 * of the caller's tokens (`revokeToken` deletes only rows owned by `userId`, so
 * this never touches another user's token). Cloud-only modules imported lazily.
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

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const { revokeToken } = await import("@/lib/tokens");
  const revoked = await revokeToken(userId, id);
  if (!revoked) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
