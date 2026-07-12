import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { Card, EmptyState, SectionHeader } from "@/components/ui";
import { ChurnChart } from "@/components/ChurnChart";

export const dynamic = "force-dynamic";

export default async function HotspotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  const { hotspots } = analysis;
  const entries = [...hotspots.entries].sort((a, b) => b.commits - a.commits);

  return (
    <div>
      <SectionHeader
        kicker="Hotspots"
        title="Where the churn is"
        description="Files ranked by how often they change. High-churn files are usually the active core of a system — where risk and knowledge concentrate. Click a file to read why it is hot."
      />

      {entries.length === 0 ? (
        <EmptyState title="No hotspots in this analysis." />
      ) : (
        <>
          <ChurnChart
            entries={entries}
            repoUrl={analysis.metadata.repoUrl}
            commitSha={analysis.metadata.commitSha}
          />

          {hotspots.interpretation ? (
            <Card className="mt-6 border-accent/20 bg-accent-soft p-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
                What this tells you
              </h3>
              <p className="text-[0.92rem] leading-relaxed text-text">
                {hotspots.interpretation}
              </p>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
