import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { slugify } from "@/lib/format";
import { roleTint } from "@/lib/styles";
import { Badge, Card, EmptyState, FileChip, SectionHeader } from "@/components/ui";
import { JumpToParam } from "@/components/JumpToParam";

export const dynamic = "force-dynamic";

export default async function MapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  const map = analysis.codebaseMap;

  return (
    <div>
      <SectionHeader
        kicker="Codebase Map"
        title="Where everything lives"
        description="An annotated tour of the directory structure — what each area is for, why it matters to a newcomer, and the files worth opening first."
      />

      <JumpToParam param="entry" prefix="dir-" />

      {map.length === 0 ? (
        <EmptyState title="No codebase map in this analysis." />
      ) : (
        <div className="space-y-4">
          {map.map((entry) => (
            <Card
              key={entry.path}
              id={`dir-${slugify(entry.path)}`}
              className="scroll-mt-20 p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-text">
                  {entry.path}
                </code>
                <Badge className={roleTint(entry.role)}>{entry.role}</Badge>
              </div>

              <p className="mt-3 text-[0.92rem] leading-relaxed text-muted">
                {entry.purpose}
              </p>

              {entry.keyFiles && entry.keyFiles.length > 0 ? (
                <div className="mt-4 border-t border-border pt-4">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-faint">
                    Key files
                  </h4>
                  <ul className="space-y-2">
                    {entry.keyFiles.map((f) => (
                      <li
                        key={f.path}
                        className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
                      >
                        <FileChip path={f.path} />
                        <span className="text-[0.83rem] text-muted">
                          {f.note}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
