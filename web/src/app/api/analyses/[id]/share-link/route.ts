import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";

/**
 * Unlisted-link controls for an analysis (owner only, cloud mode only).
 *
 *  - POST   → create/rotate the link: sets a fresh random share token.
 *  - DELETE → revoke the link: clears the share token (null).
 *
 * Same guard ladder as the sibling routes: cloud-mode 503 → id 404 → auth 401
 * → owner 403.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Guard =
  | { res: NextResponse; uuid?: undefined }
  | { res?: undefined; uuid: string };

async function guard(id: string): Promise<Guard> {
  if (!isCloudMode()) {
    return {
      res: NextResponse.json(
        { error: "Cloud mode is not configured." },
        { status: 503 },
      ),
    };
  }

  const { uuidFromCloudId } = await import("@/lib/ids");
  const uuid = uuidFromCloudId(id);
  if (!uuid) {
    return { res: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return { res: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  }

  const { isOwner } = await import("@/lib/access");
  if (!(await isOwner(userId, uuid))) {
    return {
      res: NextResponse.json(
        { error: "Only the owner can manage sharing." },
        { status: 403 },
      ),
    };
  }

  return { uuid };
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if (g.res) return g.res;

  const { setShareToken } = await import("@/lib/access");
  const shareToken = crypto.randomUUID();
  await setShareToken(g.uuid, shareToken);

  return NextResponse.json({ shareToken });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if (g.res) return g.res;

  const { setShareToken } = await import("@/lib/access");
  await setShareToken(g.uuid, null);

  return NextResponse.json({ ok: true });
}
