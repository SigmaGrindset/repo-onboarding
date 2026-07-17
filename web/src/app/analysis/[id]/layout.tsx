import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnalysisCached } from "@/lib/datasource";
import { formatDate, shortSha, snippet } from "@/lib/format";
import { SectionNav } from "@/components/SectionNav";
import { StalenessBadge } from "@/components/StalenessBadge";
import { ShareDialog } from "@/components/ShareDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { buildSearchIndex } from "@/lib/search-index";
import { buildSuggestedQuestions } from "@/lib/suggested-questions";
import { isCloudMode } from "@/lib/mode";
import { isCloudId, uuidFromCloudId, isShareId } from "@/lib/ids";
import { isChatEnabled } from "@/lib/chat/config";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { OnboardingProgressProvider } from "@/components/OnboardingProgressProvider";
import { OnboardingSidebarCard } from "@/components/OnboardingSidebarCard";
import { AnalysisRefreshCommand } from "@/components/AnalysisRefreshCommand";
import { EMPTY_ONBOARDING_PROGRESS, normalizeOnboardingProgress } from "@/lib/onboarding-progress-shared";

export const dynamic = "force-dynamic";

/**
 * Per-analysis metadata so a shared link unfurls with the repo's name and pitch
 * rather than the generic site title. The `og:image` / `twitter:image` tags are
 * injected automatically by the sibling `opengraph-image.tsx`; here we set the
 * title, description and the large-image Twitter card. Returns empty metadata
 * for an unresolved id so it inherits the root defaults.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const analysis = await getAnalysisCached(id);
  if (!analysis) return {};

  const { metadata, pitch } = analysis;
  const title = `${metadata.repoName} · Repo Onboarding`;
  const description = snippet(pitch.summary, 200);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "Repo Onboarding",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function AnalysisLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const analysis = await getAnalysisCached(id);
  if (!analysis) notFound();

  const { metadata } = analysis;
  const sha = shortSha(metadata.commitSha);

  let onboardingStorage: "local" | "db" = "local";
  let initialOnboardingProgress = { ...EMPTY_ONBOARDING_PROGRESS };
  if (isCloudMode() && isCloudId(id)) {
    const uuid = uuidFromCloudId(id);
    if (uuid) {
      const { auth } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      if (userId) {
        onboardingStorage = "db";
        const { getOnboardingProgress } = await import("@/lib/tour-progress");
        initialOnboardingProgress = normalizeOnboardingProgress(
          await getOnboardingProgress(userId, uuid),
          analysis.tour.length,
          analysis.firstTasks.length,
        );
      }
    }
  }

  // "Ask this repo" chat: available when the AI Gateway key is set, except for
  // anonymous share-link visitors in cloud mode (the API rejects them too, so
  // showing the launcher would only offer a guaranteed 403). Only booleans and
  // strings cross to the client — never the key itself.
  const chatAvailable = isChatEnabled() && !(isCloudMode() && isShareId(id));

  // Owner-only Share control: cloud mode + a db_ id whose owner is the signer.
  // st_ share ids fail isCloudId, so anonymous link viewers never see it.
  // In the same pass, resolve the version lineage so the info card can link to
  // history when more than one version is readable.
  let canShare = false;
  let canRefresh = !isCloudMode();
  let versionOrdinal: number | null = null;
  let versionCount = 0;
  if (isCloudMode() && isCloudId(id)) {
    const uuid = uuidFromCloudId(id);
    if (uuid) {
      const { auth } = await import("@clerk/nextjs/server");
      const { isOwner, listVersionsFor } = await import("@/lib/access");
      const { userId } = await auth();
      if (userId) {
        canShare = await isOwner(userId, uuid);
        canRefresh = canShare;
        const versions = await listVersionsFor(userId, uuid);
        versionCount = versions.length;
        versionOrdinal = versions.find((v) => v.id === uuid)?.version ?? null;
      }
    }
  }

  return (
    <OnboardingProgressProvider
      analysisId={id}
      storage={onboardingStorage}
      initialProgress={initialOnboardingProgress}
      totalTourSteps={analysis.tour.length}
      taskCount={analysis.firstTasks.length}
    >
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8 lg:py-8">
      {/* Sidebar */}
      <aside className="lg:w-64 lg:shrink-0">
        <div className="lg:sticky lg:top-6">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-text"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M10 3.5 5.5 8 10 12.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            All analyses
          </Link>

          <div className="mb-5 rounded-xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold leading-tight text-text">
              {metadata.repoName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-faint">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                {metadata.primaryLanguage}
              </span>
              {sha ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{sha}</span>
                </>
              ) : null}
            </div>
            {metadata.repoUrl ? (
              <a
                href={metadata.repoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 block truncate text-[0.7rem] text-accent hover:underline"
              >
                {metadata.repoUrl.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            <Suspense
              fallback={
                <p className="mt-2 text-[0.68rem] text-faint">
                  Analyzed {formatDate(metadata.analyzedAt)}
                </p>
              }
            >
              <StalenessBadge
                repoUrl={metadata.repoUrl}
                commitSha={metadata.commitSha}
                analyzedAt={metadata.analyzedAt}
              />
            </Suspense>
            {versionCount > 1 ? (
              <Link
                href={`/analysis/${id}/versions`}
                className="mt-2 block text-[0.7rem] font-medium text-accent hover:underline"
              >
                {versionOrdinal ? `v${versionOrdinal} · ` : ""}View history
              </Link>
            ) : null}
            {canRefresh ? <AnalysisRefreshCommand /> : null}
          </div>

          <a
            href={`/api/analyses/${id}/markdown`}
            download
            className="mb-5 inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-accent transition hover:underline"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M8 2.5v7m0 0L5 6.5m3 3 3-3M3 12.5h10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Download ONBOARDING.md
          </a>

          {canShare ? <ShareDialog analysisId={id} /> : null}

          <CommandPalette
            items={buildSearchIndex(analysis, `/analysis/${id}`)}
          />

          <OnboardingSidebarCard analysisId={id} />

          <SectionNav id={id} />
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">{children}</main>

      {chatAvailable ? (
        <ChatPanel
          analysisId={id}
          repoName={metadata.repoName}
          suggestedQuestions={buildSuggestedQuestions(analysis)}
        />
      ) : null}
    </div>
    </OnboardingProgressProvider>
  );
}
