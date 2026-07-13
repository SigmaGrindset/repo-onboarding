import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { isCloudMode } from "@/lib/mode";
import { isCloudId, uuidFromCloudId } from "@/lib/ids";
import { normalizeFurthest } from "@/lib/tour-progress-local";
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

  // Furthest-step persistence: signed-in reads of `db_` analyses use the
  // per-user DB table (so the server already knows where to resume); every
  // other case — local mode, fixtures, `st_` share links, signed out — uses
  // localStorage, and the stepper resumes client-side after mount.
  let storage: "local" | "db" = "local";
  let initialFurthest = 0;
  if (isCloudMode() && isCloudId(id)) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    const uuid = uuidFromCloudId(id);
    if (userId && uuid) {
      storage = "db";
      const { getTourProgress } = await import("@/lib/tour-progress");
      initialFurthest = normalizeFurthest(
        await getTourProgress(userId, uuid),
        steps.length,
      );
    }
  }

  // An explicit ?step= deep link always wins; otherwise resume at the furthest
  // step ("db" resumes here, "local" resumes in the stepper after mount).
  const initialStep = hasExplicitStep
    ? explicitStep
    : Math.max(initialFurthest, 1);

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
          storage={storage}
          initialFurthest={initialFurthest}
          resumeFromLocal={storage === "local" && !hasExplicitStep}
          repoUrl={analysis.metadata.repoUrl}
          commitSha={analysis.metadata.commitSha}
        />
      )}
    </div>
  );
}
