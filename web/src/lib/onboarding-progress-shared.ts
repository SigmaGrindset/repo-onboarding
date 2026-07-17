export interface OnboardingProgress {
  architectureRead: boolean;
  setupCompleted: boolean;
  tourFurthest: number;
  selectedTaskIndex: number | null;
}

export const EMPTY_ONBOARDING_PROGRESS: OnboardingProgress = {
  architectureRead: false,
  setupCompleted: false,
  tourFurthest: 0,
  selectedTaskIndex: null,
};

export function normalizeOnboardingProgress(
  raw: unknown,
  totalTourSteps: number,
  taskCount: number,
): OnboardingProgress {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const parsedStep = typeof value.tourFurthest === "number"
    ? value.tourFurthest
    : Number.parseInt(String(value.tourFurthest ?? ""), 10);
  const tourFurthest = Number.isInteger(parsedStep) && parsedStep > 0
    ? Math.min(parsedStep, Math.max(0, totalTourSteps))
    : 0;
  const selected = value.selectedTaskIndex;
  const selectedTaskIndex = typeof selected === "number" &&
      Number.isInteger(selected) && selected >= 0 && selected < taskCount
    ? selected
    : null;

  return {
    architectureRead: value.architectureRead === true,
    setupCompleted: value.setupCompleted === true,
    tourFurthest,
    selectedTaskIndex,
  };
}

/** Four equal milestones; the tour earns partial credit as steps are reached. */
export function onboardingCompletion(
  progress: OnboardingProgress,
  totalTourSteps: number,
): number {
  const tourPart = totalTourSteps > 0
    ? Math.min(progress.tourFurthest, totalTourSteps) / totalTourSteps
    : 0;
  const units = Number(progress.architectureRead) +
    Number(progress.setupCompleted) +
    Number(progress.selectedTaskIndex !== null) + tourPart;
  return Math.round((units / 4) * 100);
}

export type RecommendedSection =
  | { slug: "tour"; label: string; description: string; step?: number }
  | { slug: "architecture" | "setup" | "tasks"; label: string; description: string }
  | { slug: "tasks"; label: string; description: string; complete: true };

export function recommendedSection(
  progress: OnboardingProgress,
  totalTourSteps: number,
): RecommendedSection {
  if (progress.tourFurthest > 0 && progress.tourFurthest < totalTourSteps) {
    return {
      slug: "tour",
      label: `Continue at step ${progress.tourFurthest}`,
      description: "Resume the guided reading path where you left off.",
      step: progress.tourFurthest,
    };
  }
  if (!progress.architectureRead) {
    return {
      slug: "architecture",
      label: "Read the architecture",
      description: "Build a mental model of the system before changing it.",
    };
  }
  if (!progress.setupCompleted) {
    return {
      slug: "setup",
      label: "Complete local setup",
      description: "Get the project running and its tests green.",
    };
  }
  if (progress.tourFurthest < totalTourSteps) {
    return {
      slug: "tour",
      label: "Start the guided tour",
      description: "Follow the curated code-reading path.",
      step: 1,
    };
  }
  if (progress.selectedTaskIndex === null) {
    return {
      slug: "tasks",
      label: "Select your first task",
      description: "Choose a concrete contribution to start with.",
    };
  }
  return {
    slug: "tasks",
    label: "Open your selected task",
    description: "Onboarding complete — turn your context into a contribution.",
    complete: true,
  };
}

export type OnboardingProgressAction =
  | { action: "markArchitectureRead" }
  | { action: "setSetupCompleted"; completed: boolean }
  | { action: "reachTourStep"; step: number }
  | { action: "resetTour" }
  | { action: "selectTask"; taskIndex: number | null };
