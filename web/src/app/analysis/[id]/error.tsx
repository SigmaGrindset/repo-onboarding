"use client";

import { usePathname } from "next/navigation";
import { RouteErrorState } from "@/components/resilience";

export default function SectionError({
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
      title="We couldn't load this analysis section."
      hint="Try loading the section again. The rest of the analysis is still available."
      backHref={analysisHref}
      backLabel="Analysis overview"
    />
  );
}
