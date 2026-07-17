/** Server-only persistence for per-user onboarding progress in cloud mode. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/db";
import { tourProgress } from "@/db/schema";
import {
  EMPTY_ONBOARDING_PROGRESS,
  type OnboardingProgress,
} from "./onboarding-progress-shared";

const selection = {
  furthestStep: tourProgress.furthestStep,
  architectureRead: tourProgress.architectureRead,
  setupCompleted: tourProgress.setupCompleted,
  selectedTaskIndex: tourProgress.selectedTaskIndex,
};

function fromRow(row: {
  furthestStep: number;
  architectureRead: boolean;
  setupCompleted: boolean;
  selectedTaskIndex: number | null;
}): OnboardingProgress {
  return {
    architectureRead: row.architectureRead,
    setupCompleted: row.setupCompleted,
    tourFurthest: row.furthestStep,
    selectedTaskIndex: row.selectedTaskIndex,
  };
}

export async function getOnboardingProgress(
  userId: string,
  analysisId: string,
): Promise<OnboardingProgress> {
  if (!userId || !analysisId) return { ...EMPTY_ONBOARDING_PROGRESS };
  const rows = await getDb().select(selection).from(tourProgress).where(
    and(eq(tourProgress.analysisId, analysisId), eq(tourProgress.userId, userId)),
  ).limit(1);
  return rows[0] ? fromRow(rows[0]) : { ...EMPTY_ONBOARDING_PROGRESS };
}

export async function getOnboardingProgressMap(
  userId: string,
  analysisIds: string[],
): Promise<Map<string, OnboardingProgress>> {
  const map = new Map<string, OnboardingProgress>();
  if (!userId || analysisIds.length === 0) return map;
  const rows = await getDb().select({ analysisId: tourProgress.analysisId, ...selection })
    .from(tourProgress)
    .where(and(eq(tourProgress.userId, userId), inArray(tourProgress.analysisId, analysisIds)));
  for (const row of rows) map.set(row.analysisId, fromRow(row));
  return map;
}

export async function setTourProgress(
  userId: string,
  analysisId: string,
  furthestStep: number,
): Promise<void> {
  await getDb().insert(tourProgress).values({ analysisId, userId, furthestStep })
    .onConflictDoUpdate({
      target: [tourProgress.analysisId, tourProgress.userId],
      set: {
        furthestStep: sql`GREATEST(${tourProgress.furthestStep}, EXCLUDED.furthest_step)`,
        updatedAt: sql`now()`,
      },
    });
}

export async function markArchitectureRead(userId: string, analysisId: string): Promise<void> {
  await getDb().insert(tourProgress).values({ analysisId, userId, architectureRead: true })
    .onConflictDoUpdate({
      target: [tourProgress.analysisId, tourProgress.userId],
      set: { architectureRead: true, updatedAt: sql`now()` },
    });
}

export async function setSetupCompleted(
  userId: string,
  analysisId: string,
  completed: boolean,
): Promise<void> {
  await getDb().insert(tourProgress).values({ analysisId, userId, setupCompleted: completed })
    .onConflictDoUpdate({
      target: [tourProgress.analysisId, tourProgress.userId],
      set: { setupCompleted: completed, updatedAt: sql`now()` },
    });
}

export async function setSelectedTask(
  userId: string,
  analysisId: string,
  taskIndex: number | null,
): Promise<void> {
  await getDb().insert(tourProgress).values({ analysisId, userId, selectedTaskIndex: taskIndex })
    .onConflictDoUpdate({
      target: [tourProgress.analysisId, tourProgress.userId],
      set: { selectedTaskIndex: taskIndex, updatedAt: sql`now()` },
    });
}

/** Reset only the tour milestone; preserve architecture/setup/task progress. */
export async function resetTourProgress(userId: string, analysisId: string): Promise<void> {
  if (!userId || !analysisId) return;
  await getDb().update(tourProgress).set({ furthestStep: 0, updatedAt: sql`now()` }).where(
    and(eq(tourProgress.analysisId, analysisId), eq(tourProgress.userId, userId)),
  );
}

/** Compatibility helpers for older tour-only callers. */
export async function getTourProgress(userId: string, analysisId: string): Promise<number> {
  return (await getOnboardingProgress(userId, analysisId)).tourFurthest;
}

export async function getTourProgressMap(
  userId: string,
  analysisIds: string[],
): Promise<Map<string, number>> {
  const full = await getOnboardingProgressMap(userId, analysisIds);
  return new Map([...full].map(([id, progress]) => [id, progress.tourFurthest]));
}
