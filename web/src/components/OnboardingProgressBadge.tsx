"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Badge } from "./ui";
import { readLocalOnboardingProgress, subscribeLocalOnboardingProgress } from "@/lib/onboarding-progress-local";
import { EMPTY_ONBOARDING_PROGRESS, onboardingCompletion, type OnboardingProgress } from "@/lib/onboarding-progress-shared";

export function OnboardingProgressBadge({
  analysisId,
  totalTourSteps,
  taskCount,
  progress,
}: {
  analysisId: string;
  totalTourSteps: number;
  taskCount: number;
  progress?: OnboardingProgress;
}) {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeLocalOnboardingProgress(analysisId, onChange),
    [analysisId],
  );
  const getSnapshot = useCallback(
    () => JSON.stringify(readLocalOnboardingProgress(analysisId, totalTourSteps, taskCount)),
    [analysisId, taskCount, totalTourSteps],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => JSON.stringify(EMPTY_ONBOARDING_PROGRESS),
  );
  const local = JSON.parse(snapshot) as OnboardingProgress;
  const percent = onboardingCompletion(progress ?? local, totalTourSteps);
  const complete = percent === 100;
  return (
    <Badge className={complete
      ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
      : "border-border bg-surface-2 text-muted"}
    >
      {complete ? "✓ Onboarded" : `${percent}% onboarded`}
    </Badge>
  );
}
