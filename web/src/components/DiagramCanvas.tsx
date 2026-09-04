"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { deriveDiagramModel } from "@/lib/diagram-model";
import {
  ViewportButton,
  ViewportControls,
  svgContentSize,
  useViewport,
} from "@/components/viewport";

/**
 * A diagram canvas: one architecture diagram as a live surface in the section it
 * belongs to, rather than a picture that can only be opened elsewhere.
 *
 * Reading the page comes first. A plain wheel scrolls the page exactly as it did
 * when this was an image, and only a held modifier zooms — the Architecture
 * section stacks several diagrams, so a canvas that ate the scroll gesture would
 * make the page unusable. Trackpad pinch arrives as a modified wheel and so needs
 * no handling of its own. Touch is left alone entirely for the same reason.
 *
 * A canvas is as tall as its diagram is actually drawn, between a floor and a
 * ceiling, and the initial fit never scales above natural size: a small diagram
 * looks exactly as it did before, and only a large one arrives zoomed out.
 */

/** Scale limits. Wider than the graph's, because diagram text is small. */
const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
/** The canvas is as tall as its diagram between these. */
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 560;
/** Breathing room around the fitted diagram. */
const FIT_MARGIN = 24;

export function DiagramCanvas({
  svg,
  title,
  onExpand,
}: {
  svg: string;
  title?: string;
  /** Opens the fullscreen view. */
  onExpand: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [available, setAvailable] = useState(0);
  // The capability probe. A diagram whose rendered output exposes none of the
  // identity the canvas reads is a pan-and-zoom surface and nothing more.
  const [addressable, setAddressable] = useState(false);

  const {
    ref: viewportRef,
    element: viewportEl,
    transform,
    isPanning,
    zoomBy,
    fitToContent,
    beginPan,
    updatePan,
    endPan,
  } = useViewport<HTMLDivElement>({
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    // Held modifier only, so a plain wheel keeps scrolling the page. Trackpad
    // pinch is delivered as a wheel with ctrlKey set, so it lands here too.
    shouldZoomOnWheel: (event) => event.ctrlKey || event.metaKey,
  });

  // Measure and probe the drawing once it is in the DOM. Both are redone when a
  // theme change re-renders the diagram.
  useLayoutEffect(() => {
    const svgEl = hostRef.current?.querySelector("svg");
    if (!svgEl) return;
    setContent(svgContentSize(svgEl));
    setAddressable(deriveDiagramModel(svgEl) !== null);
  }, [svg]);

  // How wide the canvas is. Only the width is watched: the height is computed
  // from it below, so watching both would be watching our own output.
  useLayoutEffect(() => {
    if (!viewportEl) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailable(entry.contentRect.width),
    );
    observer.observe(viewportEl);
    return () => observer.disconnect();
  }, [viewportEl]);

  // How tall the diagram will actually be drawn. Sizing the canvas to the
  // diagram's natural height instead would leave a wide, short diagram sitting
  // in a band of empty space, since it is its width that forces the scale down.
  const drawn = content
    ? content.height * arrivalScale(content, available) + FIT_MARGIN
    : 0;
  const height = content
    ? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, drawn))
    : MIN_HEIGHT;

  const fit = useCallback(() => {
    if (!content) return;
    // Never above natural size: a three-box diagram should not be blown up to
    // fill the canvas, it should look the way it always did.
    fitToContent(content.width, content.height, {
      margin: FIT_MARGIN,
      maxScale: 1,
    });
  }, [content, fitToContent]);

  // Fit on arrival, and again when the canvas changes size. Deliberately not on
  // every re-measure: a theme change re-renders the same diagram, and refitting
  // there would throw away wherever the reader had zoomed and panned to.
  const shape = content ? `${content.width}x${content.height}@${height}` : null;
  const fittedShape = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!shape || fittedShape.current === shape) return;
    fittedShape.current = shape;
    fit();
  }, [shape, fit]);

  return (
    <div
      data-diagram-addressable={addressable}
      className="group relative overflow-hidden rounded-md border border-border bg-surface"
      style={{ height }}
    >
      <div
        ref={viewportRef}
        className="absolute inset-0 select-none overflow-hidden"
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
        // Touch is deliberately not handled: the page owns that gesture, and a
        // reader on a phone gets the same scrolling they had before.
        onPointerDown={(event) => {
          if (event.pointerType !== "touch") beginPan(event);
        }}
        onPointerMove={updatePan}
        onPointerUp={endPan}
        onPointerLeave={endPan}
      >
        <div
          ref={hostRef}
          role="img"
          aria-label={title ?? "Diagram"}
          className="diagram-canvas absolute left-0 top-0 origin-top-left"
          style={{
            width: content?.width,
            height: content?.height,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
            visibility: content ? "visible" : "hidden",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <ViewportControls
          zoomBy={zoomBy}
          orientation="vertical"
          tone="surface"
          resetVariant="fit"
          onReset={fit}
        />
        <ViewportButton
          tone="surface"
          label={`Expand diagram${title ? `: ${title}` : ""}`}
          onClick={onExpand}
        >
          <ExpandIcon />
        </ViewportButton>
      </div>

      {/* The canvas is sized to its diagram, so a hint pinned over it would
          cover the drawing while the reader is reading. It appears when the
          pointer is on the canvas — which is exactly when the wheel matters. */}
      <p className="pointer-events-none absolute bottom-2 left-2 rounded-full border border-border bg-surface/85 px-2.5 py-1 text-[0.7rem] text-faint opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        {zoomModifierLabel()} + scroll to zoom · drag to pan
      </p>
    </div>
  );
}

/**
 * The scale the diagram will arrive at, which the width alone decides: the
 * canvas is then made tall enough for it, so the height never binds first.
 * Capped at 1, because a small diagram is shown at its natural size.
 */
function arrivalScale(
  content: { width: number; height: number },
  available: number,
) {
  if (available <= 0) return 1;
  return Math.min(1, (available - FIT_MARGIN) / content.width);
}

/**
 * What to call the zoom modifier in the hint. Both keys zoom, but naming the one
 * the reader's keyboard actually has is the whole point of a hint. Read during
 * render without guarding for hydration, because a canvas only ever exists once
 * Mermaid has produced an SVG, which happens in the browser.
 */
function zoomModifierLabel() {
  const apple =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  return apple ? "⌘" : "Ctrl";
}

function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
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
