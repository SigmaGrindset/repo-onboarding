"use client";

import { usePathname } from "next/navigation";
import { RouteErrorState } from "@/components/resilience";

export default function VersionsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const segments = usePathname().split("/").filter(Boolean);
  const analysisHref = segments.length >= 2 ? `/analysis/${segments[1]}` : "/";
  return (
    <RouteErrorState
      error={error}
      reset={unstable_retry}
      title="We couldn't load version history."
      hint="The history service may be temporarily unavailable. Retry or return to the current analysis."
      backHref={analysisHref}
      backLabel="Current analysis"
    />
  );
}
