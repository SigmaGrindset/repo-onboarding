import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { formatDate, shortSha } from "@/lib/format";
import { SectionNav } from "@/components/SectionNav";

export const dynamic = "force-dynamic";

export default async function AnalysisLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  const { metadata } = analysis;
  const sha = shortSha(metadata.commitSha);

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
            <p className="mt-2 text-[0.68rem] text-faint">
              Analyzed {formatDate(metadata.analyzedAt)}
            </p>
          </div>

          <SectionNav id={id} />
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
