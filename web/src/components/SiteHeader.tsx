import Link from "next/link";
import { isCloudMode } from "@/lib/mode";
import { CloudAuthNav } from "./CloudAuthNav";
import { ThemeToggle } from "./ThemeToggle";
import { HeaderLink } from "./HeaderLink";

/**
 * Top bar shown on every page. In cloud mode it hosts Clerk sign-in / user
 * controls (see CloudAuthNav); in local mode it shows "Generate" and "Upload"
 * links (the upload page explains that cloud mode is not configured) and a
 * mode badge.
 */
export function SiteHeader() {
  const cloud = isCloudMode();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="press group flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent font-mono text-[0.7rem] font-semibold text-accent-fg shadow-soft transition-transform duration-200 group-hover:rotate-[-4deg]"
          >
            {"{}"}
          </span>
          <span className="truncate text-[0.9rem] font-semibold tracking-[-0.015em] text-text">
            Repo Onboarding
          </span>
          {!cloud && (
            <span className="hidden shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.6rem] font-medium uppercase tracking-[0.1em] text-faint sm:inline-block">
              local
            </span>
          )}
        </Link>

        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          {cloud ? (
            <CloudAuthNav />
          ) : (
            <nav aria-label="Main" className="hidden items-center gap-5 min-[480px]:flex">
              <HeaderLink href="/generate">Generate</HeaderLink>
              <HeaderLink href="/upload">Upload</HeaderLink>
            </nav>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
