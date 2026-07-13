import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/mode";

/**
 * Personal API token management for the signed-in user (cloud mode only).
 *
 *  - GET  → the caller's tokens (id, name, prefix, created/last-used), never
 *           any hash or plaintext.
 *  - POST → create a named token; the response carries the plaintext ONCE.
 *
 * Same guard ladder as the other cloud API routes: cloud-mode 503 → Clerk auth
 * 401. Clerk-protected by the default proxy matcher. Cloud-only modules are
 * imported lazily so local mode never loads Clerk/DB.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

  const { listTokens } = await import("@/lib/tokens");
  const tokens = await listTokens(userId);
  return NextResponse.json({ tokens });
}

export async function POST(req: Request) {
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

  const body: { name?: unknown } = await req.json().catch(() => ({}));
  const { normalizeTokenName } = await import("@/lib/token-format");
  const name = normalizeTokenName(body.name);
  if (!name) {
    return NextResponse.json(
      { error: "Enter a name for the token." },
      { status: 400 },
    );
  }

  const { createToken } = await import("@/lib/tokens");
  const created = await createToken(userId, name);
  return NextResponse.json(created, { status: 201 });
}
