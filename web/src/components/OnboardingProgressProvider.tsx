"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  onboardingCompletion,
  recommendedSection,
  type OnboardingProgress,
  type OnboardingProgressAction,
} from "@/lib/onboarding-progress-shared";
import {
  readLocalOnboardingProgress,
  subscribeLocalOnboardingProgress,
  writeLocalOnboardingProgress,
} from "@/lib/onboarding-progress-local";

interface ProgressContextValue {
  progress: OnboardingProgress;
  completion: number;
  recommendation: ReturnType<typeof recommendedSection>;
  totalTourSteps: number;
  taskCount: number;
  markArchitectureRead(): void;
  reachTourStep(step: number): void;
  setSetupCompleted(completed: boolean): Promise<void>;
  selectTask(taskIndex: number | null): Promise<void>;
  resetTour(): Promise<void>;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function OnboardingProgressProvider({
  children,
  analysisId,
  storage,
  initialProgress,
  totalTourSteps,
  taskCount,
}: {
  children: React.ReactNode;
  analysisId: string;
  storage: "local" | "db";
  initialProgress: OnboardingProgress;
  totalTourSteps: number;
  taskCount: number;
}) {
  const [dbProgress, setDbProgress] = useState(initialProgress);
  const subscribe = useCallback(
    (onChange: () => void) => storage === "local"
      ? subscribeLocalOnboardingProgress(analysisId, onChange)
      : () => {},
    [analysisId, storage],
  );
  const getSnapshot = useCallback(
    () => JSON.stringify(
      storage === "local"
        ? readLocalOnboardingProgress(analysisId, totalTourSteps, taskCount)
        : initialProgress,
    ),
    [analysisId, initialProgress, storage, taskCount, totalTourSteps],
  );
  const getServerSnapshot = useCallback(
    () => JSON.stringify(initialProgress),
    [initialProgress],
  );
  const localSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const progress = storage === "local"
    ? JSON.parse(localSnapshot) as OnboardingProgress
    : dbProgress;

  const post = useCallback(async (action: OnboardingProgressAction) => {
    const response = await fetch(`/api/analyses/${analysisId}/onboarding-progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    if (!response.ok) throw new Error(`Progress update failed: ${response.status}`);
  }, [analysisId]);

  const automatic = useCallback((
    action: OnboardingProgressAction,
    update: (current: OnboardingProgress) => OnboardingProgress,
  ) => {
    if (storage === "local") {
      const current = readLocalOnboardingProgress(analysisId, totalTourSteps, taskCount);
      writeLocalOnboardingProgress(analysisId, update(current));
      return;
    }
    setDbProgress(update);
    post(action).catch(() => {});
  }, [analysisId, post, storage, taskCount, totalTourSteps]);

  const explicit = useCallback(async (
    action: OnboardingProgressAction,
    update: (current: OnboardingProgress) => OnboardingProgress,
  ) => {
    if (storage === "local") {
      const current = readLocalOnboardingProgress(analysisId, totalTourSteps, taskCount);
      writeLocalOnboardingProgress(analysisId, update(current));
      return;
    }
    await post(action);
    setDbProgress(update);
  }, [analysisId, post, storage, taskCount, totalTourSteps]);

  const value = useMemo<ProgressContextValue>(() => ({
    progress,
    completion: onboardingCompletion(progress, totalTourSteps),
    recommendation: recommendedSection(progress, totalTourSteps),
    totalTourSteps,
    taskCount,
    markArchitectureRead() {
      if (progress.architectureRead) return;
      automatic(
        { action: "markArchitectureRead" },
        (current) => current.architectureRead ? current : { ...current, architectureRead: true },
      );
    },
    reachTourStep(step) {
      if (step <= progress.tourFurthest) return;
      automatic(
        { action: "reachTourStep", step },
        (current) => ({ ...current, tourFurthest: Math.max(current.tourFurthest, step) }),
      );
    },
    setSetupCompleted(completed) {
      return explicit(
        { action: "setSetupCompleted", completed },
        (current) => ({ ...current, setupCompleted: completed }),
      );
    },
    selectTask(taskIndex) {
      return explicit(
        { action: "selectTask", taskIndex },
        (current) => ({ ...current, selectedTaskIndex: taskIndex }),
      );
    },
    resetTour() {
      return explicit(
        { action: "resetTour" },
        (current) => ({ ...current, tourFurthest: 0 }),
      );
    },
  }), [automatic, explicit, progress, taskCount, totalTourSteps]);

  const hydratorId = `onboarding-hydrator-${analysisId}`;
  return (
    <ProgressContext.Provider value={value}>
      <button
        id={hydratorId}
        type="button"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => {}}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){function hydrate(){[0,250,1000].forEach(function(delay){setTimeout(function(){document.getElementById(${JSON.stringify(hydratorId)})?.click()},delay)})}if(document.readyState==='complete'){hydrate()}else{window.addEventListener('load',hydrate,{once:true})}})()`,
        }}
      />
      {children}
    </ProgressContext.Provider>
  );
}

export function useOnboardingProgress(): ProgressContextValue {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("useOnboardingProgress must be used within OnboardingProgressProvider");
  return value;
}
