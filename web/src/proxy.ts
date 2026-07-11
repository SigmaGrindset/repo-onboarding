/**
 * Dual-mode proxy (Next.js 16's renamed "middleware" convention).
 *
 *  - local mode: a pass-through. Clerk is never imported or invoked, so no keys
 *    are required and nothing reaches the network.
 *  - cloud mode: Clerk protects everything except the home page and Clerk's own
 *    sign-in/sign-up routes. `/analysis/*`, `/upload` and `/api/*` require auth.
 *
 * `@clerk/nextjs/server` is imported dynamically, only in cloud mode, so the
 * Edge bundle stays lean and local mode never evaluates Clerk code. Clerk 7 on
 * Next 16 recognizes the `proxy` file convention as its middleware entry point.
 */

import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { isCloudMode } from "@/lib/mode";

type ProxyFn = (
  req: NextRequest,
  ev: NextFetchEvent,
) => Response | Promise<Response> | void | Promise<void>;

let cloudHandler: ProxyFn | null = null;

async function getCloudHandler(): Promise<ProxyFn> {
  if (cloudHandler) return cloudHandler;
  const { clerkMiddleware, createRouteMatcher } = await import(
    "@clerk/nextjs/server"
  );
  // Public routes: home (with sign-in CTA) and Clerk's sign-in/sign-up flows.
  const isPublic = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
  cloudHandler = clerkMiddleware(async (auth, req) => {
    if (!isPublic(req)) {
      await auth.protect();
    }
  }) as unknown as ProxyFn;
  return cloudHandler;
}

export default async function proxy(
  req: NextRequest,
  ev: NextFetchEvent,
): Promise<Response | void> {
  if (!isCloudMode()) return NextResponse.next();
  const handler = await getCloudHandler();
  return (await handler(req, ev)) ?? undefined;
}

export const config = {
  matcher: [
    // Skip Next internals and static files unless referenced via a query param.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
