import { LoadingStatus, SkeletonLine } from "@/components/resilience";

export default function RootLoading() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
      <LoadingStatus label="Loading analyses" />
      <SkeletonLine className="h-6 w-52" />
      <SkeletonLine className="mt-5 h-10 w-72 max-w-full" />
      <SkeletonLine className="mt-4 h-4 w-3/4" />
      <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-5">
            <SkeletonLine className="h-5 w-2/3" />
            <SkeletonLine className="mt-4 h-3 w-full" />
            <SkeletonLine className="mt-2 h-3 w-4/5" />
            <SkeletonLine className="mt-6 h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
