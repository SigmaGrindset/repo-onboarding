"use client";

import { useSyncExternalStore } from "react";
import {
  readLocalTourProgress,
  subscribeTourProgress,
} from "@/lib/tour-progress-local";
import { Badge } from "@/components/ui";

/**
 * "4/9 steps" checklist pill for the index cards.
 *
 * When the server knows the user's progress (cloud rows), it arrives as the
 * `furthest` prop and renders straight away. When it doesn't (local mode /
 * fixtures), progress lives in localStorage, which only the browser can read:
 * the badge hydrates at "0/9" and picks up the stored value after mount — the
 * same render-after-hydration tradeoff ThemeToggle makes.
 */
export function TourProgressBadge({
  analysisId,
  totalSteps,
  furthest,
}: {
  analysisId: string;
  totalSteps: number;
  furthest?: number;
}) {
  const localDone = useSyncExternalStore(
    subscribeTourProgress,
    () => readLocalTourProgress(analysisId, totalSteps),
    () => 0,
  );
  const done = furthest ?? localDone;

  if (totalSteps <= 0) return null;
  const complete = done >= totalSteps;

  return (
    <Badge
      className={
        complete
          ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-surface-2 text-muted"
      }
    >
      {complete ? (
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3 8.5 6.5 12 13 4.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {done}/{totalSteps} steps
    </Badge>
  );
}
