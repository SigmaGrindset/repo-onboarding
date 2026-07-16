"use client";

import { RouteErrorState } from "@/components/resilience";

export default function AnalysisError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteErrorState
      error={error}
      reset={unstable_retry}
      title="We couldn't load this analysis."
      hint="Its cloud data may be temporarily unavailable. Retry the request or return to your analyses."
    />
  );
}
