import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { Card, EmptyState, SectionHeader } from "@/components/ui";
import { CodeBlock } from "@/components/CodeBlock";
import type { SetupStep } from "@schema/analysis";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  const { setup } = analysis;
  const groups: { title: string; steps: SetupStep[] }[] = [
    { title: "Setup", steps: setup.setup },
    { title: "Run", steps: setup.run },
    { title: "Test", steps: setup.test },
  ].filter((g) => g.steps.length > 0);

  return (
    <div>
      <SectionHeader
        kicker="Setup"
        title="Get it running locally"
        description="Everything you need to go from a fresh clone to a running service and a green test suite."
      />

      {setup.prerequisites.length > 0 ? (
        <Card className="mb-6 p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">
            Prerequisites
          </h3>
          <ul className="space-y-2">
            {setup.prerequisites.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                  className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6.5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <path
                    d="M5.2 8.2 7 10l3.8-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-muted">{p}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState title="No setup steps in this analysis." />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-text">
                <span className="h-4 w-1 rounded-full bg-accent" />
                {group.title}
              </h2>
              <ol className="space-y-3">
                {group.steps.map((step, i) => (
                  <li key={i}>
                    <Card className="p-4">
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted">
                          {i + 1}
                        </span>
                        <h3 className="text-sm font-semibold text-text">
                          {step.title}
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {step.commands.map((cmd, j) => (
                          <CodeBlock key={j} code={cmd} />
                        ))}
                      </div>
                      {step.notes ? (
                        <p className="mt-3 border-l-2 border-border pl-3 text-[0.82rem] leading-relaxed text-faint">
                          {step.notes}
                        </p>
                      ) : null}
                    </Card>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
