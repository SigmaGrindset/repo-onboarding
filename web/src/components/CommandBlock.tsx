"use client";

import { useCallback, useState } from "react";

/**
 * A copy-pasteable mono command block with a copy button that flashes
 * "Copied" for two seconds. Client-only (needs the clipboard + local state);
 * the pages that use it stay server components and just drop this in.
 *
 * Mirrors the copy interaction in ApiTokensPanel so the whole app behaves
 * consistently.
 */
export function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }, [command]);

  return (
    <div className="flex items-center gap-2">
      <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[0.8rem] leading-relaxed text-text">
        <code>{command}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy: ${command}`}
        className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition hover:border-border-strong"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
