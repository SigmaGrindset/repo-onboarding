import {
  EMPTY_ONBOARDING_PROGRESS,
  normalizeOnboardingProgress,
  type OnboardingProgress,
} from "./onboarding-progress-shared";

const KEY_PREFIX = "onboarding-progress:v1:";
const LEGACY_TOUR_PREFIX = "tour-progress:";
const CHANGE_EVENT = "onboarding-progress-change";

function key(id: string) { return `${KEY_PREFIX}${id}`; }

export function readLocalOnboardingProgress(
  analysisId: string,
  totalTourSteps: number,
  taskCount: number,
): OnboardingProgress {
  try {
    const raw = localStorage.getItem(key(analysisId));
    if (raw) {
      return normalizeOnboardingProgress(JSON.parse(raw), totalTourSteps, taskCount);
    }
    const legacy = Number.parseInt(
      localStorage.getItem(`${LEGACY_TOUR_PREFIX}${analysisId}`) ?? "",
      10,
    );
    return normalizeOnboardingProgress(
      { ...EMPTY_ONBOARDING_PROGRESS, tourFurthest: legacy },
      totalTourSteps,
      taskCount,
    );
  } catch {
    return { ...EMPTY_ONBOARDING_PROGRESS };
  }
}

export function writeLocalOnboardingProgress(
  analysisId: string,
  progress: OnboardingProgress,
): void {
  try {
    localStorage.setItem(key(analysisId), JSON.stringify(progress));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: analysisId }));
  } catch {}
}

export function subscribeLocalOnboardingProgress(
  analysisId: string,
  onChange: () => void,
): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === key(analysisId) || event.key === `${LEGACY_TOUR_PREFIX}${analysisId}`) {
      onChange();
    }
  };
  const onCustom = (event: Event) => {
    if ((event as CustomEvent<string>).detail === analysisId) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onCustom);
  // Hydration starts from a server snapshot that cannot see localStorage.
  // Publish once after the subscription exists so consumers immediately read
  // the browser value even when no storage event has fired yet.
  const hydrationTimer = window.setTimeout(onChange, 0);
  return () => {
    window.clearTimeout(hydrationTimer);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onCustom);
  };
}
