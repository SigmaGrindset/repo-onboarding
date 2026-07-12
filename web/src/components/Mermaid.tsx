"use client";

import { useEffect, useRef, useState } from "react";

let counter = 0;

function isDarkTheme(): boolean {
  // The resolved theme is stamped on <html data-theme> before paint by the
  // inline script in layout.tsx (and kept current by ThemeToggle).
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "dark"
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
        const dark = isDarkTheme();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          // Without this, Mermaid 11 appends its own "Syntax error" element to
          // document.body on parse failure (visible stacked at the bottom of
          // the page, doubled under dev StrictMode). We render our own
          // <pre> fallback instead.
          suppressErrorRendering: true,
          theme: dark ? "dark" : "default",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        });

        counter += 1;
        const id = `mmd-${Date.now()}-${counter}`;
        try {
          const { svg } = await mermaid.render(id, source);
          if (cancelled) return;
          if (hostRef.current) {
            hostRef.current.innerHTML = svg;
          }
          setError(null);
          setRendered(true);
        } catch (renderError) {
          // Belt-and-braces: remove any scratch/error nodes Mermaid left
          // attached directly to <body> for this render id. (Scoped to body
          // children only, so a successfully mounted SVG inside our host —
          // which reuses the same id — is never touched.)
          for (const nodeId of [id, `d${id}`]) {
            const el = document.getElementById(nodeId);
            if (el && el.parentElement === document.body) el.remove();
          }
          throw renderError;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to render diagram");
        setRendered(true);
      }
    }

    render();

    // Re-render when the theme changes so the diagram matches. Watching the
    // data-theme attribute covers both the header toggle and OS changes
    // (ThemeToggle re-stamps the attribute while following the OS).
    let lastDark = isDarkTheme();
    const observer = new MutationObserver(() => {
      const dark = isDarkTheme();
      if (dark === lastDark) return;
      lastDark = dark;
      setRendered(false);
      render();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
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
