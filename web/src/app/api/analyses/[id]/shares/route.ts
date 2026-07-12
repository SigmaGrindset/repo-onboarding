import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";

/**
 * Owner-only sharing controls for an analysis (cloud mode only).
 *
 *  - GET  → the current viewer list (userId + email) and the unlisted-link
 *           share token, if any.
 *  - POST → grant a viewer by email. The email is resolved to a Clerk user;
 *           if no account exists we ask the owner to have them sign up first.
 *
 * Same guard ladder as DELETE /api/analyses/[id]: cloud-mode 503 → id 404 →
 * auth 401 → owner 403. All cloud-only modules are imported lazily.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(
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

  const { isOwner, listViewers, getShareToken } = await import("@/lib/access");
  if (!(await isOwner(userId, uuid))) {
    return NextResponse.json(
      { error: "Only the owner can manage sharing." },
      { status: 403 },
    );
  }

  const [viewerIds, shareToken] = await Promise.all([
    listViewers(uuid),
    getShareToken(uuid),
  ]);

  // Resolve emails via Clerk; skip the call entirely when there are no viewers.
  let viewers: { userId: string; email: string }[] = [];
  if (viewerIds.length > 0) {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const list = await client.users.getUserList({
      userId: viewerIds,
      limit: 100,
    });
    const emailById = new Map(
      list.data.map((u) => [u.id, u.primaryEmailAddress?.emailAddress]),
    );
    viewers = viewerIds.map((vid) => ({
      userId: vid,
      // Fallback to the id covers users deleted from Clerk.
      email: emailById.get(vid) ?? vid,
    }));
  }

  return NextResponse.json({ viewers, shareToken });
}

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

  const { isOwner, addViewer } = await import("@/lib/access");
  if (!(await isOwner(userId, uuid))) {
    return NextResponse.json(
      { error: "Only the owner can manage sharing." },
      { status: 403 },
    );
  }

  const body: { email?: unknown } = await req.json().catch(() => ({}));
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  const list = await client.users.getUserList({
    emailAddress: [email],
    limit: 100,
  });
  // The emailAddress filter is a case-insensitive PARTIAL match, so re-verify an
  // exact (case-insensitive) match before granting anything.
  const target = list.data.find((u) =>
    u.emailAddresses.some(
      (e) => e.emailAddress.toLowerCase() === email,
    ),
  );
  if (!target) {
    return NextResponse.json(
      { error: "No account found for that email. Ask them to sign up first." },
      { status: 404 },
    );
  }

  if (target.id === userId) {
    return NextResponse.json(
      { error: "That's you — you already own this analysis." },
      { status: 400 },
    );
  }

  await addViewer(uuid, target.id);

  const resolvedEmail =
    target.emailAddresses.find(
      (e) => e.emailAddress.toLowerCase() === email,
    )?.emailAddress ?? email;

  return NextResponse.json({ userId: target.id, email: resolvedEmail });
}
