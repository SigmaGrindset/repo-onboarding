import Link from "next/link";
import { dataSource } from "@/lib/datasource";
import { compactNumber, formatDate, snippet } from "@/lib/format";
import { Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function IndexPage() {
  const analyses = await dataSource.listAnalyses();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="mb-12">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          Presentation engine · dev mode
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
          Repo Onboarding
        </h1>
        <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-muted">
          Every analysis below is rendered entirely from its{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
            analysis.json
          </code>{" "}
          — architecture narrative, an interactive dependency graph, a guided
          reading tour, churn hotspots and a setup guide. Pick a codebase to
          explore.
        </p>
      </header>

      {analyses.length === 0 ? (
        <EmptyState
          title="No analyses found"
          hint="Drop an analysis.json into data/<name>/ at the repo root and refresh."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {analyses.map((a) => (
            <li key={a.id}>
              <Link
                href={`/analysis/${a.id}`}
                className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition hover:border-border-strong hover:shadow-lg hover:shadow-black/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-text transition group-hover:text-accent">
                      {a.repoName}
                    </h2>
                    <p className="mt-0.5 text-xs text-faint">
                      Analyzed {formatDate(a.analyzedAt)}
                    </p>
                  </div>
                  <Badge className="shrink-0 border-accent/25 bg-accent-soft text-accent">
                    {a.primaryLanguage}
                  </Badge>
                </div>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                  {snippet(a.summary, 200)}
                </p>

                <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-faint">
                  <span>
                    <span className="font-medium text-muted">
                      {compactNumber(a.totalFiles)}
                    </span>{" "}
                    files
                  </span>
                  <span>
                    <span className="font-medium text-muted">
                      {compactNumber(a.totalLoc)}
                    </span>{" "}
                    LOC
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 font-medium text-accent opacity-0 transition group-hover:opacity-100">
                    Explore
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M6 3.5 10.5 8 6 12.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
