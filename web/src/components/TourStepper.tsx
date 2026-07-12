"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { TourStep } from "@schema/analysis";
import { githubBlobUrl } from "@/lib/github";
import { FileChip } from "@/components/ui";

export function TourStepper({
  steps,
  initialStep,
  repoUrl,
  commitSha,
}: {
  steps: TourStep[];
  initialStep: number;
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

  const step = steps[current - 1];
  if (!step) return null;

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
          <button
            type="button"
            onClick={() => setCurrent((c) => clamp(c + 1))}
            disabled={current === total}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
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
