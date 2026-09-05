"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DiagramCanvas,
  useDiagramSelection,
} from "@/components/DiagramCanvas";
import type { RepoFileIndex } from "@/lib/repo-files";

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
 *
 * What comes back is handed to a diagram canvas — a live pan-and-zoom surface in
 * the section itself — which promotes to a fullscreen one from its own toolbar.
 * Promotion is a change of size and not a change of tool, so both canvases are
 * the same component reading one shared selection: whatever the reader had
 * picked, lit and open is there on the way in and still there on the way back.
 */
export function Mermaid({
  source,
  title,
  repoFiles,
}: {
  source: string;
  title?: string;
  /** Where a diagram label that names a file can be resolved and linked. */
  repoFiles?: RepoFileIndex;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const selection = useDiagramSelection();

  // Where the reader was when they promoted the diagram, so leaving fullscreen
  // puts them back on the control they left from rather than at the top of the
  // document with no idea which diagram they were reading.
  const promotedFrom = useRef<HTMLElement | null>(null);
  const wasExpanded = useRef(false);

  const promote = useCallback(() => {
    const from = document.activeElement;
    // A finger promotes by tapping the drawing, which focuses nothing — so
    // there is no control to come back to, and none is invented.
    promotedFrom.current =
      from instanceof HTMLElement && from !== document.body ? from : null;
    setExpanded(true);
  }, []);

  // Focus is restored after the fullscreen view has gone, not as it is asked to
  // go: unmounting the control the reader is standing on drops focus to the body.
  useEffect(() => {
    if (wasExpanded.current && !expanded) promotedFrom.current?.focus();
    wasExpanded.current = expanded;
  }, [expanded]);

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
          setSvg(svg);
          setError(null);
        } catch (renderError) {
          // Belt-and-braces: remove any scratch/error nodes Mermaid left
          // attached directly to <body> for this render id.
          for (const nodeId of [id, `d${id}`]) {
            const el = document.getElementById(nodeId);
            if (el && el.parentElement === document.body) el.remove();
          }
          throw renderError;
        }
      } catch (e) {
        if (cancelled) return;
        setSvg(null);
        setError(e instanceof Error ? e.message : "Failed to render diagram");
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
  }, [source, renderAttempt]);

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
          Could not render this diagram — showing its source instead.
          <span className="ml-1 font-normal text-faint">({error})</span>
        </p>
          <button
            type="button"
            onClick={() => {
              setSvg(null);
              setError(null);
              setRenderAttempt((attempt) => attempt + 1);
            }}
            className="rounded-md border border-amber-500/30 px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:border-amber-500/60 dark:text-amber-300"
          >
            Retry rendering
          </button>
        </div>
        <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted">
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 py-8 text-sm text-faint"
      >
        <span
          aria-hidden
          className="h-3 w-3 motion-safe:animate-spin rounded-full border-2 border-border border-t-accent"
        />
        Rendering diagram…
      </div>
    );
  }

  return (
    <>
      <DiagramCanvas
        svg={svg}
        title={title}
        repoFiles={repoFiles}
        selection={selection}
        promoted={expanded}
        onExpand={promote}
      />
      {expanded ? (
        <DiagramCanvas
          svg={svg}
          title={title}
          repoFiles={repoFiles}
          selection={selection}
          presentation="fullscreen"
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </>
  );
}
