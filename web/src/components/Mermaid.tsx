"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

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
 * The inline diagram is clickable: it opens a fullscreen lightbox with
 * cursor-anchored wheel zoom, drag panning, and zoom controls, so large
 * flowcharts stay readable without touching the browser zoom.
 */
export function Mermaid({ source, title }: { source: string; title?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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
    <>
      <div
        role="button"
        tabIndex={svg ? 0 : -1}
        aria-label={`Expand diagram${title ? `: ${title}` : ""}`}
        title="Click to expand and zoom"
        onClick={() => svg && setExpanded(true)}
        onKeyDown={(e) => {
          if (svg && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded(true);
          }
        }}
        className="group relative cursor-zoom-in rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <div className="mermaid-host flex justify-center overflow-x-auto">
          {svg ? (
            <div aria-label="diagram" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="flex items-center gap-2 py-8 text-sm text-faint">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent" />
              Rendering diagram…
            </div>
          )}
        </div>
        {svg ? (
          <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[0.7rem] font-medium text-muted opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <ExpandIcon />
            Expand
          </span>
        ) : null}
      </div>

      {expanded && svg ? (
        <DiagramLightbox
          svg={svg}
          title={title}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </>
  );
}

const MIN_K = 0.2;
const MAX_K = 8;
const FIT_MARGIN = 32; // px of breathing room around the fitted diagram
const CONTENT_PAD = 16; // matches the p-4 on the lightbox content card

function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k));
}

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // Read the diagram's natural size from its viewBox. The wrapper div is then
  // sized declaratively from this state and CSS makes the SVG fill it (see
  // .diagram-lightbox in globals.css) — no imperative styling of Mermaid's SVG.
  useLayoutEffect(() => {
    const svgEl = contentRef.current?.querySelector("svg");
    if (!svgEl) return;
    const vb = svgEl.viewBox?.baseVal;
    setNatural({
      w: vb?.width || svgEl.clientWidth || 800,
      h: vb?.height || svgEl.clientHeight || 600,
    });
  }, [svg]);

  // Scale to fit the viewport and centre the diagram.
  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !natural) return;
    const cw = natural.w + CONTENT_PAD * 2;
    const ch = natural.h + CONTENT_PAD * 2;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    // Never fit above 2x — tiny diagrams shouldn't balloon — but always fit
    // down so the whole diagram is visible on open.
    const k = clampK(
      Math.min(2, (vw - FIT_MARGIN) / cw, (vh - FIT_MARGIN) / ch),
    );
    setTransform({ k, x: (vw - cw * k) / 2, y: (vh - ch * k) / 2 });
  }, [natural]);

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

  const zoomAt = (sx: number, sy: number, factor: number) =>
    setTransform((t) => {
      const k = clampK(t.k * factor);
      const gx = (sx - t.x) / t.k;
      const gy = (sy - t.y) / t.k;
      return { k, x: sx - gx * k, y: sy - gy * k };
    });

  const onWheel = (e: React.WheelEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    zoomAt(
      e.clientX - (rect?.left ?? 0),
      e.clientY - (rect?.top ?? 0),
      e.deltaY < 0 ? 1.12 : 1 / 1.12,
    );
  };

  const zoomBy = (factor: number) => {
    const viewport = viewportRef.current;
    zoomAt(
      (viewport?.clientWidth ?? 0) / 2,
      (viewport?.clientHeight ?? 0) / 2,
      factor,
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setIsPanning(true);
    panState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: transform.x,
      origY: transform.y,
      moved: false,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const ps = panState.current;
    if (!ps) return;
    const dx = e.clientX - ps.startX;
    const dy = e.clientY - ps.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) ps.moved = true;
    setTransform((t) => ({ ...t, x: ps.origX + dx, y: ps.origY + dy }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const ps = panState.current;
    panState.current = null;
    setIsPanning(false);
    // A plain click (no drag) on the backdrop — not on the diagram — closes.
    if (ps && !ps.moved && e.target === viewportRef.current) onClose();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    zoomAt(
      e.clientX - (rect?.left ?? 0),
      e.clientY - (rect?.top ?? 0),
      1.6,
    );
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Diagram: ${title}` : "Diagram"}
      className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-sm"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0 truncate text-sm font-medium text-white/90">
          {title ?? "Diagram"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <LightboxButton label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
            −
          </LightboxButton>
          <LightboxButton label="Zoom in" onClick={() => zoomBy(1.25)}>
            +
          </LightboxButton>
          <LightboxButton label="Fit to screen" onClick={fit}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </LightboxButton>
          <LightboxButton label="Close" onClick={onClose} ref={closeRef}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </LightboxButton>
        </div>
      </div>

      {/* Pan/zoom viewport */}
      <div
        ref={viewportRef}
        className="relative flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      >
        <div
          ref={contentRef}
          className="diagram-lightbox absolute left-0 top-0 origin-top-left rounded-lg bg-surface p-4 shadow-2xl"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
            width: natural ? natural.w + CONTENT_PAD * 2 : undefined,
            height: natural ? natural.h + CONTENT_PAD * 2 : undefined,
            visibility: natural ? "visible" : "hidden",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[0.7rem] text-white/70">
          Scroll to zoom · drag to pan · double-click to zoom in · Esc to close
        </p>
      </div>
    </div>,
    document.body,
  );
}

const LightboxButton = forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode;
    label: string;
    onClick: () => void;
  }
>(function LightboxButton({ children, label, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-base font-medium text-white transition hover:bg-white/20"
    >
      {children}
    </button>
  );
});

function ExpandIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9 2h5v5M7 14H2V9M14 2 9.5 6.5M2 14l4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
