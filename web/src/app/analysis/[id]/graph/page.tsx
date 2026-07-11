import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { SectionHeader, EmptyState } from "@/components/ui";
import { DependencyGraph } from "@/components/DependencyGraph";

export const dynamic = "force-dynamic";

export default async function GraphPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  const graph = analysis.dependencyGraph;

  return (
    <div>
      <SectionHeader
        kicker="Dependency Graph"
        title="How the modules connect"
        description="An interactive force-directed view of modules, packages and external systems. Colour encodes the kind of node; click any node to inspect it and light up its neighbourhood."
      />
      {graph.nodes.length === 0 ? (
        <EmptyState title="No dependency graph in this analysis." />
      ) : (
        <DependencyGraph data={graph} />
      )}
    </div>
  );
}
