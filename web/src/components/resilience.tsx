"use client";

import Link from "next/link";
import { useEffect } from "react";

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block rounded bg-surface-2 motion-safe:animate-pulse ${className}`}
    />
  );
}

export function LoadingStatus({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

export function AnalysisShellSkeleton() {
  return (
    <div
      aria-busy="true"
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8 lg:py-8"
    >
      <LoadingStatus label="Loading analysis" />
      <aside className="lg:w-64 lg:shrink-0">
        <SkeletonLine className="mb-4 h-4 w-24" />
        <div className="mb-5 rounded-xl border border-border bg-surface p-4">
          <SkeletonLine className="h-4 w-3/4" />
          <SkeletonLine className="mt-3 h-3 w-1/2" />
          <SkeletonLine className="mt-2 h-3 w-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 7 }, (_, index) => (
            <SkeletonLine key={index} className="h-8 w-full" />
          ))}
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <SectionSkeleton />
      </main>
    </div>
  );
}

export function SectionSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div aria-busy="true">
      <LoadingStatus label="Loading section" />
      <SkeletonLine className="h-3 w-20" />
      <SkeletonLine className="mt-3 h-8 w-56 max-w-full" />
      <SkeletonLine className="mt-3 h-4 w-3/4" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-5">
            <SkeletonLine className="h-5 w-2/5" />
            <SkeletonLine className="mt-4 h-3 w-full" />
            <SkeletonLine className="mt-2 h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RouteErrorState({
  error,
  reset,
  title,
  hint,
  backHref = "/",
  backLabel = "All analyses",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  hint: string;
  backHref?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-xl items-center px-5 py-12">
      <div role="alert" className="w-full rounded-xl border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-semibold text-text">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{hint}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover"
          >
            Try again
          </button>
          <Link
            href={backHref}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border-strong"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
