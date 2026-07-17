"use client";

import { useEffect, useState } from "react";
import { useOnboardingProgress } from "./OnboardingProgressProvider";

export function ArchitectureReadTracker() {
  const { markArchitectureRead } = useOnboardingProgress();
  useEffect(() => markArchitectureRead(), [markArchitectureRead]);
  return null;
}

export function SetupCompletionButton() {
  const { progress, setSetupCompleted } = useOnboardingProgress();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const next = !progress.setupCompleted;

  const toggle = async () => {
    setSaving(true);
    setError(false);
    try {
      await setSetupCompleted(next);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">
            {progress.setupCompleted ? "Setup marked complete" : "Finished these steps?"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            This milestone is explicit because only you know whether the project runs locally.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          aria-pressed={progress.setupCompleted}
          className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${progress.setupCompleted ? "border border-border bg-surface-2 text-muted hover:text-text" : "bg-accent text-accent-fg hover:bg-accent-hover"}`}
        >
          {saving ? "Saving…" : progress.setupCompleted ? "Mark incomplete" : "Mark setup complete"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-500">Couldn’t save setup progress. Try again.</p> : null}
    </div>
  );
}

export function TaskSelectionButton({ taskIndex }: { taskIndex: number }) {
  const { progress, selectTask } = useOnboardingProgress();
  const selected = progress.selectedTaskIndex === taskIndex;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async () => {
    setSaving(true);
    setError(false);
    try {
      await selectTask(selected ? null : taskIndex);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        aria-pressed={selected}
        className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${selected ? "border border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300" : "bg-accent text-accent-fg hover:bg-accent-hover"}`}
      >
        {saving ? "Saving…" : selected ? "✓ Selected — clear" : "Select this task"}
      </button>
      {error ? <span className="text-xs text-red-500">Couldn’t save. Try again.</span> : null}
    </div>
  );
}
