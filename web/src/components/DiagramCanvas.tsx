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
  type AddressableElement,
  type DiagramModel,
  type ElementKind,
  type Neighbourhood,
} from "@/lib/diagram-model";
import {
  fileLinkFor,
  type RepoFileIndex,
  type RepoFileLink,
} from "@/lib/repo-files";
import {
  ViewportButton,
  ViewportControls,
  svgContentSize,
  useInjectedSvg,
  useViewport,
} from "@/components/viewport";
import { FileChip } from "@/components/ui";

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
 *
 * A selection also opens a card in the corner of the canvas naming what was
 * picked and what it connects to. The card sits over the drawing rather than
 * beside it: the reading column is narrow and the content per element is thin,
 * so a rail would spend a third of the column on four lines of text.
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
  repoFiles,
  onExpand,
}: {
  svg: string;
  title?: string;
  /** Where a label that names a file can be resolved and linked. */
  repoFiles?: RepoFileIndex;
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
  // The card is dismissible without giving up the selection it describes, so a
  // reader who wants to see the drawing under it keeps their highlight.
  const [dismissed, setDismissed] = useState(false);

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

  // What the card says. Read off the selection alone, never the hover: a card
  // that followed the pointer would flicker through the diagram on the way to it.
  const selected = useMemo(
    () => model?.elements.find((element) => element.id === selectedId) ?? null,
    [model, selectedId],
  );
  const connectedTo = useMemo(() => {
    if (!model || !selectedId) return [];
    const near = neighbourhoodOf(model, selectedId).elements;
    // In the order the diagram drew them, so the list does not reshuffle as the
    // reader walks from one element to the next.
    return model.elements.filter(
      (element) => element.id !== selectedId && near.has(element.id),
    );
  }, [model, selectedId]);

  // Every way of choosing an element goes through here, because choosing one
  // always brings its card with it, however the reader left the last one.
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setDismissed(false);
  }, []);

  // Escape clears, so a reader is never left with a diagram they cannot un-dim.
  // Bound to the window because nothing here is focusable yet, so Escape clears
  // every canvas on the page at once; the keyboard ticket gives the canvas focus
  // and scopes this to it.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, select]);

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
          select(id && id !== selectedId ? id : null);
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

      {selected && !dismissed ? (
        <InspectorCard
          element={selected}
          connectedTo={connectedTo}
          link={fileLinkFor(selected.label, repoFiles)}
          onSelect={(id) => {
            // Picking from the card is a deliberate act, and it ends whatever
            // the pointer was previewing — which is otherwise still the element
            // the reader clicked to open the card in the first place.
            setHoverId(null);
            select(id);
          }}
          onDismiss={() => setDismissed(true)}
        />
      ) : null}

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

/** What the diagram's own language calls the thing the reader picked. */
const KIND_NAME: Record<ElementKind, string> = {
  node: "Node",
  entity: "Entity",
  participant: "Participant",
};

/**
 * The card a selection opens: what was picked, and what it touches.
 *
 * It sits in the corner of the canvas, outside the panning surface — inside it,
 * every click on the card would also read as a click on the space around the
 * drawing, which clears the selection. It is a region rather than a dialog
 * because it takes no focus and blocks nothing: the reader goes on panning,
 * zooming and selecting with it open.
 */
function InspectorCard({
  element,
  connectedTo,
  link,
  onSelect,
  onDismiss,
}: {
  element: AddressableElement;
  connectedTo: AddressableElement[];
  link: RepoFileLink | null;
  onSelect: (id: string) => void;
  onDismiss: () => void;
}) {
  // Where a line of the label is the file, that line *is* the link — never the
  // same path printed once as text and again as a chip underneath it. What is
  // left of the label is the name, which for a path drawn over a function is
  // the function, and for a label that is only a path is nothing at all.
  const name = link
    ? element.label
        .split("\n")
        .filter((line) => line !== link.path)
        .join("\n")
    : element.label;

  return (
    <section
      aria-label="Selected element"
      className="absolute left-2 top-2 z-10 flex max-h-[calc(100%-1rem)] w-52 flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-lg backdrop-blur-sm sm:w-60"
    >
      <div className="flex items-start gap-1 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-faint">
            {KIND_NAME[element.kind]}
          </p>
          {/* Offered only where a line of the label turned out to name a real
              file. Most labels are prose, so most cards carry no link at all. */}
          {link ? (
            <div className={name ? "mb-1" : undefined}>
              <FileChip path={link.path} href={link.href} />
            </div>
          ) : null}
          {name ? (
            <p className="whitespace-pre-line break-words text-[0.83rem] font-semibold leading-snug text-text">
              {name}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-mr-1 shrink-0 rounded p-1 text-faint transition hover:bg-surface-2 hover:text-text"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-3 py-2">
        {connectedTo.length > 0 ? (
          <>
            <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-wider text-faint">
              Connects to
            </p>
            <ul aria-label="Connects to" className="space-y-0.5">
              {connectedTo.map((neighbour) => (
                <li key={neighbour.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(neighbour.id)}
                    className="w-full whitespace-pre-line break-words rounded px-1.5 py-1 text-left text-[0.78rem] leading-snug text-muted transition hover:bg-accent-soft hover:text-accent"
                  >
                    {neighbour.label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[0.78rem] text-faint">
            Nothing else in this diagram connects to it.
          </p>
        )}
      </div>
    </section>
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
