"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Pan and zoom for the viewer's interactive surfaces — the dependency graph and
 * every diagram canvas. One primitive owns the transform, its clamping, fitting
 * to bounds, cursor-anchored wheel zoom, pointer panning, two-finger pinch, and
 * the toolbar chrome, so the surfaces cannot drift apart in the small ways they
 * already had.
 *
 * What stays with the caller is what legitimately differs: the scale limits, the
 * rule for when a wheel gesture zooms, what "reset" means, and everything about
 * selection — one surface draws its own elements, the other is handed an SVG.
 */

export interface Transform {
  x: number;
  y: number;
  k: number;
}

const IDENTITY: Transform = { x: 0, y: 0, k: 1 };

/** One wheel notch. */
const WHEEL_STEP = 1.12;
/** One toolbar button press. */
const BUTTON_STEP = 1.25;
/**
 * Movement under this many pixels still counts as a click, not a drag. Exported
 * because a surface that declines a gesture still has to tell a tap from a
 * travelling press: the inline diagram canvas takes no touch at all, and a tap
 * on it means something different from a finger scrolling the page across it.
 */
export const CLICK_SLOP = 4;

export interface ViewportOptions {
  /** Scale limits. Per-consumer: the surfaces legitimately differ. */
  minScale: number;
  maxScale: number;
  /**
   * Whether this wheel gesture zooms. Omitted means every wheel zooms, which
   * suits a surface that owns its own page; a surface embedded in prose passes
   * a modifier rule so a plain wheel keeps scrolling the page.
   */
  shouldZoomOnWheel?: (event: WheelEvent) => boolean;
}

export interface FitOptions {
  /**
   * Breathing room, in viewport pixels, taken off each axis before fitting —
   * so half of it ends up on each side of the centred content.
   */
  margin?: number;
  /** Ceiling on the fitted scale, so small content is not blown up to fill. */
  maxScale?: number;
}

/** A diagram with no usable viewBox still has to be given a size. */
const FALLBACK_CONTENT = { width: 800, height: 600 };

/**
 * The size a rendered SVG was laid out in, which is what `fitToContent` wants.
 * Read off the `viewBox` attribute rather than `viewBox.baseVal`, so it works
 * the same in a browser and in the jsdom the component tests run in.
 */
export function svgContentSize(svg: SVGSVGElement): {
  width: number;
  height: number;
} {
  const [, , width, height] = (svg.getAttribute("viewBox") ?? "")
    .split(/[\s,]+/)
    .map(Number);
  return {
    width: width > 0 ? width : svg.clientWidth || FALLBACK_CONTENT.width,
    height: height > 0 ? height : svg.clientHeight || FALLBACK_CONTENT.height,
  };
}

/**
 * What to hand `dangerouslySetInnerHTML`, stable while the diagram is.
 *
 * React re-sets `innerHTML` whenever this object changes identity, not when the
 * string it holds does — so a fresh literal every render re-parses the whole
 * drawing on every pan frame, and throws away anything a surface had marked on
 * it. The diagram canvas depends on its marks surviving; see ADR 0003.
 */
export function useInjectedSvg(svg: string) {
  return useMemo(() => ({ __html: svg }), [svg]);
}

export interface Viewport<T extends Element> {
  /**
   * Attach to the element that both defines the viewport rectangle and receives
   * the gestures. The wheel is bound there natively, because React's own
   * `onWheel` is passive and so cannot stop the page scrolling underneath.
   */
  ref: (node: T | null) => void;
  /** The attached element, for a caller that must tell it from its children. */
  element: T | null;
  transform: Transform;
  isPanning: boolean;
  /** A client point in the content's own coordinates under the current transform. */
  toContent: (clientX: number, clientY: number) => { x: number; y: number };
  /** Zoom about a client point, which stays put under the cursor. */
  zoomAtClient: (clientX: number, clientY: number, factor: number) => void;
  /** Zoom about the middle of the viewport. */
  zoomBy: (factor: number) => void;
  /** Back to the untransformed view. */
  reset: () => void;
  /** Scale content of this size to fit, and centre it. */
  fitToContent: (width: number, height: number, options?: FitOptions) => void;
  beginPan: (event: React.PointerEvent) => void;
  updatePan: (event: React.PointerEvent) => void;
  /**
   * Ends one pointer's part in a gesture, reporting whether it travelled once
   * the last of them lifts — a caller that treats a stationary press as a click
   * reads `moved` to tell the two apart, and gets null while fingers remain.
   * Called without an event it ends the whole gesture, which is what a surface
   * that only ever sees one pointer wants.
   */
  endPan: (event?: React.PointerEvent) => { moved: boolean } | null;
}

export function useViewport<T extends Element>(
  options: ViewportOptions,
): Viewport<T> {
  const [element, setElement] = useState<T | null>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [isPanning, setIsPanning] = useState(false);

  // The wheel listener is bound once per element and reads the options at
  // gesture time, so that a caller passing a fresh object (or an inline
  // predicate) every render does not rebind it every render.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const ref = useCallback((node: T | null) => setElement(node), []);

  const zoomAtLocal = useCallback((sx: number, sy: number, factor: number) => {
    setTransform((t) => {
      const { minScale, maxScale } = optionsRef.current;
      const k = Math.min(maxScale, Math.max(minScale, t.k * factor));
      const gx = (sx - t.x) / t.k;
      const gy = (sy - t.y) / t.k;
      return { k, x: sx - gx * k, y: sy - gy * k };
    });
  }, []);

  const toLocal = useCallback(
    (clientX: number, clientY: number) => {
      const rect = element?.getBoundingClientRect();
      return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
    },
    [element],
  );

  const toContent = useCallback(
    (clientX: number, clientY: number) => {
      const point = toLocal(clientX, clientY);
      return {
        x: (point.x - transform.x) / transform.k,
        y: (point.y - transform.y) / transform.k,
      };
    },
    [toLocal, transform],
  );

  const zoomAtClient = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const point = toLocal(clientX, clientY);
      zoomAtLocal(point.x, point.y, factor);
    },
    [toLocal, zoomAtLocal],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      zoomAtLocal(
        (element?.clientWidth ?? 0) / 2,
        (element?.clientHeight ?? 0) / 2,
        factor,
      );
    },
    [element, zoomAtLocal],
  );

  const reset = useCallback(() => setTransform(IDENTITY), []);

  const fitToContent = useCallback(
    (width: number, height: number, fit: FitOptions = {}) => {
      if (!element) return;
      const { minScale, maxScale } = optionsRef.current;
      const margin = fit.margin ?? 0;
      const ceiling = Math.min(maxScale, fit.maxScale ?? Infinity);
      const vw = element.clientWidth;
      const vh = element.clientHeight;
      const k = Math.min(
        ceiling,
        Math.max(
          minScale,
          Math.min((vw - margin) / width, (vh - margin) / height),
        ),
      );
      setTransform({ k, x: (vw - width * k) / 2, y: (vh - height * k) / 2 });
    },
    [element],
  );

  // --- Panning and pinching -----------------------------------------------
  // Every pointer currently pressed on the surface, so a second finger can turn
  // a drag into a pinch and the first can carry on panning when it lifts.
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{ spread: number } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // Read when a pinch hands the gesture back to a single finger, which happens
  // between renders and so cannot use the transform this render closed over.
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  });

  const startPan = useCallback((from: Point, origin: Transform) => {
    panRef.current = {
      startX: from.x,
      startY: from.y,
      origX: origin.x,
      origY: origin.y,
      // A finger that has already been part of a pinch is mid-gesture, so what
      // it does next is never a click on whatever happens to sit under it.
      moved: pinchRef.current !== null,
    };
  }, []);

  const beginPan = useCallback(
    (event: React.PointerEvent) => {
      const pointers = pointersRef.current;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      (event.target as Element).setPointerCapture?.(event.pointerId);

      if (pointers.size === 2) {
        // Two fingers zoom about the point between them, and whatever drag was
        // in flight is over — it is now half of a pinch.
        pinchRef.current = { spread: spreadOf(pointers) };
        if (panRef.current) panRef.current.moved = true;
        return;
      }
      if (pointers.size > 2) return;

      startPan({ x: event.clientX, y: event.clientY }, transform);
      setIsPanning(true);
    },
    [startPan, transform],
  );

  const updatePan = useCallback(
    (event: React.PointerEvent) => {
      const pointers = pointersRef.current;
      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      const pinch = pinchRef.current;
      if (pinch) {
        if (pointers.size < 2) return;
        const spread = spreadOf(pointers);
        if (spread <= 0 || pinch.spread <= 0) return;
        const centre = centreOf(pointers);
        zoomAtClient(centre.x, centre.y, spread / pinch.spread);
        pinch.spread = spread;
        return;
      }

      const pan = panRef.current;
      if (!pan) return;
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      if (Math.abs(dx) > CLICK_SLOP || Math.abs(dy) > CLICK_SLOP) pan.moved = true;
      setTransform((t) => ({ ...t, x: pan.origX + dx, y: pan.origY + dy }));
    },
    [zoomAtClient],
  );

  const endPan = useCallback(
    (event?: React.PointerEvent) => {
      const pointers = pointersRef.current;
      // A caller that lifts without naming a pointer — a mouse-only surface, or
      // the pointer leaving the element — is ending the whole gesture.
      if (event) pointers.delete(event.pointerId);
      else pointers.clear();

      if (pinchRef.current && pointers.size < 2) {
        const [remaining] = pointers.values();
        // One finger left carries on panning from where it is now, not from
        // where the gesture started two fingers ago.
        if (remaining) startPan(remaining, transformRef.current);
        pinchRef.current = null;
      }
      // Still fingers down: the gesture has not ended, so nothing is reported.
      if (pointers.size > 0) return null;

      const pan = panRef.current;
      if (!pan) return null;
      panRef.current = null;
      setIsPanning(false);
      return { moved: pan.moved };
    },
    [startPan],
  );

  // --- Wheel zoom ---------------------------------------------------------
  // Bound natively and non-passively: a wheel that zooms must not also scroll
  // whatever is behind the surface, and React's synthetic wheel cannot say so.
  useEffect(() => {
    if (!element) return;
    // Typed as Event because "wheel" is not in the base Element's event map.
    const onWheel = (e: Event) => {
      const event = e as WheelEvent;
      const { shouldZoomOnWheel } = optionsRef.current;
      if (shouldZoomOnWheel && !shouldZoomOnWheel(event)) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomAtLocal(
        event.clientX - rect.left,
        event.clientY - rect.top,
        event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP,
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [element, zoomAtLocal]);

  return {
    ref,
    element,
    transform,
    isPanning,
    toContent,
    zoomAtClient,
    zoomBy,
    reset,
    fitToContent,
    beginPan,
    updatePan,
    endPan,
  };
}

interface Point {
  x: number;
  y: number;
}

/** How far apart two fingers are, which is what a pinch changes. */
function spreadOf(pointers: Map<number, Point>): number {
  const [a, b] = pointers.values();
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The point a pinch zooms about, which stays put between the two fingers. */
function centreOf(pointers: Map<number, Point>): Point {
  const [a, b] = pointers.values();
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export type ViewportButtonTone = "surface" | "overlay";

/**
 * The zoom/fit toolbar. `tone` picks the surface it sits on — `surface` for a
 * card in the page, `overlay` for dark fullscreen chrome. Orientation also fixes
 * the order, so zoom-in is the top of a column and the right of a row.
 *
 * Only viewport controls live here. Chrome that happens to sit beside them — a
 * close button, say — is the caller's own sibling.
 */
export function ViewportControls({
  zoomBy,
  orientation,
  tone,
  resetVariant,
  onReset,
  className = "",
}: {
  /** The viewport's `zoomBy`. */
  zoomBy: (factor: number) => void;
  orientation: "vertical" | "horizontal";
  tone: ViewportButtonTone;
  /** What returning to the default view is called here, and how it is drawn. */
  resetVariant: ResetVariant;
  onReset: () => void;
  className?: string;
}) {
  const { label, Icon } = RESET_VARIANT[resetVariant];
  const zoomIn = (
    <ViewportButton
      key="in"
      tone={tone}
      label="Zoom in"
      onClick={() => zoomBy(BUTTON_STEP)}
    >
      +
    </ViewportButton>
  );
  const zoomOut = (
    <ViewportButton
      key="out"
      tone={tone}
      label="Zoom out"
      onClick={() => zoomBy(1 / BUTTON_STEP)}
    >
      −
    </ViewportButton>
  );

  return (
    <div
      className={`flex gap-1 ${orientation === "vertical" ? "flex-col" : "items-center"} ${className}`}
    >
      {orientation === "vertical" ? [zoomIn, zoomOut] : [zoomOut, zoomIn]}
      <ViewportButton tone={tone} label={label} onClick={onReset}>
        <Icon />
      </ViewportButton>
    </div>
  );
}

/** What returning to the default view means on a given surface. */
export type ResetVariant = "reset" | "fit";

const RESET_VARIANT: Record<
  ResetVariant,
  { label: string; Icon: () => ReactNode }
> = {
  reset: { label: "Reset view", Icon: ResetIcon },
  fit: { label: "Fit to screen", Icon: FitIcon },
};

const TONE_CLASS: Record<ViewportButtonTone, string> = {
  surface:
    "border border-border bg-surface text-muted shadow-sm transition hover:border-border-strong hover:text-text",
  overlay: "press bg-[#e9edf2]/10 text-[#e9edf2] hover:bg-[#e9edf2]/20",
};

export const ViewportButton = forwardRef<
  HTMLButtonElement,
  {
    children: ReactNode;
    label: string;
    tone: ViewportButtonTone;
    onClick: () => void;
  }
>(function ViewportButton({ children, label, tone, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-base font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </button>
  );
});

function ResetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FitIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
