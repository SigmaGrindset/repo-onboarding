"use client";

import { useEffect, useRef, useState } from "react";

let counter = 0;

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Renders a Mermaid diagram on the client. Mermaid is dynamically imported so it
 * never runs during SSR. Render failures degrade gracefully to the raw source
 * inside a <pre> with an error note, rather than crashing the page.
 */
export function Mermaid({ source }: { source: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = prefersDark();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        });

        counter += 1;
        const id = `mmd-${Date.now()}-${counter}`;
        const { svg } = await mermaid.render(id, source);
        if (cancelled) return;
        if (hostRef.current) {
          hostRef.current.innerHTML = svg;
        }
        setError(null);
        setRendered(true);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to render diagram");
        setRendered(true);
      }
    }

    render();

    // Re-render when the colour scheme changes so the diagram matches the theme.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setRendered(false);
      render();
    };
    mq.addEventListener("change", onChange);

    return () => {
      cancelled = true;
      mq.removeEventListener("change", onChange);
    };
  }, [source]);

  if (error) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="mb-2 text-xs font-medium text-amber-600 dark:text-amber-400">
          Could not render this diagram — showing its source instead.
          <span className="ml-1 font-normal text-faint">({error})</span>
        </p>
        <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted">
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="mermaid-host flex justify-center overflow-x-auto">
      <div ref={hostRef} aria-label="diagram" />
      {!rendered ? (
        <div className="flex items-center gap-2 py-8 text-sm text-faint">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent" />
          Rendering diagram…
        </div>
      ) : null}
    </div>
  );
}
