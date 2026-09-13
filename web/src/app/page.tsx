import Link from "next/link";
import {
  getFixtureSummary,
  resolveDataSource,
  type AnalysisSummary,
} from "@/lib/datasource";
import { DEMO_ANALYSIS_ID } from "@/lib/demo";
import { isCloudMode } from "@/lib/mode";
import { compactNumber } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { AnalysisGrid, type AnalysisCard } from "@/components/AnalysisGrid";

export const dynamic = "force-dynamic";

/**
 * Who the page is for: a developer browsing fixtures in local mode, a signed-in
 * user's cloud workspace, or a signed-out cloud visitor — who has no workspace,
 * and is shown the public demo instead of an empty page.
 */
type Audience = "local" | "workspace" | "visitor";

async function resolveAudience(): Promise<Audience> {
  if (!isCloudMode()) return "local";
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return userId ? "workspace" : "visitor";
}

const KICKER: Record<Audience, string> = {
  local: "Presentation engine · dev mode",
  workspace: "Your workspace",
  visitor: "Onboarding guides for codebases",
};

export default async function IndexPage() {
  const audience = await resolveAudience();
  const cloud = audience !== "local";

  let analyses: AnalysisSummary[];
  if (audience === "visitor") {
    const demo = await getFixtureSummary(DEMO_ANALYSIS_ID);
    analyses = demo ? [demo] : [];
  } else {
    const dataSource = await resolveDataSource();
    analyses = await dataSource.listAnalyses();
  }

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

  // Masthead figures, derived from what is actually loaded — no rounded-off
  // marketing numbers.
  const totalLoc = cards.reduce((sum, c) => sum + c.newest.totalLoc, 0);
  const languages = new Set(
    cards.map((c) => c.newest.primaryLanguage).filter(Boolean),
  );
  const tourSteps = cards.reduce((sum, c) => sum + c.newest.tourSteps, 0);

  return (
    // `overflow-x-clip` (not hidden) contains the wash's negative inset without
    // turning this into a scroll container, which would break `position:sticky`
    // on the header.
    <div className="relative overflow-x-clip">
      <span aria-hidden className="hero-wash" />

      <div className="relative mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        {/* Masthead: title block left, figures rail right — deliberately
            off-balance rather than a centred stack. */}
        <header className="mb-14 grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 shadow-soft">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <span className="kicker text-muted">{KICKER[audience]}</span>
            </div>

            <h1 className="text-[2.6rem] font-semibold leading-[1.03] tracking-[-0.04em] text-text sm:text-[3.4rem]">
              {audience === "workspace" ? "Your analyses" : "Repo Onboarding"}
            </h1>

            <p className="mt-5 max-w-[46ch] text-[1.05rem] leading-[1.6] text-muted">
              {audience === "workspace" ? (
                <>
                  Analyses you have uploaded or that have been shared with you.
                  Each is rendered entirely from its{" "}
                  <Mono>analysis.json</Mono>. Use{" "}
                  <Inline href="/upload">Upload</Inline> to add another, or{" "}
                  <Inline href="/generate">generate one</Inline> for your own
                  repo.
                </>
              ) : audience === "visitor" ? (
                <>
                  Every analysis is rendered entirely from its{" "}
                  <Mono>analysis.json</Mono> — architecture narrative, an
                  interactive dependency graph, a guided reading tour, churn
                  hotspots and a setup guide. Explore the example below, or{" "}
                  <Inline href="/generate">generate one</Inline> for your own
                  repo.
                </>
              ) : (
                <>
                  Every analysis below is rendered entirely from its{" "}
                  <Mono>analysis.json</Mono> — architecture narrative, an
                  interactive dependency graph, a guided reading tour, churn
                  hotspots and a setup guide. Pick a codebase to explore, or{" "}
                  <Inline href="/generate">generate one</Inline> for your own
                  repo.
                </>
              )}
            </p>
          </div>

          {/* The rail summarises a collection. Beside a lone example card,
              "1 codebase" would read as a statistic about the product. */}
          {cards.length > 0 && audience !== "visitor" ? (
            <dl className="lg:col-span-5 lg:justify-self-end">
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-soft lg:min-w-[22rem]">
                <Figure
                  value={String(cards.length)}
                  label={cards.length === 1 ? "codebase" : "codebases"}
                />
                <Figure value={compactNumber(totalLoc)} label="lines analyzed" />
                <Figure
                  value={
                    tourSteps > 0
                      ? String(tourSteps)
                      : String(languages.size)
                  }
                  label={tourSteps > 0 ? "tour steps" : "languages"}
                />
              </div>
            </dl>
          ) : null}
        </header>

        {analyses.length === 0 ? (
          <EmptyState
            title={cloud ? "No analyses yet" : "No analyses found"}
            hint={
              cloud
                ? "Upload an analysis.json to get started, or sign in if you haven't."
                : "Drop an analysis.json into data/<name>/ at the repo root and refresh."
            }
            action={
              cloud ? (
                <Link
                  href="/upload"
                  className="press inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-raised hover:bg-accent-hover"
                >
                  Upload an analysis
                </Link>
              ) : (
                <Link
                  href="/generate"
                  className="press inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-raised hover:bg-accent-hover"
                >
                  Generate one for your repo
                </Link>
              )
            }
          />
        ) : (
          <>
            {audience === "visitor" ? (
              <p className="kicker mb-4 text-faint">Example analysis</p>
            ) : null}
            {/* Default sort mirrors the server order per mode: cloud rows
                arrive newest-first, the fs source sorts fixtures by name. */}
            <AnalysisGrid cards={cards} defaultSort={cloud ? "newest" : "name"} />
          </>
        )}
      </div>
    </div>
  );
}

/** One masthead figure. Hairline-separated cells, not four floating boxes. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-surface px-4 py-5">
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block font-mono text-[1.45rem] font-semibold leading-none tracking-[-0.02em] tabular-nums text-text">
          {value}
        </span>
        <span className="mt-2 block text-[0.7rem] leading-none text-faint">
          {label}
        </span>
      </dd>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-text">
      {children}
    </code>
  );
}

function Inline({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-accent underline decoration-accent/35 underline-offset-[3px] transition hover:decoration-accent"
    >
      {children}
    </Link>
  );
}
