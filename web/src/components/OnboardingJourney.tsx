"use client";

import Link from "next/link";
import { useOnboardingProgress } from "./OnboardingProgressProvider";

export function OnboardingJourney({
  analysisId,
  taskTitles,
}: {
  analysisId: string;
  taskTitles: string[];
}) {
  const { progress, completion, recommendation, totalTourSteps } = useOnboardingProgress();
  const recommendationQuery = recommendation.slug === "tour" && recommendation.step
    ? `?step=${recommendation.step}`
    : "";
  const tourComplete = totalTourSteps > 0 && progress.tourFurthest >= totalTourSteps;
  const tourLabel = progress.tourFurthest === 0
    ? "Start guided tour"
    : tourComplete
      ? "Review completed tour"
      : `Continue at step ${progress.tourFurthest}`;
  const tourStep = progress.tourFurthest > 0 ? progress.tourFurthest : 1;

  const checklist = [
    {
      complete: progress.architectureRead,
      label: "Architecture read",
      detail: progress.architectureRead ? "Mental model established" : "Read the system narrative",
      href: `/analysis/${analysisId}/architecture`,
    },
    {
      complete: progress.setupCompleted,
      label: "Setup completed",
      detail: progress.setupCompleted ? "Local environment ready" : "Run the project and tests",
      href: `/analysis/${analysisId}/setup`,
    },
    {
      complete: tourComplete,
      label: "Tour completed",
      detail: `${Math.min(progress.tourFurthest, totalTourSteps)}/${totalTourSteps} steps reached`,
      href: `/analysis/${analysisId}/tour?step=${tourStep}`,
    },
    {
      complete: progress.selectedTaskIndex !== null,
      label: "First task selected",
      detail: progress.selectedTaskIndex === null
        ? "Choose a starter contribution"
        : taskTitles[progress.selectedTaskIndex] ?? "Task selected",
      href: `/analysis/${analysisId}/tasks`,
    },
  ];

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Continue onboarding
            </p>
            <h2 className="mt-1 text-lg font-semibold text-text">
              {completion === 100 ? "You’re ready to contribute" : "Keep building context"}
            </h2>
            <p className="mt-1 text-sm text-muted">{recommendation.description}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums text-text">{completion}%</div>
            <div className="text-xs text-faint">overall completion</div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${completion}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/analysis/${analysisId}/${recommendation.slug}${recommendationQuery}`}
            className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover"
          >
            {recommendation.label}
          </Link>
          <Link
            href={`/analysis/${analysisId}/tour?step=${tourStep}`}
            className="inline-flex items-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border-strong"
          >
            {tourLabel}
          </Link>
        </div>
      </div>

      <ul className="grid sm:grid-cols-2">
        {checklist.map((item) => (
          <li key={item.label} className="border-b border-border p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
            <Link href={item.href} className="group flex items-start gap-3">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${item.complete ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border text-faint"}`}>
                {item.complete ? "✓" : ""}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text group-hover:text-accent">{item.label}</span>
                <span className="mt-0.5 block truncate text-xs text-faint">{item.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
