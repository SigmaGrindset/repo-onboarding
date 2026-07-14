"use client";

/**
 * Auth controls for cloud mode. Rendered only when the app is in cloud mode
 * (see SiteHeader), so Clerk hooks always have a ClerkProvider ancestor.
 *
 * Signed in, the bar stays minimal: one "New analysis" CTA (→ /generate,
 * the start of the generate-then-upload flow, which links on to /upload)
 * plus the Clerk avatar, with "Account" and "Upload" in the avatar menu.
 */

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

function AccountIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="5" r="2.75" />
      <path d="M2.75 13.5a5.25 5.25 0 0 1 10.5 0" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 10.5V2.5M8 2.5 4.75 5.75M8 2.5l3.25 3.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 10.75v1.75a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1.75" strokeLinecap="round" />
    </svg>
  );
}

export function CloudAuthNav() {
  const { isLoaded, isSignedIn } = useAuth();

  // Reserve space until Clerk resolves, to avoid layout shift.
  if (!isLoaded) return <div className="h-8 w-24" aria-hidden />;

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/generate"
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:bg-accent-hover"
        >
          New analysis
        </Link>
        <UserButton>
          <UserButton.MenuItems>
            <UserButton.Link
              label="Account & API tokens"
              href="/account"
              labelIcon={<AccountIcon />}
            />
            <UserButton.Link
              label="Upload analysis.json"
              href="/upload"
              labelIcon={<UploadIcon />}
            />
          </UserButton.MenuItems>
        </UserButton>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/generate"
        className="text-xs font-medium text-muted transition hover:text-text"
      >
        Generate
      </Link>
      <SignInButton mode="modal">
        <button className="text-xs font-medium text-muted transition hover:text-text">
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
