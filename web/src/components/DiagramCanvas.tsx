"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  addressableIn,
  addressablesIn,
  connectedTo,
  deriveDiagramModel,
  markDiagram,
  neighbourhoodOf,
  type Addressable,
  type AddressableElement,
  type ConnectionKind,
  type DiagramFamily,
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
  CLICK_SLOP,
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
 * In a sequence diagram a message is selectable in its own right, because the
 * arrows are that diagram's content rather than decoration between its boxes.
 * The canvas was handed its diagram as a string, so highlighting means marking up
 * the SVG it injected — unlike the dependency graph, which draws its own elements
 * and can style them where it draws them.
 *
 * A selection also opens a card in the corner of the canvas naming what was
 * picked and what it connects to. The card sits over the drawing rather than
 * beside it: the reading column is narrow and the content per element is thin,
 * so a rail would spend a third of the column on four lines of text.
 *
 * A diagram too large for the reading column is promoted to fullscreen from the
 * canvas toolbar, and the fullscreen view is this same component at another
 * size — same selection, same highlighting, same card. Promoting is a change of
 * size, not a change of tool, so the two presentations cannot drift apart.
 *
 * Without a pointer the canvas is a composite widget: one tab stop for the whole
 * diagram, arrow keys moving a cursor between its addressable elements, Enter
 * opening the card, Escape clearing and letting go. A tab stop per element would
 * be technically accessible and practically worse, since the Architecture
 * section stacks several diagrams and one of them alone draws nineteen things a
 * reader can pick.
 *
 * That widget is the same thing a screen reader is given instead of the drawing:
 * a visually hidden outline of the diagram, one entry per addressable element,
 * naming what it is and what it connects to. It is generated from the model the
 * highlighting runs on, so it cannot say anything the drawing does not — and it
 * is the inspector card's reading of every element at once, which is why the
 * words come from the same place the card's do.
 */

/** Scale limits. Wider than the graph's, because diagram text is small. */
const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
/** The canvas is as tall as its diagram between these. */
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 560;
/** Breathing room around the fitted diagram. */
const FIT_MARGIN = 24;
const FULLSCREEN_FIT_MARGIN = 32;
/** The card the fullscreen view draws its diagram on, matching its `p-4`. */
const FULLSCREEN_PAD = 16;
/**
 * How far fullscreen may scale a diagram up. Inline the ceiling is natural size,
 * because a small diagram should look the way it always did; fullscreen is the
 * reader asking for the whole viewport, so a small diagram may grow into it.
 */
const FULLSCREEN_MAX_FIT_SCALE = 2;

/** Where a canvas is being read: in the page, or filling the viewport. */
export type DiagramPresentation = "inline" | "fullscreen";

/**
 * The reader's place in a diagram: what they picked, and whether the card
 * describing it is open.
 *
 * It is held above the canvas because one diagram has two of them — the canvas
 * in the page and the fullscreen view it promotes to, which are mounted at once
 * while the reader is in fullscreen. Sharing this is what makes promoting carry
 * the selection, the highlighting and the card across in both directions.
 */
export interface DiagramSelection {
  id: string | null;
  cardOpen: boolean;
  /** Pick an element, or clear. Always brings its card back with it. */
  select: (id: string | null) => void;
  /** Close the card without giving up the selection it describes. */
  dismissCard: () => void;
  /** After a re-render, keep the selection only if the new drawing holds it. */
  keepIf: (holdsId: (id: string) => boolean) => void;
}

export function useDiagramSelection(): DiagramSelection {
  const [state, setState] = useState<{ id: string | null; cardOpen: boolean }>({
    id: null,
    cardOpen: false,
  });

  // Every way of choosing an element goes through here, because choosing one
  // always brings its card with it, however the reader left the last one.
  const select = useCallback(
    (id: string | null) => setState({ id, cardOpen: id !== null }),
    [],
  );
  // The card is dismissible without giving up the selection it describes, so a
  // reader who wants to see the drawing under it keeps their highlight.
  const dismissCard = useCallback(
    () => setState((current) => ({ ...current, cardOpen: false })),
    [],
  );
  const keepIf = useCallback(
    (holdsId: (id: string) => boolean) =>
      setState((current) =>
        current.id === null || holdsId(current.id)
          ? current
          : { id: null, cardOpen: false },
      ),
    [],
  );

  return useMemo(
    () => ({ ...state, select, dismissCard, keepIf }),
    [state, select, dismissCard, keepIf],
  );
}

export function DiagramCanvas({
  svg,
  title,
  repoFiles,
  selection,
  presentation = "inline",
  promoted = false,
  onExpand,
  onClose,
}: {
  svg: string;
  title?: string;
  /** Where a label that names a file can be resolved and linked. */
  repoFiles?: RepoFileIndex;
  /** Shared with the fullscreen view this canvas promotes to. */
  selection: DiagramSelection;
  presentation?: DiagramPresentation;
  /**
   * Inline only: whether this canvas has been promoted, so a fullscreen view of
   * the same diagram is now in front of it and owns the reader's attention.
   */
  promoted?: boolean;
  /** Inline only: promotes to fullscreen. */
  onExpand?: () => void;
  /** Fullscreen only: returns the reader to the page. */
  onClose?: () => void;
}) {
  const fullscreen = presentation === "fullscreen";
  const { id: selectedId, cardOpen, select, dismissCard, keepIf } = selection;

  const hostRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const html = useInjectedSvg(svg);
  // Both canvases of a promoted diagram are mounted at once, so the outline's
  // entries need identity of their own rather than the elements' own ids.
  const outlineId = useId();
  const [content, setContent] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  // The capability probe. A diagram whose rendered output exposes none of the
  // identity the canvas reads is a pan-and-zoom surface and nothing more.
  const [model, setModel] = useState<DiagramModel | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Where the keyboard is in the diagram, and whether it is here at all. Both
  // are the canvas's own: the cursor is what the pointer's hover is, and it goes
  // when the reader does.
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

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
    // In the page a held modifier only, so a plain wheel keeps scrolling it;
    // trackpad pinch is delivered as a wheel with ctrlKey set, so it lands here
    // too. Fullscreen there is no page behind to scroll, so every wheel zooms:
    // the rule is never to take the primary gesture, not to demand a modifier
    // for its own sake.
    shouldZoomOnWheel: fullscreen
      ? undefined
      : (event) => event.ctrlKey || event.metaKey,
  });

  const selectable = offersSelection(model);
  /** Fullscreen draws the diagram on a card, and its padding is part of it. */
  const pad = fullscreen ? FULLSCREEN_PAD : 0;

  // Measure and probe the drawing once it is in the DOM. Both are redone when a
  // theme change re-renders the diagram.
  useLayoutEffect(() => {
    const svgEl = hostRef.current?.querySelector("svg");
    if (!svgEl) return;
    setContent(svgContentSize(svgEl));

    const derived = deriveDiagramModel(svgEl);
    setModel(derived);
    if (offersSelection(derived)) markDiagram(svgEl, derived);
    // A theme change re-renders the same diagram, so the reader keeps their
    // selection; a different diagram would not hold the element they picked, and
    // a re-render the canvas can no longer offer selection on could not show it
    // — nor let the reader clear it by clicking the drawing.
    keepIf((id) => offersSelection(derived) && holds(derived, id));
    setHoverId(null);
    setCursorId((id) =>
      id !== null && offersSelection(derived) && holds(derived, id) ? id : null,
    );
  }, [svg, keepIf]);

  // Hover previews a selection without committing to one, exactly as the
  // dependency graph does — and the keyboard cursor is the same preview for a
  // reader who has no pointer to hover with.
  const activeId = hoverId ?? cursorId ?? selectedId;
  const lit = useMemo<Neighbourhood | null>(
    () => (model && activeId ? neighbourhoodOf(model, activeId) : null),
    [model, activeId],
  );

  useLayoutEffect(() => {
    const svgEl = hostRef.current?.querySelector("svg");
    if (svgEl) paintHighlight(svgEl, lit, selectedId, cursorId);
  }, [svg, lit, selectedId, cursorId]);

  // What the card says. Read off the selection alone, never the hover or the
  // cursor: a card that followed either would flicker through the diagram on the
  // way to what the reader actually meant.
  const selected = useMemo(
    () => (model && selectedId ? addressableIn(model, selectedId) : null),
    [model, selectedId],
  );
  const connections = useMemo(
    () => (model && selectedId ? connectedTo(model, selectedId) : []),
    [model, selectedId],
  );

  // The diagram as text: every addressable element, what it is, and what it
  // connects to. The same reading the card gives one element at a time, which is
  // what keeps the two from telling a reader different things.
  const outline = useMemo(() => {
    if (!offersSelection(model)) return [];
    return addressablesIn(model).map((subject, index) => ({
      id: subject.id,
      domId: `${outlineId}-${index}`,
      text: outlineEntry(subject, connectedTo(model, subject.id)),
    }));
  }, [model, outlineId]);
  const cursor = outline.find((entry) => entry.id === cursorId);

  /**
   * The canvas's own keys, which it takes only while the reader is standing on
   * it. Arrows move the cursor, Enter opens the card on whatever it is over, and
   * Escape gives up both the selection and the canvas — so a reader who came in
   * with Tab is never held here by a widget that answers to the arrow keys.
   *
   * Escape stops here rather than carrying on to the window handler below, which
   * is for a canvas nobody is standing on: in fullscreen that one leaves the
   * view, and one press must not both let go of the diagram and close it.
   */
  const onCanvasKey = (event: React.KeyboardEvent<HTMLElement>) => {
    const step = CURSOR_KEY[event.key];
    if (!step && event.key !== "Enter" && event.key !== "Escape") return;
    // The keyboard is driving now, so whatever the pointer was left parked over
    // gives up its preview — a stationary pointer must not outrank the cursor.
    setHoverId(null);

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setCursorId(null);
      select(null);
      event.currentTarget.blur();
      return;
    }

    // Wherever the reader last was: the cursor, or failing that whatever they
    // had already picked, so arriving on a diagram mid-reading carries on from
    // where the pointer left off.
    const from = cursorId ?? selectedId;
    if (event.key === "Enter") {
      if (!from) return;
      event.preventDefault();
      select(from);
      return;
    }

    if (outline.length === 0) return;
    // Or the page would scroll away underneath the diagram being read.
    event.preventDefault();
    const at = outline.findIndex((entry) => entry.id === from);
    setCursorId(outline[step(at, outline.length)].id);
  };

  // Escape clears the selection in the page, and leaves the fullscreen view —
  // which keeps its selection, so the reader comes back to where they were with
  // their place in the diagram intact. A promoted canvas sits behind a
  // fullscreen one and takes no keys, or one press would do both at once.
  //
  // Bound to the window, so it answers for a canvas the reader is looking at
  // rather than standing on. A canvas with focus has already handled the press.
  useEffect(() => {
    if (promoted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (fullscreen) onClose?.();
      else if (selectedId) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promoted, fullscreen, onClose, selectedId, select]);

  // Fullscreen is modal: the page behind it holds its scroll position rather
  // than scrolling under the overlay, and the reader arrives on the control that
  // takes them back out.
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  // How big the canvas is. Inline, only the width is used: the height is
  // computed from it below, so sizing from both would be reading our own output.
  useLayoutEffect(() => {
    if (!viewportEl) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Same box, same object: the fit is keyed off this, and a fresh one every
      // notification would re-render the whole drawing for nothing.
      setAvailable((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(viewportEl);
    return () => observer.disconnect();
  }, [viewportEl]);

  // How tall the diagram will actually be drawn. Sizing the canvas to the
  // diagram's natural height instead would leave a wide, short diagram sitting
  // in a band of empty space, since it is its width that forces the scale down.
  // Fullscreen there is nothing to compute: the view is as tall as the viewport.
  const drawn = content
    ? content.height * arrivalScale(content, available.width) + FIT_MARGIN
    : 0;
  const height = content
    ? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, drawn))
    : MIN_HEIGHT;

  const fit = useCallback(() => {
    if (!content) return;
    fitToContent(content.width + pad * 2, content.height + pad * 2, {
      margin: fullscreen ? FULLSCREEN_FIT_MARGIN : FIT_MARGIN,
      // Inline, never above natural size: a three-box diagram should not be
      // blown up to fill the canvas, it should look the way it always did.
      maxScale: fullscreen ? FULLSCREEN_MAX_FIT_SCALE : 1,
    });
  }, [content, fitToContent, fullscreen, pad]);

  // Fit on arrival, and again when the canvas changes size. Deliberately not on
  // every re-measure: a theme change re-renders the same diagram, and refitting
  // there would throw away wherever the reader had zoomed and panned to.
  //
  // The measured width is part of what "changed size" means even inline, where
  // the height is computed rather than measured: a diagram already at its
  // natural size, or one whose canvas is clamped at the floor or the ceiling,
  // keeps the same height through a narrowing window — and a fit that is never
  // redone leaves it centred on a width the canvas no longer has, hanging off
  // the side of it.
  const box = fullscreen
    ? `${available.width}x${available.height}`
    : `${available.width}x${height}`;
  const shape = content ? `${content.width}x${content.height}@${box}` : null;
  const fittedShape = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!shape || fittedShape.current === shape) return;
    fittedShape.current = shape;
    fit();
  }, [shape, fit]);

  // A press that travelled was a pan, not a click on whatever sat under it. In
  // the page a finger is not a gesture the canvas takes at all — it belongs to
  // the page, which scrolls through the diagram exactly as it did when this was
  // a picture — so a touch press only records where it began, and a tap that
  // stayed put promotes to fullscreen. There, nothing is underneath to compete,
  // so a finger pans, pinches and selects like any other pointer.
  const pressRef = useRef({ dragged: false, touch: false, x: 0, y: 0 });

  const onPointerDown = (event: React.PointerEvent) => {
    const touch = event.pointerType === "touch";
    pressRef.current = {
      dragged: false,
      touch,
      x: event.clientX,
      y: event.clientY,
    };
    if (!touch || fullscreen) beginPan(event);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const press = pressRef.current;
    if (press.touch && !fullscreen) {
      // The page is scrolling under the finger; all the canvas needs to know is
      // that what happens next is not a tap.
      if (
        Math.abs(event.clientX - press.x) > CLICK_SLOP ||
        Math.abs(event.clientY - press.y) > CLICK_SLOP
      ) {
        press.dragged = true;
      }
      return;
    }
    updatePan(event);
  };

  const finishPress = (event: React.PointerEvent) => {
    const pan = endPan(event);
    // Null while other fingers are still down, or when the press was never a
    // gesture this canvas took — neither of which says anything about a click.
    if (pan) pressRef.current.dragged = pan.moved;
  };

  const zoomControls = (
    <ViewportControls
      zoomBy={zoomBy}
      orientation={fullscreen ? "horizontal" : "vertical"}
      tone={fullscreen ? "overlay" : "surface"}
      resetVariant="fit"
      onReset={fit}
    />
  );

  const canvas = (
    <div
      // The capability probe's own answer: whether this diagram exposes any
      // identity at all. Offering selection on top of that also needs
      // connections, which is what `selectable` says.
      data-diagram-addressable={model !== null}
      className={`${
        fullscreen
          ? "group relative min-h-0 flex-1 overflow-hidden"
          : "group relative overflow-hidden rounded-md border border-border bg-surface"
      } ${
        // The focus ring belongs to the canvas rather than to the outline that
        // holds the focus, because the canvas is what the reader is standing on
        // and the outline is a millimetre of clipped text.
        focused ? "outline-2 outline-offset-2 outline-accent" : ""
      }`}
      style={fullscreen ? undefined : { height }}
      // A promoted canvas is behind a fullscreen view of the same diagram, so it
      // is out of reach and out of the accessibility tree until it comes back.
      aria-hidden={promoted || undefined}
      inert={promoted}
    >
      <div
        ref={viewportRef}
        className={`absolute inset-0 select-none overflow-hidden ${
          // Inline, the page keeps every touch gesture it had. Fullscreen the
          // canvas takes them, because there is no page left to take them from.
          fullscreen ? "touch-none" : ""
        }`}
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPress}
        // A gesture the browser takes away — a system swipe, a call arriving —
        // ends here too, or the pointer it never lifted would still be counted
        // against the next one and turn a plain press into half a pinch.
        onPointerCancel={finishPress}
        onPointerOver={(event) => {
          // A tap arrives as a pointerover first, so previewing on touch would
          // flash a highlight across the diagram before the press even lands.
          if (event.pointerType === "touch" || !selectable || isPanning) return;
          setHoverId(selectableIdAt(event.target));
        }}
        onPointerLeave={(event) => {
          finishPress(event);
          setHoverId(null);
        }}
        onClick={(event) => {
          const { dragged, touch } = pressRef.current;
          if (dragged) return;
          // A tap in the page promotes rather than selects: the inline canvas
          // takes no gestures on touch, and fullscreen is where a finger can
          // pinch, pan and pick with nothing underneath competing for it.
          if (touch && !fullscreen) {
            onExpand?.();
            return;
          }
          if (!selectable) return;
          // The same element again, or the space around the drawing, clears.
          const id = selectableIdAt(event.target);
          select(id && id !== selectedId ? id : null);
        }}
      >
        <div
          ref={hostRef}
          // A diagram the canvas can read is presented as its outline below; the
          // drawing itself would only add an image with nothing in it. One it
          // cannot read has no outline to offer, so it keeps the labelled image
          // it has always been.
          {...(selectable
            ? { "aria-hidden": true }
            : { role: "img", "aria-label": title ?? "Diagram" })}
          className={`diagram-canvas absolute left-0 top-0 origin-top-left ${
            fullscreen ? "rounded-lg bg-surface p-4 shadow-2xl" : ""
          }`}
          style={{
            width: content ? content.width + pad * 2 : undefined,
            height: content ? content.height + pad * 2 : undefined,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
            visibility: content ? "visible" : "hidden",
          }}
          dangerouslySetInnerHTML={html}
        />
      </div>

      {/* The diagram, in the two forms that are not the drawing: the canvas's
          one tab stop, and the outline a screen reader reads. It sits before the
          card and the toolbar so that a reader arrives at the diagram itself
          first, and only then at the things arranged around it. */}
      {outline.length > 0 ? (
        <ul
          role="listbox"
          aria-label={outlineLabel(model, title)}
          aria-activedescendant={cursor?.domId}
          tabIndex={0}
          className="sr-only"
          onKeyDown={onCanvasKey}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            // The cursor is where the keyboard is, so it goes with the keyboard
            // — leaving whatever the reader had actually picked still lit.
            setCursorId(null);
          }}
        >
          {outline.map((entry) => (
            <li
              key={entry.domId}
              id={entry.domId}
              role="option"
              aria-selected={entry.id === selectedId}
            >
              {entry.text}
            </li>
          ))}
        </ul>
      ) : null}

      {selected && cardOpen ? (
        <InspectorCard
          subject={selected}
          connectedTo={connections}
          link={fileLinkFor(selected.label, repoFiles)}
          onSelect={(id) => {
            // Picking from the card is a deliberate act, and it ends whatever
            // the pointer was previewing — which is otherwise still the element
            // the reader clicked to open the card in the first place.
            setHoverId(null);
            select(id);
          }}
          onDismiss={dismissCard}
        />
      ) : null}

      {fullscreen ? null : (
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          {zoomControls}
          <ViewportButton
            tone="surface"
            label={`Expand diagram${title ? `: ${title}` : ""}`}
            onClick={() => onExpand?.()}
          >
            <ExpandIcon />
          </ViewportButton>
        </div>
      )}

      {/* The canvas is sized to its diagram, so a hint pinned over it would
          cover the drawing while the reader is reading. Inline it appears when
          the pointer is on the canvas — which is exactly when the wheel matters
          — and fullscreen there is room for it to simply stay. */}
      <p
        className={
          fullscreen
            ? "pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0f1216]/70 px-3 py-1 text-[0.7rem] text-[#e9edf2]/75"
            : "pointer-events-none absolute bottom-2 left-2 rounded-full border border-border bg-surface/85 px-2.5 py-1 text-[0.7rem] text-faint opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
        }
      >
        {gestureHint(fullscreen, selectable, focused)}
      </p>
    </div>
  );

  if (!fullscreen) return canvas;

  // The same canvas, filling the viewport. Its chrome moves to a bar above the
  // drawing, where a title and a way out have somewhere to live.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Diagram: ${title}` : "Diagram"}
      className="fixed inset-0 z-50 flex flex-col bg-[#0f1216]/80 backdrop-blur-sm"
      onKeyDown={keepTabInside}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0 truncate text-sm font-medium text-[#e9edf2]/90">
          {title ?? "Diagram"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {zoomControls}
          <ViewportButton
            tone="overlay"
            label="Close"
            onClick={() => onClose?.()}
            ref={closeRef}
          >
            <CloseIcon />
          </ViewportButton>
        </div>
      </div>
      {canvas}
    </div>,
    document.body,
  );
}

/**
 * Keeps Tab inside the fullscreen view. `aria-modal` has already told a screen
 * reader that the rest of the page is not there, so letting the keyboard walk
 * out into it would leave the reader operating controls behind the overlay —
 * other diagrams' toolbars among them. Only the boundary of the view is settled
 * here; inside it the canvas answers for its own keys.
 */
function keepTabInside(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
    'button, a[href], [tabindex]:not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first) return;

  const active = document.activeElement;
  const leaving = event.shiftKey ? first : last;
  // Anywhere outside counts as leaving too: with focus on the page behind, the
  // next Tab would carry on through it rather than coming back in.
  if (active !== leaving && event.currentTarget.contains(active)) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}

/** What the diagram's own language calls the thing the reader picked. */
const KIND_NAME: Record<ElementKind | ConnectionKind, string> = {
  node: "Node",
  entity: "Entity",
  participant: "Participant",
  message: "Message",
  edge: "Connection",
};

/** Whether this diagram still holds what the reader had picked. */
function holds(model: DiagramModel, id: string): boolean {
  return addressableIn(model, id) !== null;
}

/**
 * What the diagram is called where it has no drawing to show for itself. Its
 * family is part of the name, because a reader who cannot see a sequence diagram
 * has no other way of knowing to expect messages in it.
 */
const FAMILY_NAME: Record<DiagramFamily, string> = {
  flowchart: "flowchart diagram",
  er: "entity relationship diagram",
  sequence: "sequence diagram",
};

function outlineLabel(model: DiagramModel | null, title?: string): string {
  const family = model ? FAMILY_NAME[model.family] : "diagram";
  return title ? `${title}, ${family}` : family;
}

/**
 * One entry of the outline: what an element is, and what it connects to. It says
 * exactly what the card says about the same element, in the order the card says
 * it — the outline is that reading of the whole diagram at once, and a second
 * wording would be a second answer to the same question.
 *
 * The punctuation is load-bearing, because a diagram label is not a word. A
 * label the diagram drew over two lines is read as one, since a screen reader
 * has no lines — and a label that is a file path over a function name then holds
 * a comma of its own, so the elements of a list are separated by something
 * stronger, and each part of the entry is a sentence. Only a message can be
 * unlabelled, and it is named by what it is rather than by an empty pause.
 */
function outlineEntry(
  subject: Addressable,
  connections: AddressableElement[],
): string {
  const to = connections.map((element) => oneLine(element.label)).join("; ");
  return [
    oneLine(subject.label),
    KIND_NAME[subject.kind],
    to ? `Connects to ${to}` : "Connects to nothing else in this diagram",
  ]
    .filter(Boolean)
    .map((sentence) => `${sentence}.`)
    .join(" ");
}

function oneLine(label: string): string {
  return label.split("\n").join(", ");
}

/**
 * Where each key takes the cursor. Both axes move it the same way, along the
 * order the diagram drew its elements in: the drawing's own geometry is not in
 * the model, and a cursor that guessed at "the box to the right" from label
 * order would be wrong in a way the reader could not predict.
 *
 * Arriving from nowhere lands on the near end of the diagram in the direction of
 * travel, and the ends do not wrap: a reader always knows where they are.
 */
// `at` is -1 when the reader has not been anywhere yet, so forwards from nowhere
// is the first element and backwards from nowhere is the last.
type CursorStep = (at: number, count: number) => number;
const onwards: CursorStep = (at, count) => Math.min(at + 1, count - 1);
const backwards: CursorStep = (at, count) =>
  at < 0 ? count - 1 : Math.max(at - 1, 0);

const CURSOR_KEY: Record<string, CursorStep> = {
  ArrowDown: onwards,
  ArrowRight: onwards,
  ArrowUp: backwards,
  ArrowLeft: backwards,
  Home: () => 0,
  End: (_at, count) => count - 1,
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
  subject,
  connectedTo,
  link,
  onSelect,
  onDismiss,
}: {
  subject: Addressable;
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
    ? subject.label
        .split("\n")
        .filter((line) => line !== link.path)
        .join("\n")
    : subject.label;

  return (
    <section
      aria-label="Selected element"
      className="absolute left-2 top-2 z-10 flex max-h-[calc(100%-1rem)] w-52 flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-lg backdrop-blur-sm sm:w-60"
    >
      <div className="flex items-start gap-1 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-faint">
            {KIND_NAME[subject.kind]}
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
 * affordances at all rather than half of them — which would be a flowchart after
 * a Mermaid upgrade that moved only the edge identity. That degradation matches
 * the probe's: total and silent, never a half-interactive state.
 */
function offersSelection(model: DiagramModel | null): model is DiagramModel {
  return (model?.connections.length ?? 0) > 0;
}

/**
 * What the reader is pointing at, if anything: an element, or in a family whose
 * connections are selectable, a connection. A diagram's parts nest — a label
 * inside a foreign object inside the node's own group — so the answer is the
 * nearest marked ancestor of whatever the pointer landed on.
 */
function selectableIdAt(target: EventTarget | null): string | null {
  const marked =
    target instanceof Element
      ? target.closest("[data-diagram-selectable]")
      : null;
  if (!marked) return null;
  return (
    marked.getAttribute("data-diagram-element") ??
    marked.getAttribute("data-diagram-connection")
  );
}

/**
 * Lights the neighbourhood and dims the remainder. With nothing active the marks
 * come off entirely, so an untouched diagram carries no highlight styling at all.
 */
function paintHighlight(
  svg: SVGSVGElement,
  lit: Neighbourhood | null,
  selectedId: string | null,
  cursorId: string | null,
) {
  for (const node of svg.querySelectorAll("[data-diagram-element]")) {
    const id = node.getAttribute("data-diagram-element");
    setOrRemove(node, "data-diagram-lit", inside(lit?.elements, id));
    setOrRemove(node, "data-diagram-selected", id === selectedId ? "true" : null);
    // Where the keyboard is, which is a different thing from what it picked:
    // the reader has to be able to see where the next arrow key will take them.
    setOrRemove(node, "data-diagram-cursor", id === cursorId ? "true" : null);
  }
  for (const edge of svg.querySelectorAll("[data-diagram-connection]")) {
    // A message arrow's invisible twin is there to be pointed at, not seen.
    if (edge.hasAttribute("data-diagram-hit")) continue;
    const id = edge.getAttribute("data-diagram-connection");
    setOrRemove(edge, "data-diagram-lit", inside(lit?.connections, id));
    // A message can be the selection itself, not only part of one.
    setOrRemove(edge, "data-diagram-selected", id === selectedId ? "true" : null);
    setOrRemove(edge, "data-diagram-cursor", id === cursorId ? "true" : null);
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
 * What the canvas can honestly tell a reader about its gestures. Both halves of
 * that differ: fullscreen has no page behind it to keep the wheel for, and a
 * reader holding a phone has no wheel, no modifier key and no Escape.
 *
 * A reader standing on the canvas is told about the keys instead. Nothing about
 * the canvas announces that the arrow keys do anything, and the hint is already
 * shown while it has focus.
 */
function gestureHint(
  fullscreen: boolean,
  selectable: boolean,
  focused: boolean,
) {
  if (focused) return "Arrow keys to move · Enter for details · Esc to clear";
  const touch = readsWithAFinger();
  const picking = selectable
    ? touch
      ? "Tap to highlight"
      : "Click to highlight"
    : null;
  const moving = fullscreen
    ? touch
      ? "pinch to zoom · drag to pan"
      : "scroll to zoom · drag to pan · Esc to close"
    : `${zoomModifierLabel()} + scroll to zoom · drag to pan`;
  return [picking, moving].filter(Boolean).join(" · ");
}

/**
 * Whether the reader's primary pointer is a finger. In the page that changes
 * nothing — the canvas takes no touch there and the hint is revealed by a hover
 * nobody has — but fullscreen is where a phone reader does everything, so the
 * gestures named there had better be the ones they have.
 */
function readsWithAFinger() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
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

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
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
