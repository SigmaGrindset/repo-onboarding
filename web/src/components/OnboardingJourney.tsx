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
    <section className="mb-8 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      <div className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="kicker text-accent">Continue onboarding</p>
            <h2 className="mt-2 text-[1.3rem] font-semibold tracking-[-0.02em] text-text">
              {completion === 100 ? "You’re ready to contribute" : "Keep building context"}
            </h2>
            <p className="mt-2 max-w-[42ch] text-[0.9rem] leading-relaxed text-muted">{recommendation.description}</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-[2rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-text">
              {completion}%
            </div>
            <div className="mt-1.5 text-[0.7rem] text-faint">overall completion</div>
          </div>
        </div>
        <div
          role="progressbar"
          aria-valuenow={completion}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Onboarding completion"
          className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${completion}%` }}
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/analysis/${analysisId}/${recommendation.slug}${recommendationQuery}`}
            className="press inline-flex items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-raised hover:bg-accent-hover"
          >
            {recommendation.label}
          </Link>
          <Link
            href={`/analysis/${analysisId}/tour?step=${tourStep}`}
            className="press inline-flex items-center rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-text hover:border-border-strong hover:bg-surface-3"
          >
            {tourLabel}
          </Link>
        </div>
      </div>

      <ul className="grid bg-surface-2/40 sm:grid-cols-2">
        {checklist.map((item) => (
          <li key={item.label} className="border-b border-border p-4 transition-colors hover:bg-surface-2 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
            <Link href={item.href} className="group flex items-start gap-3">
              <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-semibold ${item.complete ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "border-border-strong text-faint"}`}>
                {item.complete ? "✓" : ""}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.87rem] font-medium text-text transition group-hover:text-accent">{item.label}</span>
                <span className="mt-1 block truncate text-[0.75rem] text-faint">{item.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
