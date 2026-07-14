import Link from "next/link";
import { resolveDataSource } from "@/lib/datasource";
import { isCloudMode } from "@/lib/mode";
import { EmptyState } from "@/components/ui";
import { AnalysisGrid, type AnalysisCard } from "@/components/AnalysisGrid";

export const dynamic = "force-dynamic";

export default async function IndexPage() {
  const cloud = isCloudMode();
  const dataSource = await resolveDataSource();
  const analyses = await dataSource.listAnalyses();

  // Group a repo's versions into one card. Cloud rows carry a `repoKey`; the
  // list is newest-first, so the first row seen per key is the newest and the
  // one rendered. Fixtures have no repoKey — they fall back to their unique id,
  // so every fixture stays its own single-version group (pixel-identical).
  const groups = new Map<string, AnalysisCard>();
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
        // Default sort mirrors the server order per mode: cloud rows arrive
        // newest-first, the fs source sorts fixtures by name.
        <AnalysisGrid cards={cards} defaultSort={cloud ? "newest" : "name"} />
      )}
    </div>
  );
}
