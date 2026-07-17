import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { slugify } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { Badge, Card, EmptyState, SectionHeader } from "@/components/ui";
import { Mermaid } from "@/components/Mermaid";
import { JumpToParam } from "@/components/JumpToParam";
import { ArchitectureReadTracker } from "@/components/OnboardingMilestoneControls";

export const dynamic = "force-dynamic";

export default async function ArchitecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  const sections = analysis.architecture;

  return (
    <div>
      <ArchitectureReadTracker />
      <SectionHeader
        kicker="Architecture"
        title="How it is built"
        description="The ordered narrative of the system's design, with diagrams rendered inline. Read top to bottom."
      />

      <JumpToParam param="section" prefix="arch-" />

      {sections.length === 0 ? (
        <EmptyState title="No architecture sections in this analysis." />
      ) : (
        <div className="space-y-6">
          {sections.map((section, i) => (
            <Card
              key={i}
              id={`arch-${slugify(section.title)}`}
              className="scroll-mt-20 overflow-hidden"
            >
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  <h2 className="text-lg font-semibold text-text">
                    {section.title}
                  </h2>
                </div>
              </div>

              <div className="px-5 py-5 sm:px-6">
                <Markdown>{section.body}</Markdown>

                {section.diagram ? (
                  <figure className="mt-5 rounded-lg border border-border bg-surface-2/50 p-4">
                    <figcaption className="mb-3 flex items-center gap-2">
                      <Badge className="border-border bg-surface text-muted">
                        {section.diagram.type}
                      </Badge>
                      {section.diagram.title ? (
                        <span className="text-sm font-medium text-text">
                          {section.diagram.title}
                        </span>
                      ) : null}
                    </figcaption>
                    <Mermaid
                      source={section.diagram.source}
                      title={section.diagram.title ?? section.title}
                    />
                  </figure>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
