"use client";

import { RouteErrorState } from "@/components/resilience";

export default function RootError({
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
      title="We couldn't load this page."
      hint="The service may be temporarily unavailable. Try again without losing your place."
    />
  );
}
