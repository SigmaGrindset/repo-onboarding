"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DiagramCanvas } from "@/components/DiagramCanvas";
import {
  ViewportButton,
  ViewportControls,
  svgContentSize,
  useViewport,
} from "@/components/viewport";

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
 * the section itself — which can still be promoted to the fullscreen view from
 * its own toolbar.
 */
export function Mermaid({ source, title }: { source: string; title?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);

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
        onExpand={() => setExpanded(true)}
      />
      {expanded ? (
        <DiagramLightbox
          svg={svg}
          title={title}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </>
  );
}

const FIT_MARGIN = 32; // px of breathing room around the fitted diagram
const CONTENT_PAD = 16; // matches the p-4 on the lightbox content card
// Never fit above 2x — tiny diagrams shouldn't balloon — but always fit down
// so the whole diagram is visible on open.
const MAX_FIT_SCALE = 2;

/**
 * Fullscreen diagram viewer: renders the already-produced SVG at its natural
 * size on a theme-matching card, fitted and centred in the viewport, with
 * cursor-anchored wheel zoom, drag panning, and button controls.
 */
function DiagramLightbox({
  svg,
  title,
  onClose,
}: {
  svg: string;
  title?: string;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [natural, setNatural] = useState<{
    width: number;
    height: number;
  } | null>(null);
  // Fullscreen and modal: nothing is behind it, so a plain wheel zooms.
  const {
    ref: viewportRef,
    element: viewportEl,
    transform,
    isPanning,
    zoomAtClient,
    zoomBy,
    fitToContent,
    beginPan,
    updatePan,
    endPan,
  } = useViewport<HTMLDivElement>({ minScale: 0.2, maxScale: 8 });

  // Read the diagram's natural size, the same way the inline canvas does. The
  // wrapper div is then sized declaratively from this state and CSS makes the
  // SVG fill it — no imperative styling of Mermaid's SVG.
  useLayoutEffect(() => {
    const svgEl = contentRef.current?.querySelector("svg");
    if (svgEl) setNatural(svgContentSize(svgEl));
  }, [svg]);

  // Scale to fit the viewport and centre the diagram.
  const fit = useCallback(() => {
    if (!natural) return;
    fitToContent(
      natural.width + CONTENT_PAD * 2,
      natural.height + CONTENT_PAD * 2,
      { margin: FIT_MARGIN, maxScale: MAX_FIT_SCALE },
    );
  }, [natural, fitToContent]);

  useLayoutEffect(() => {
    fit();
  }, [fit]);

  // Scroll lock, Escape-to-close, and refit on window resize.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", fit);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", fit);
    };
  }, [onClose, fit]);

  const onPointerUp = (e: React.PointerEvent) => {
    const pan = endPan();
    // A plain click (no drag) on the backdrop — not on the diagram — closes.
    if (pan && !pan.moved && e.target === viewportEl) onClose();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    zoomAtClient(e.clientX, e.clientY, 1.6);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Diagram: ${title}` : "Diagram"}
      className="fixed inset-0 z-50 flex flex-col bg-[#0f1216]/80 backdrop-blur-sm"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0 truncate text-sm font-medium text-[#e9edf2]/90">
          {title ?? "Diagram"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <ViewportControls
            zoomBy={zoomBy}
            orientation="horizontal"
            tone="overlay"
            resetVariant="fit"
            onReset={fit}
          />
          <ViewportButton
            tone="overlay"
            label="Close"
            onClick={onClose}
            ref={closeRef}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </ViewportButton>
        </div>
      </div>

      {/* Pan/zoom viewport */}
      <div
        ref={viewportRef}
        className="relative flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
        onPointerDown={beginPan}
        onPointerMove={updatePan}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div
          ref={contentRef}
          className="diagram-lightbox absolute left-0 top-0 origin-top-left rounded-lg bg-surface p-4 shadow-2xl"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
            width: natural ? natural.width + CONTENT_PAD * 2 : undefined,
            height: natural ? natural.height + CONTENT_PAD * 2 : undefined,
            visibility: natural ? "visible" : "hidden",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0f1216]/70 px-3 py-1 text-[0.7rem] text-[#e9edf2]/75">
          Scroll to zoom · drag to pan · double-click to zoom in · Esc to close
        </p>
      </div>
    </div>,
    document.body,
  );
}
