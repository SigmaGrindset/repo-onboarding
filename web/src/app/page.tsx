import Link from "next/link";
import { resolveDataSource } from "@/lib/datasource";
import { isCloudMode } from "@/lib/mode";
import { compactNumber, formatDate, snippet } from "@/lib/format";
import { Badge, EmptyState } from "@/components/ui";
import { TourProgressBadge } from "@/components/TourProgressBadge";

export const dynamic = "force-dynamic";

export default async function IndexPage() {
  const cloud = isCloudMode();
  const dataSource = await resolveDataSource();
  const analyses = await dataSource.listAnalyses();

  // Group a repo's versions into one card. Cloud rows carry a `repoKey`; the
  // list is newest-first, so the first row seen per key is the newest and the
  // one rendered. Fixtures have no repoKey — they fall back to their unique id,
  // so every fixture stays its own single-version group (pixel-identical).
  const groups = new Map<string, { newest: (typeof analyses)[number]; count: number }>();
  for (const a of analyses) {
    const key = a.repoKey ?? a.id;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { newest: a, count: 1 });
    }
  }
  const cards = [...groups.values()];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="mb-12">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          {cloud ? "Presentation engine · your workspace" : "Presentation engine · dev mode"}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
          {cloud ? "Your analyses" : "Repo Onboarding"}
        </h1>
        <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-muted">
          {cloud ? (
            <>
              Analyses you have uploaded or that have been shared with you. Each
              is rendered entirely from its{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
                analysis.json
              </code>
              . Use{" "}
              <Link href="/upload" className="text-accent hover:underline">
                Upload
              </Link>{" "}
              to add another, or{" "}
              <Link href="/generate" className="text-accent hover:underline">
                generate one
              </Link>{" "}
              for your own repo.
            </>
          ) : (
            <>
              Every analysis below is rendered entirely from its{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
                analysis.json
              </code>{" "}
              — architecture narrative, an interactive dependency graph, a guided
              reading tour, churn hotspots and a setup guide. Pick a codebase to
              explore, or{" "}
              <Link href="/generate" className="text-accent hover:underline">
                generate one
              </Link>{" "}
              for your own repo.
            </>
          )}
        </p>
      </header>

      {analyses.length === 0 ? (
        <EmptyState
          title={cloud ? "No analyses yet" : "No analyses found"}
          hint={
            cloud
              ? "Upload an analysis.json to get started, or sign in if you haven't."
              : "Drop an analysis.json into data/<name>/ at the repo root and refresh."
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {cards.map(({ newest: a, count }) => {
            const hasStats = a.totalFiles > 0 || a.totalLoc > 0;
            return (
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
                    {a.primaryLanguage ? (
                      <Badge className="shrink-0 border-accent/25 bg-accent-soft text-accent">
                        {a.primaryLanguage}
                      </Badge>
                    ) : null}
                  </div>

                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                    {snippet(a.summary, 200)}
                  </p>

                  <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-faint">
                    {hasStats ? (
                      <>
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
                      </>
                    ) : null}
                    {a.tourSteps > 0 ? (
                      <TourProgressBadge
                        analysisId={a.id}
                        totalSteps={a.tourSteps}
                        furthest={a.tourFurthest}
                      />
                    ) : null}
                    {count > 1 ? (
                      <Badge className="border-border bg-surface-2 text-muted">
                        {count} versions
                      </Badge>
                    ) : null}
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
