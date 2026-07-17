import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { githubBlobUrl } from "@/lib/github";
import { slugify } from "@/lib/format";
import { Badge, Card, EmptyState, FileChip, SectionHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const SEVERITY_STYLE = {
  low: "border-sky-500/25 bg-sky-500/8 text-sky-700 dark:text-sky-300",
  medium: "border-amber-500/25 bg-amber-500/8 text-amber-700 dark:text-amber-300",
  high: "border-red-500/25 bg-red-500/8 text-red-700 dark:text-red-300",
} as const;

export default async function ContributorGuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const source = await resolveDataSource();
  const analysis = await source.getAnalysis(id);
  if (!analysis) notFound();

  const guide = analysis.contributorGuide;
  const { repoUrl, commitSha } = analysis.metadata;

  return (
    <div>
      <SectionHeader
        kicker="Contributor Guide"
        title="Change the code without stepping on landmines"
        description="Repository-specific risks, ownership boundaries, and verification hints for deciding where a change belongs."
      />

      {!guide ? (
        <EmptyState
          title="No contributor guide in this analysis."
          hint="This analysis predates contributor-guide data. Regenerate it to add risks and change-routing guidance."
        />
      ) : (
        <div className="space-y-9">
          <section>
            <h2 className="mb-1 text-lg font-semibold text-text">
              Known risks and sharp edges
            </h2>
            <p className="mb-4 text-sm text-muted">
              Read these before changing the paths they reference.
            </p>
            <div className="grid gap-4 xl:grid-cols-2">
              {guide.knownRisks.map((risk) => (
                <Card
                  key={risk.title}
                  id={`risk-${slugify(risk.title)}`}
                  className="scroll-mt-20 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-text">{risk.title}</h3>
                    <Badge className={`shrink-0 ${SEVERITY_STYLE[risk.severity]}`}>
                      {risk.severity}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{risk.impact}</p>
                  <div className="mt-3 rounded-lg border border-border bg-surface-2/45 p-3 text-sm leading-relaxed text-muted">
                    <span className="font-semibold text-text">Guardrail: </span>
                    {risk.mitigation}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {risk.files.map((path) => (
                      <FileChip
                        key={path}
                        path={path}
                        href={githubBlobUrl(repoUrl, commitSha, path)}
                      />
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold text-text">
              Where should this kind of change go?
            </h2>
            <p className="mb-4 text-sm text-muted">
              Start at the primary boundary, then follow the related paths and checks.
            </p>
            <div className="space-y-4">
              {guide.changeRoutes.map((route) => (
                <Card
                  key={route.changeType}
                  id={`route-${slugify(route.changeType)}`}
                  className="scroll-mt-20 p-5"
                >
                  <h3 className="font-semibold text-text">{route.changeType}</h3>
                  <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.75fr)]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                        Start here
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <FileChip
                          path={route.primaryPath}
                          href={githubBlobUrl(repoUrl, commitSha, route.primaryPath)}
                        />
                        {route.relatedPaths.map((path) => (
                          <FileChip
                            key={path}
                            path={path}
                            href={githubBlobUrl(repoUrl, commitSha, path)}
                          />
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-muted">
                        {route.rationale}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface-2/45 p-3.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                        Verify before you finish
                      </p>
                      <ul className="mt-2 space-y-2 text-sm text-muted">
                        {route.verification.map((check) => (
                          <li key={check} className="flex gap-2">
                            <span aria-hidden className="text-emerald-600 dark:text-emerald-300">✓</span>
                            <span>{check}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
