import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnalysisCached } from "@/lib/datasource";
import { formatDate, shortSha, snippet } from "@/lib/format";
import { isCloudMode } from "@/lib/mode";
import { isCloudId, isShareId, toCloudId, uuidFromCloudId } from "@/lib/ids";
import { Badge, Card, EmptyState, SectionHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VersionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const analysis = await getAnalysisCached(id);
  if (!analysis) notFound();

  const header = (
    <SectionHeader
      kicker="Versions"
      title="Version history"
      description="Each upload of this repo's analysis.json is a version. Compare any two runs to see what changed between them."
    />
  );

  // History only exists for cloud-backed analyses. Fixtures and shared
  // snapshots have no lineage — degrade to an explanatory empty state.
  if (!isCloudMode() || !isCloudId(id)) {
    return (
      <div>
        {header}
        <EmptyState
          title="Version history isn't available here."
          hint={
            isShareId(id)
              ? "This is a shared snapshot — version history isn't available on shared links."
              : "Version history is available for analyses uploaded to your workspace."
          }
        />
      </div>
    );
  }

  const uuid = uuidFromCloudId(id);
  const { auth } = await import("@clerk/nextjs/server");
  const { listVersionsFor } = await import("@/lib/access");
  const { userId } = await auth();
  const versions = userId && uuid ? await listVersionsFor(userId, uuid) : [];

  if (versions.length <= 1) {
    return (
      <div>
        {header}
        <EmptyState
          title="Only one version so far."
          hint="Only one version of this repo has been uploaded so far. Upload a newer analysis.json to start tracking what changed."
        />
      </div>
    );
  }

  // `versions` is oldest-first (version 1 = oldest). Render newest-first.
  const latest = versions[versions.length - 1];
  const rows = [...versions].reverse();

  return (
    <div>
      {header}

      <ol className="space-y-4">
        {rows.map((v) => {
          const cloudId = toCloudId(v.id);
          const isViewing = cloudId === id;
          const sha = shortSha(v.commitSha);
          const date = formatDate((v.analyzedAt ?? v.createdAt).toISOString());
          // Links are anchored to THIS row's version, not the route id: "What
          // changed" compares this row against its predecessor (skip on v1,
          // which has none); "Compare with latest" compares this row against
          // the newest. The diff page orients base/head by date, so only pair
          // membership matters — and the diff page's sidebar context becomes
          // this row's version, which is coherent.
          const predecessor = versions[v.version - 2]; // version is 1-based
          const diffBase = `/analysis/${cloudId}/versions/diff`;

          return (
            <li key={v.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-accent/25 bg-accent-soft text-accent">
                    v{v.version}
                  </Badge>
                  {v.isLatest ? (
                    <Badge className="border-emerald-500/25 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                      Current
                    </Badge>
                  ) : null}
                  {isViewing ? (
                    <Badge className="border-border bg-surface-2 text-muted">
                      Viewing
                    </Badge>
                  ) : null}
                  <span className="text-xs text-faint">{date}</span>
                  {sha ? (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.7rem] text-muted">
                      {sha}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">
                  {snippet(v.summary, 200)}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs font-medium">
                  {!isViewing ? (
                    <Link
                      href={`/analysis/${cloudId}`}
                      className="text-accent hover:underline"
                    >
                      Open
                    </Link>
                  ) : null}
                  {predecessor ? (
                    <Link
                      href={`${diffBase}/${toCloudId(predecessor.id)}`}
                      className="text-muted transition hover:text-text"
                    >
                      What changed
                    </Link>
                  ) : null}
                  {!v.isLatest ? (
                    <Link
                      href={`${diffBase}/${toCloudId(latest.id)}`}
                      className="text-muted transition hover:text-text"
                    >
                      Compare with latest
                    </Link>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
