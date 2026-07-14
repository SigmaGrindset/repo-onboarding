"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { TourStep } from "@schema/analysis";
import { githubBlobUrl } from "@/lib/github";
import {
  clearLocalTourProgress,
  readLocalTourProgress,
  writeLocalTourProgress,
} from "@/lib/tour-progress-local";
import { FileChip } from "@/components/ui";

/** Inert subscription for useSyncExternalStore-as-hydration-signal. */
const noopSubscribe = () => () => {};

export function TourStepper({
  steps,
  initialStep,
  analysisId,
  storage,
  initialFurthest,
  resumeFromLocal,
  repoUrl,
  commitSha,
}: {
  steps: TourStep[];
  initialStep: number;
  /** Route id (`fixture`, `db_…` or `st_…`) — the progress storage key. */
  analysisId: string;
  /** Where furthest-step writes go: localStorage, or the per-user DB route. */
  storage: "local" | "db";
  /** Server-known furthest step ("db" storage); 0 when unknown/local. */
  initialFurthest: number;
  /** Jump to the locally stored furthest step after mount (no explicit ?step=). */
  resumeFromLocal: boolean;
  repoUrl: string | null;
  commitSha: string | null;
}) {
  const total = steps.length;
  const router = useRouter();
  const pathname = usePathname();
  const clamp = useCallback(
    (n: number) => Math.min(Math.max(n, 1), total),
    [total],
  );
  const [current, setCurrent] = useState(() => clamp(initialStep));

  // Follow ?step= changes pushed from outside (e.g. the command palette)
  // while already mounted. State is adjusted during render (the React
  // "derived state" pattern); our own replace below round-trips as a no-op.
  const stepParam = useSearchParams().get("step");
  const [applied, setApplied] = useState(stepParam);
  if (stepParam !== applied) {
    setApplied(stepParam);
    const n = Number.parseInt(stepParam ?? "", 10);
    if (Number.isFinite(n) && clamp(n) !== current) setCurrent(clamp(n));
  }

  // Resume where the visitor left off: with no explicit ?step= in the URL,
  // jump to the locally stored furthest step. The server can't read
  // localStorage — unlike "db" storage, where the page resumes via initialStep
  // — so this is a one-shot render-time adjustment (same derived-state pattern
  // as the ?step= follower above) taken on the first post-hydration render,
  // which is exactly when `hydrated` flips from its server snapshot.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [resumed, setResumed] = useState(!resumeFromLocal);
  if (hydrated && !resumed) {
    setResumed(true);
    const stored = readLocalTourProgress(analysisId, total);
    if (stored > 1) setCurrent(clamp(stored));
  }

  // Persist the furthest step reached (monotonic — never lowered). Local mode
  // writes localStorage; cloud analyses fire-and-forget to the progress route,
  // whose GREATEST upsert makes late/out-of-order writes harmless.
  const furthestRef = useRef(initialFurthest);
  useEffect(() => {
    if (current <= furthestRef.current) return;
    furthestRef.current = current;
    if (storage === "local") {
      writeLocalTourProgress(analysisId, current);
    } else {
      fetch(`/api/analyses/${analysisId}/tour-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ furthestStep: current }),
      }).catch(() => {});
    }
  }, [current, storage, analysisId]);

  // Reflect the step in the URL for deep-linking, without scrolling.
  useEffect(() => {
    router.replace(`${pathname}?step=${current}`, { scroll: false });
  }, [current, pathname, router]);

  // Left / right arrow keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setCurrent((c) => clamp(c - 1));
      if (e.key === "ArrowRight") setCurrent((c) => clamp(c + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clamp]);

  // Reset = back to fresh-visit state. Clearing storage first matters in
  // local mode: the never-lower guard in writeLocalTourProgress compares
  // against the *stored* value, so the persist effect's follow-up write of 1
  // only lands on an empty key. (With total === 1 setCurrent(1) is a no-op and
  // storage stays empty until the next mount rewrites 1 — same net state.)
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(false);
  const handleReset = async () => {
    setResetError(false);
    if (storage === "local") {
      clearLocalTourProgress(analysisId);
    } else {
      // Await the DELETE so the effect's follow-up POST of furthestStep=1 is
      // strictly ordered after it; on failure nothing is touched.
      setResetting(true);
      try {
        const res = await fetch(`/api/analyses/${analysisId}/tour-progress`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`reset failed: ${res.status}`);
      } catch {
        setResetError(true);
        return;
      } finally {
        setResetting(false);
      }
    }
    furthestRef.current = 0;
    setConfirmingReset(false);
    setCurrent(1);
  };

  const step = steps[current - 1];
  if (!step) return null;

  const atEnd = current === total;

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      {/* Step rail */}
      <ol className="flex gap-2 overflow-x-auto pb-2 lg:w-56 lg:shrink-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {steps.map((s) => {
          const active = s.order === current;
          const done = s.order < current;
          return (
            <li key={s.order} className="shrink-0">
              <button
                type="button"
                onClick={() => setCurrent(clamp(s.order))}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold ${
                    active
                      ? "bg-accent text-accent-fg"
                      : done
                        ? "bg-accent/30 text-accent"
                        : "bg-surface-3 text-faint"
                  }`}
                >
                  {s.order}
                </span>
                <span className="hidden truncate lg:block">{s.title}</span>
                <span className="lg:hidden">Step {s.order}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Active step */}
      <div className="min-w-0 flex-1">
        {/* Progress */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-faint">
            <span>
              Step <span className="font-semibold text-text">{current}</span>{" "}
              of {total}
            </span>
            <span>{Math.round((current / total) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${(current / total) * 100}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-text">{step.title}</h2>

          <div className="mt-3 flex flex-wrap gap-2">
            {step.files.map((f, i) => (
              <FileChip
                key={`${f.path}-${i}`}
                path={f.path}
                startLine={f.startLine}
                endLine={f.endLine}
                href={githubBlobUrl(
                  repoUrl,
                  commitSha,
                  f.path,
                  f.startLine,
                  f.endLine,
                )}
              />
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Panel
              tone="accent"
              label="Why read this now"
              body={step.why}
            />
            <Panel
              tone="emerald"
              label="What to notice"
              body={step.notice}
            />
          </div>
        </div>

        {/* Completion ceremony — reaching the last step is what persists
            furthest=total (and flips the index badge), so the card keys off
            the same condition; ?step= deep-links to the end get it too. */}
        {atEnd && (
          <div className="tour-complete-pop mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  🎉 Tour complete
                </h3>
                <p className="mt-1 text-[0.86rem] leading-relaxed text-text">
                  You&apos;ve walked the whole reading path. Ready to get your
                  hands dirty? First Tasks has good starting points.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 pt-0.5 text-xs">
                {confirmingReset ? (
                  <>
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={resetting}
                      className="font-medium text-red-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resetting ? "Resetting…" : "Confirm reset"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingReset(false);
                        setResetError(false);
                      }}
                      className="font-medium text-muted transition hover:text-text"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(true)}
                    className="font-medium text-muted transition hover:text-red-500"
                  >
                    Reset progress
                  </button>
                )}
              </div>
            </div>
            {resetError && (
              <p className="mt-2 text-xs text-red-500">
                Couldn&apos;t reset — try again.
              </p>
            )}
          </div>
        )}

        {/* Prev / next */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCurrent((c) => clamp(c - 1))}
            disabled={current === 1}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text transition hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M10 3.5 5.5 8 10 12.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Previous
          </button>
          {/* On the last step the primary action hands off to First Tasks —
              deliberately skipping Hotspots, the literal next section; the
              natural move after the tour is "go do something". */}
          {atEnd ? (
            <Link
              href={`/analysis/${analysisId}/tasks`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover"
            >
              Continue to First Tasks
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M6 3.5 10.5 8 6 12.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setCurrent((c) => clamp(c + 1))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover"
            >
              Next
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M6 3.5 10.5 8 6 12.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({
  tone,
  label,
  body,
}: {
  tone: "accent" | "emerald";
  label: string;
  body: string;
}) {
  const styles =
    tone === "accent"
      ? "border-accent/25 bg-accent-soft"
      : "border-emerald-500/25 bg-emerald-500/8";
  const labelColor =
    tone === "accent"
      ? "text-accent"
      : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <h3
        className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${labelColor}`}
      >
        {label}
      </h3>
      <p className="text-[0.86rem] leading-relaxed text-text">{body}</p>
    </div>
  );
}
