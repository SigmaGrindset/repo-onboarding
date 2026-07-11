"use client";

/**
 * Auth controls for cloud mode. Rendered only when the app is in cloud mode
 * (see SiteHeader), so Clerk hooks always have a ClerkProvider ancestor.
 */

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

export function CloudAuthNav() {
  const { isLoaded, isSignedIn } = useAuth();

  // Reserve space until Clerk resolves, to avoid layout shift.
  if (!isLoaded) return <div className="h-8 w-24" aria-hidden />;

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/upload"
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:bg-accent-hover"
        >
          Upload
        </Link>
        <UserButton />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal">
        <button className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:border-border-strong">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:bg-accent-hover">
          Sign up
        </button>
      </SignUpButton>
    </div>
  );
}
