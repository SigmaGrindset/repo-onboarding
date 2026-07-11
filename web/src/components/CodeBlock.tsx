"use client";

import { useState } from "react";

/** A copyable shell command / code block with a copy-to-clipboard affordance. */
export function CodeBlock({
  code,
  label,
}: {
  code: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); fail silently.
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-surface-2">
      {label ? (
        <div className="border-b border-border px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-wide text-faint">
          {label}
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <pre className="min-w-0 flex-1 overflow-x-auto px-3.5 py-2.5 font-mono text-[0.82rem] leading-relaxed text-text">
          <code>{code}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy to clipboard"
          className="m-2 shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-[0.72rem] font-medium text-muted opacity-0 transition hover:border-border-strong hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
