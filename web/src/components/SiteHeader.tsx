import Link from "next/link";
import { isCloudMode } from "@/lib/mode";
import { CloudAuthNav } from "./CloudAuthNav";

/**
 * Top bar shown on every page. In cloud mode it hosts Clerk sign-in / user
 * controls; in local mode it shows a plain "Upload" link (the upload page
 * explains that cloud mode is not configured) and a mode badge.
 */
export function SiteHeader() {
  const cloud = isCloudMode();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-sm font-semibold text-text">
            Repo Onboarding
          </span>
          {!cloud && (
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[0.65rem] font-medium text-muted">
              local
            </span>
          )}
        </Link>

        {cloud ? (
          <CloudAuthNav />
        ) : (
          <Link
            href="/upload"
            className="text-xs font-medium text-muted transition hover:text-text"
          >
            Upload
          </Link>
        )}
      </div>
    </header>
  );
}
