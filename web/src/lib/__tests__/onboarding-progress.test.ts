import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOnboardingProgress,
  onboardingCompletion,
  recommendedSection,
} from "../onboarding-progress-shared";
import { readLocalOnboardingProgress } from "../onboarding-progress-local";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
};

beforeEach(() => store.clear());

test("normalizes stale steps and invalid task selections", () => {
  assert.deepEqual(
    normalizeOnboardingProgress({
      architectureRead: true,
      setupCompleted: "yes",
      tourFurthest: 99,
      selectedTaskIndex: 4,
    }, 8, 4),
    {
      architectureRead: true,
      setupCompleted: false,
      tourFurthest: 8,
      selectedTaskIndex: null,
    },
  );
});

test("overall completion gives the tour proportional quarter credit", () => {
  assert.equal(onboardingCompletion({
    architectureRead: true,
    setupCompleted: true,
    tourFurthest: 4,
    selectedTaskIndex: null,
  }, 8), 63);
});

test("an in-progress tour is recommended before other incomplete milestones", () => {
  assert.deepEqual(recommendedSection({
    architectureRead: false,
    setupCompleted: false,
    tourFurthest: 4,
    selectedTaskIndex: null,
  }, 8), {
    slug: "tour",
    label: "Continue at step 4",
    description: "Resume the guided reading path where you left off.",
    step: 4,
  });
});

test("recommendations follow architecture, setup, tour, then tasks", () => {
  const fresh = { architectureRead: false, setupCompleted: false, tourFurthest: 0, selectedTaskIndex: null };
  assert.equal(recommendedSection(fresh, 8).slug, "architecture");
  assert.equal(recommendedSection({ ...fresh, architectureRead: true }, 8).slug, "setup");
  assert.equal(recommendedSection({ ...fresh, architectureRead: true, setupCompleted: true }, 8).slug, "tour");
  assert.equal(recommendedSection({ ...fresh, architectureRead: true, setupCompleted: true, tourFurthest: 8 }, 8).slug, "tasks");
});

test("reads legacy tour-only localStorage when unified progress is absent", () => {
  store.set("tour-progress:sample", "4");
  assert.equal(readLocalOnboardingProgress("sample", 8, 4).tourFurthest, 4);
});

test("unified local progress takes precedence over the legacy checkpoint", () => {
  store.set("tour-progress:sample", "7");
  store.set("onboarding-progress:v1:sample", JSON.stringify({
    architectureRead: true,
    setupCompleted: false,
    tourFurthest: 3,
    selectedTaskIndex: 1,
  }));
  assert.deepEqual(readLocalOnboardingProgress("sample", 8, 4), {
    architectureRead: true,
    setupCompleted: false,
    tourFurthest: 3,
    selectedTaskIndex: 1,
  });
});
