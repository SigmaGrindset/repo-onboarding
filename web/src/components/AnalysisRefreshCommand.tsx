import { CommandBlock } from "@/components/CommandBlock";

export const ANALYSIS_REFRESH_COMMAND = "npx repo-onboarding init";

/**
 * Closes the freshness loop in the analysis sidebar: once the age/drift badge
 * says an analysis needs attention, its owner can immediately copy the first
 * command in the refresh workflow without leaving the analysis.
 */
export function AnalysisRefreshCommand() {
  return (
    <details className="group mt-3 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[0.7rem] font-medium text-accent marker:content-none hover:underline">
        <span>Refresh analysis</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-180"
        >
          <path
            d="m3 4.5 3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <p className="mt-2 text-[0.68rem] leading-relaxed text-faint">
        Run this in the repo root to refresh its facts. Then ask your coding
        agent to regenerate and upload <span className="font-mono">analysis.json</span>.
      </p>
      <div className="mt-2">
        <CommandBlock command={ANALYSIS_REFRESH_COMMAND} />
      </div>
    </details>
  );
}
