"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  deriveDiagramModel,
  neighbourhoodOf,
  type DiagramModel,
  type Neighbourhood,
} from "@/lib/diagram-model";
import {
  ViewportButton,
  ViewportControls,
  svgContentSize,
  useInjectedSvg,
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
 *
 * Selecting an element lights its neighbourhood and dims the rest of the drawing.
 * The canvas was handed its diagram as a string, so highlighting means marking up
 * the SVG it injected — unlike the dependency graph, which draws its own elements
 * and can style them where it draws them.
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
  const html = useInjectedSvg(svg);
  const [content, setContent] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [available, setAvailable] = useState(0);
  // The capability probe. A diagram whose rendered output exposes none of the
  // identity the canvas reads is a pan-and-zoom surface and nothing more.
  const [model, setModel] = useState<DiagramModel | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

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

  const selectable = offersSelection(model);

  // Measure and probe the drawing once it is in the DOM. Both are redone when a
  // theme change re-renders the diagram.
  useLayoutEffect(() => {
    const svgEl = hostRef.current?.querySelector("svg");
    if (!svgEl) return;
    setContent(svgContentSize(svgEl));

    const derived = deriveDiagramModel(svgEl);
    setModel(derived);
    if (offersSelection(derived)) markIdentity(svgEl, derived);
    // A theme change re-renders the same diagram, so the reader keeps their
    // selection; a different diagram would not hold the element they picked.
    setSelectedId((current) =>
      current && derived?.elements.some((el) => el.id === current)
        ? current
        : null,
    );
    setHoverId(null);
  }, [svg]);

  // Hover previews a selection without committing to one, exactly as the
  // dependency graph does.
  const activeId = hoverId ?? selectedId;
  const lit = useMemo<Neighbourhood | null>(
    () => (model && activeId ? neighbourhoodOf(model, activeId) : null),
    [model, activeId],
  );

  useLayoutEffect(() => {
    const svgEl = hostRef.current?.querySelector("svg");
    if (svgEl) paintHighlight(svgEl, lit, selectedId);
  }, [svg, lit, selectedId]);

  // Escape clears, so a reader is never left with a diagram they cannot un-dim.
  // Bound to the window because nothing here is focusable yet, so Escape clears
  // every canvas on the page at once; the keyboard ticket gives the canvas focus
  // and scopes this to it.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

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

  // A press that travelled was a pan, not a click on whatever sat under it; and
  // a press from a finger belongs to the page, which owns touch on a canvas.
  const pressRef = useRef({ dragged: false, touch: false });
  const finishPan = useCallback(() => {
    pressRef.current.dragged = endPan()?.moved ?? false;
  }, [endPan]);

  return (
    <div
      // The capability probe's own answer: whether this diagram exposes any
      // identity at all. Offering selection on top of that also needs
      // connections, which is what `selectable` says.
      data-diagram-addressable={model !== null}
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
          pressRef.current.touch = event.pointerType === "touch";
          if (event.pointerType !== "touch") beginPan(event);
        }}
        onPointerMove={updatePan}
        onPointerUp={finishPan}
        onPointerOver={(event) => {
          if (event.pointerType === "touch" || !selectable || isPanning) return;
          setHoverId(elementIdAt(event.target));
        }}
        onPointerLeave={() => {
          finishPan();
          setHoverId(null);
        }}
        onClick={(event) => {
          const { dragged, touch } = pressRef.current;
          if (!selectable || dragged || touch) return;
          // The same element again, or the space around the drawing, clears.
          const id = elementIdAt(event.target);
          setSelectedId((current) => (id && id !== current ? id : null));
        }}
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
          dangerouslySetInnerHTML={html}
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
        {selectable ? "Click to highlight · " : null}
        {zoomModifierLabel()} + scroll to zoom · drag to pan
      </p>
    </div>
  );
}

/**
 * Whether this diagram gives a reader anything to select. A model with no
 * connections has no neighbourhood to light, so its canvas keeps no selection
 * affordances at all rather than half of them — which today means every sequence
 * diagram, whose connections arrive with that family's own reader.
 */
function offersSelection(model: DiagramModel | null): model is DiagramModel {
  return (model?.connections.length ?? 0) > 0;
}

/**
 * Which addressable element the reader is pointing at, if any. A diagram's parts
 * nest — a label inside a foreign object inside the node's own group — so the
 * answer is the nearest marked ancestor of whatever the pointer landed on.
 */
function elementIdAt(target: EventTarget | null): string | null {
  const marked =
    target instanceof Element ? target.closest("[data-diagram-element]") : null;
  return marked?.getAttribute("data-diagram-element") ?? null;
}

/**
 * Everything the drawing contains that carries no identity: subgraph frames and
 * their titles, and any edge whose endpoints would not resolve. Decoration is
 * never part of a neighbourhood, so it dims whenever anything is lit — an edge
 * the canvas admits it cannot read must not end up the brightest thing on a
 * dimmed diagram. Selected after identity is marked, so `:not` can see it.
 */
const DECORATION = [
  "g.cluster",
  "g.cluster-label",
  'path[data-et="edge"]:not([data-diagram-connection])',
  "g.edgeLabels g.label:not([data-diagram-connection])",
].join(", ");

/**
 * Marks the drawing with the identities the model derived, so that pointing,
 * highlighting and styling all work off our own attributes instead of
 * re-deriving Mermaid's on every event. Re-applied whenever the diagram is
 * re-rendered, since that replaces the drawing wholesale.
 */
function markIdentity(svg: SVGSVGElement, model: DiagramModel) {
  for (const element of model.elements) {
    svg
      .querySelector(`[id="${element.domId}"]`)
      ?.setAttribute("data-diagram-element", element.id);
  }
  for (const connection of model.connections) {
    // The connection's path and, where the diagram drew one, its label.
    for (const part of svg.querySelectorAll(`[data-id="${connection.id}"]`)) {
      part.setAttribute("data-diagram-connection", connection.id);
    }
  }
  for (const part of svg.querySelectorAll(DECORATION)) {
    part.setAttribute("data-diagram-decoration", "");
  }
}

/**
 * Lights the neighbourhood and dims the remainder. With nothing active the marks
 * come off entirely, so an untouched diagram carries no highlight styling at all.
 */
function paintHighlight(
  svg: SVGSVGElement,
  lit: Neighbourhood | null,
  selectedId: string | null,
) {
  for (const node of svg.querySelectorAll("[data-diagram-element]")) {
    const id = node.getAttribute("data-diagram-element");
    setOrRemove(node, "data-diagram-lit", inside(lit?.elements, id));
    setOrRemove(node, "data-diagram-selected", id === selectedId ? "true" : null);
  }
  for (const edge of svg.querySelectorAll("[data-diagram-connection]")) {
    const id = edge.getAttribute("data-diagram-connection");
    setOrRemove(edge, "data-diagram-lit", inside(lit?.connections, id));
  }
  for (const part of svg.querySelectorAll("[data-diagram-decoration]")) {
    setOrRemove(part, "data-diagram-lit", lit ? "false" : null);
  }
}

/** Whether a neighbourhood holds this identity, or null when nothing is lit. */
function inside(neighbourhood: Set<string> | undefined, id: string | null) {
  if (!neighbourhood || !id) return null;
  return String(neighbourhood.has(id));
}

function setOrRemove(el: Element, name: string, value: string | null) {
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
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
