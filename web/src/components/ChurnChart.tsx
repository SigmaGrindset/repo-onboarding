"use client";

import { useState } from "react";
import type { Hotspot } from "@schema/analysis";
import { ACTIVITY_BAR_COLOR, activityStyle } from "@/lib/styles";
import { Badge } from "@/components/ui";
import { formatNumber } from "@/lib/format";

export function ChurnChart({ entries }: { entries: Hotspot[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const max = Math.max(1, ...entries.map((e) => e.commits));

  return (
    <ul className="space-y-2.5">
      {entries.map((h, i) => {
        const pct = (h.commits / max) * 100;
        const isOpen = open === i;
        const activity = activityStyle(h.recentActivity);
        return (
          <li
            key={h.path}
            className="overflow-hidden rounded-xl border border-border bg-surface"
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full px-4 py-3 text-left transition hover:bg-surface-2"
            >
              <div className="flex items-center gap-3">
                <code className="min-w-0 flex-1 truncate font-mono text-[0.8rem] text-text">
                  {h.path}
                </code>
                <Badge className={activity.className}>{activity.label}</Badge>
                <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-text">
                  {formatNumber(h.commits)}
                  <span className="ml-1 text-[0.7rem] font-normal text-faint">
                    commits
                  </span>
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                  className={`shrink-0 text-faint transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                >
                  <path
                    d="M6 3.5 10.5 8 6 12.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Bar */}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: ACTIVITY_BAR_COLOR[h.recentActivity],
                  }}
                />
              </div>
            </button>

            {isOpen ? (
              <div className="border-t border-border bg-surface-2/40 px-4 py-3">
                {h.churnScore != null ? (
                  <p className="mb-1.5 text-xs text-faint">
                    Churn score:{" "}
                    <span className="font-medium tabular-nums text-muted">
                      {formatNumber(h.churnScore)}
                    </span>
                  </p>
                ) : null}
                <p className="text-[0.86rem] leading-relaxed text-muted">
                  {h.insight}
                </p>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
