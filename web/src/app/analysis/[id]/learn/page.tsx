import { notFound } from "next/navigation";
import type { LearningResourceEntry, LearningResourceKind } from "@schema/analysis";
import { resolveDataSource } from "@/lib/datasource";
import { githubBlobUrl } from "@/lib/github";
import { slugify } from "@/lib/format";
import { categoryStyle } from "@/lib/styles";
import { Badge, Card, EmptyState, FileChip, SectionHeader } from "@/components/ui";
import { JumpToParam } from "@/components/JumpToParam";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<LearningResourceKind, string> = {
  tutorial: "tutorial",
  guide: "guide",
  reference: "reference",
};

const KIND_STYLE: Record<LearningResourceKind, string> = {
  tutorial: "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
  guide: "border-sky-500/25 bg-sky-500/8 text-sky-700 dark:text-sky-300",
  reference: "border-violet-500/25 bg-violet-500/8 text-violet-700 dark:text-violet-300",
};

/** Host of a URL without a leading `www.`, for a compact link label. */
function displayHost(url: string): string {
  try {
    const host = new URL(url).host.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return url;
  }
}

export default async function LearnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const source = await resolveDataSource();
  const analysis = await source.getAnalysis(id);
  if (!analysis) notFound();

  const { repoUrl, commitSha } = analysis.metadata;
  const entries = analysis.learningResources;

  // Render in techStack order and join by name — the document's own order is
  // not load-bearing, so the two surfaces that show this list always agree.
  const byTech = new Map<string, LearningResourceEntry>(
    (entries ?? []).map((entry) => [entry.tech, entry]),
  );

  return (
    <div>
      <JumpToParam param="tech" prefix="tech-" />
      <SectionHeader
        kicker="Learn"
        title="Come up to speed on this stack"
        description="One canonical door into each technology's own documentation, plus what to notice about the way this repository actually uses it."
      />

      {!entries || entries.length === 0 ? (
        <EmptyState
          title="No learning resources in this analysis."
          hint="This analysis predates learning-resource data. Regenerate it to add documentation and reading suggestions for each technology."
        />
      ) : (
        <div className="space-y-4">
          {analysis.pitch.techStack.map((tech) => {
            const entry = byTech.get(tech.name);
            const cat = categoryStyle(tech.category);
            return (
              <Card
                key={tech.name}
                id={`tech-${slugify(tech.name)}`}
                className="scroll-mt-20 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-text">{tech.name}</h2>
                  <Badge className={`shrink-0 ${cat.className}`}>{cat.label}</Badge>
                </div>

                <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">
                  {tech.role}
                </p>

                {!entry ? (
                  <p className="mt-3 text-[0.83rem] text-faint">
                    No learning resources were recorded for this technology.
                  </p>
                ) : (
                  <>
                    {entry.official ? (
                      <a
                        href={entry.official}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="press mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[0.83rem] font-medium text-text hover:border-accent/40 hover:text-accent"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="shrink-0 text-faint"
                          aria-hidden
                        >
                          <path d="M6.5 9.5 13 3" />
                          <path d="M9.5 2.5H13.5V6.5" />
                          <path d="M12 9.5v3.5H3V4h3.5" />
                        </svg>
                        Start here
                        <span className="text-faint">{displayHost(entry.official)}</span>
                      </a>
                    ) : (
                      <p className="mt-4 text-[0.83rem] text-faint">
                        No public documentation exists for this technology.
                      </p>
                    )}

                    {entry.resources.length > 0 ? (
                      <ul className="mt-4 space-y-3">
                        {entry.resources.map((resource) => (
                          <li
                            key={resource.url}
                            className="rounded-lg border border-border bg-surface-2/40 p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-[0.88rem] font-semibold text-text underline decoration-border underline-offset-4 hover:text-accent hover:decoration-accent/50"
                              >
                                {resource.title}
                              </a>
                              <Badge className={`shrink-0 ${KIND_STYLE[resource.kind]}`}>
                                {KIND_LABEL[resource.kind]}
                              </Badge>
                            </div>
                            <p className="mt-1.5 text-[0.83rem] leading-relaxed text-muted">
                              {resource.why}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-4 rounded-lg border border-border bg-surface-2/40 p-3">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                        In this repo
                      </h3>
                      <p className="text-[0.83rem] leading-relaxed text-muted">
                        {entry.inRepo.note}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.inRepo.files.map((file) => (
                          <FileChip
                            key={`${file.path}:${file.startLine ?? ""}`}
                            path={file.path}
                            startLine={file.startLine}
                            endLine={file.endLine}
                            href={githubBlobUrl(
                              repoUrl,
                              commitSha,
                              file.path,
                              file.startLine,
                              file.endLine,
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
