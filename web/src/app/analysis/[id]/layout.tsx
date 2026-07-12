import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnalysisCached } from "@/lib/datasource";
import { formatDate, shortSha, snippet } from "@/lib/format";
import { SectionNav } from "@/components/SectionNav";
import { StalenessBadge } from "@/components/StalenessBadge";
import { ShareDialog } from "@/components/ShareDialog";
import { isCloudMode } from "@/lib/mode";
import { isCloudId, uuidFromCloudId } from "@/lib/ids";

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

  // Owner-only Share control: cloud mode + a db_ id whose owner is the signer.
  // st_ share ids fail isCloudId, so anonymous link viewers never see it.
  let canShare = false;
  if (isCloudMode() && isCloudId(id)) {
    const uuid = uuidFromCloudId(id);
    if (uuid) {
      const { auth } = await import("@clerk/nextjs/server");
      const { isOwner } = await import("@/lib/access");
      const { userId } = await auth();
      canShare = userId ? await isOwner(userId, uuid) : false;
    }
  }

  return (
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
          </div>

          {canShare ? <ShareDialog analysisId={id} /> : null}

          <SectionNav id={id} />
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
