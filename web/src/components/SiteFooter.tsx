import Link from "next/link";
import { isCloudMode } from "@/lib/mode";

const REPO_URL = "https://github.com/SigmaGrindset/repo-onboarding";

/**
 * Closing rule for every page. Deliberately one row rather than a four-column
 * link farm: the only destinations worth a permanent slot are the two entry
 * points into the pipeline and the source. Links point at pages that exist —
 * nothing here is a placeholder.
 */
export function SiteFooter() {
  const cloud = isCloudMode();
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[0.8rem] leading-relaxed text-faint">
          <span className="font-medium text-muted">Repo Onboarding</span> — every
          page here is rendered from one{" "}
          <code className="font-mono text-[0.9em] text-muted">analysis.json</code>
          .
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href="/generate"
            className="text-[0.8rem] font-medium text-muted transition hover:text-accent"
          >
            Generate
          </Link>
          <Link
            href="/upload"
            className="text-[0.8rem] font-medium text-muted transition hover:text-accent"
          >
            Upload
          </Link>
          {cloud ? (
            <Link
              href="/account"
              className="text-[0.8rem] font-medium text-muted transition hover:text-accent"
            >
              Account
            </Link>
          ) : null}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-muted transition hover:text-accent"
          >
            Source
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6.5 3.5H3.5v9h9v-3M9.5 3.5h3v3M12.5 3.5 7 9" />
            </svg>
          </a>
        </nav>
      </div>
    </footer>
  );
}
