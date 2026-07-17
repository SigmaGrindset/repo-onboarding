"use client";

import Link from "next/link";
import { useOnboardingProgress } from "./OnboardingProgressProvider";

export function OnboardingSidebarCard({ analysisId }: { analysisId: string }) {
  const { completion, recommendation } = useOnboardingProgress();
  const query = recommendation.slug === "tour" && recommendation.step
    ? `?step=${recommendation.step}`
    : "";

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-text">Onboarding</span>
        <span className="tabular-nums text-muted">{completion}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${completion}%` }} />
      </div>
      <Link
        href={`/analysis/${analysisId}/${recommendation.slug}${query}`}
        className="mt-2.5 block text-[0.72rem] font-medium leading-snug text-accent hover:underline"
      >
        {completion === 100 ? "Onboarding complete · " : "Next · "}
        {recommendation.label}
      </Link>
    </div>
  );
}
