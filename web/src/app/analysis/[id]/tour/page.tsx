import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { EmptyState, SectionHeader } from "@/components/ui";
import { TourStepper } from "@/components/TourStepper";

export const dynamic = "force-dynamic";

export default async function TourPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  const steps = [...analysis.tour].sort((a, b) => a.order - b.order);
  const explicitStep = Number.parseInt(step ?? "", 10);
  const hasExplicitStep = Number.isFinite(explicitStep);

  const initialStep = hasExplicitStep ? explicitStep : 1;

  return (
    <div>
      <SectionHeader
        kicker="Guided Tour"
        title="Read the code in the right order"
        description="A curated path through the codebase. Each stop explains why to read it at this point and what to take away. Use the arrows, the rail, or your keyboard's ← → keys."
      />
      {steps.length === 0 ? (
        <EmptyState title="No guided tour in this analysis." />
      ) : (
        <TourStepper
          steps={steps}
          initialStep={initialStep}
          analysisId={id}
          hasExplicitStep={hasExplicitStep}
          repoUrl={analysis.metadata.repoUrl}
          commitSha={analysis.metadata.commitSha}
        />
      )}
    </div>
  );
}
