import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { difficultyStyle } from "@/lib/styles";
import { Badge, Card, EmptyState, FileChip, SectionHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export default async function TasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  const tasks = [...analysis.firstTasks].sort(
    (a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty],
  );

  return (
    <div>
      <SectionHeader
        kicker="First Tasks"
        title="Good ways to start contributing"
        description="Concrete, well-scoped tasks chosen to build understanding while making a real change. Ordered from easiest to hardest."
      />

      {tasks.length === 0 ? (
        <EmptyState title="No suggested first tasks in this analysis." />
      ) : (
        <div className="space-y-4">
          {tasks.map((task, i) => {
            const diff = difficultyStyle(task.difficulty);
            return (
              <Card key={i} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-text">
                    {task.title}
                  </h2>
                  <Badge className={`shrink-0 ${diff.className}`}>
                    {diff.label}
                  </Badge>
                </div>

                <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">
                  {task.description}
                </p>

                <div className="mt-3 rounded-lg border border-border bg-surface-2/40 p-3">
                  <p className="text-[0.83rem] leading-relaxed text-muted">
                    <span className="font-semibold text-text">
                      Why it&apos;s a good first task:{" "}
                    </span>
                    {task.rationale}
                  </p>
                </div>

                {task.files.length > 0 ? (
                  <div className="mt-3">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                      Files you&apos;ll touch
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {task.files.map((f) => (
                        <FileChip key={f} path={f} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
