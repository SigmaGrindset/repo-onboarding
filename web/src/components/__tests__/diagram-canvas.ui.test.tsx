import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMocks }));

import { Mermaid } from "@/components/Mermaid";

/**
 * The canvas is driven through the component a reader actually meets, with
 * Mermaid replaced by SVG the real Mermaid produced. The fixtures come from
 * `npm run fixtures:diagrams`, which renders this repository's own diagrams in
 * a browser — a hand-written SVG would only prove the canvas can read a shape
 * we invented for it.
 */
const FIXTURE_DIR = join(import.meta.dirname, "fixtures", "diagrams");

/** A wide, short flowchart — smaller than the large viewport used below. */
const SMALL_DIAGRAM = "express-3-flowchart";
/** The tallest diagram in the corpus. */
const TALL_DIAGRAM = "sample-1-er";
/** One whose drawn height lands between the floor and the ceiling. */
const MID_DIAGRAM = "fer-mentor-1-er";
/** A family the canvas has no reader for, so the probe finds nothing. */
const UNMODELLED_DIAGRAM = "unmodelled-family-pie";

function fixture(name: string) {
  return readFileSync(`${FIXTURE_DIR}/${name}.svg`, "utf8");
}

function fixtureNames() {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".svg"))
    .map((file) => file.replace(/\.svg$/, ""));
}

/**
 * jsdom lays nothing out, so the canvas has to be told how wide it is — through
 * the same ResizeObserver it uses in a browser — and how big its own box ends up.
 * Height is reported back from the inline style the canvas set, so the canvas
 * sizing itself is what the fit then works against, exactly as in a browser.
 */
let canvasWidth = 600;

function stubLayout(width: number) {
  canvasWidth = width;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => canvasWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      const box = this.closest<HTMLElement>("[data-diagram-addressable]");
      return Number.parseFloat(box?.style.height ?? "") || 0;
    },
  });
}

class ResizeObserverStub {
  constructor(private readonly notify: ResizeObserverCallback) {}
  observe(target: Element) {
    this.notify(
      [{ contentRect: { width: canvasWidth } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
    void target;
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  stubLayout(600);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

async function showDiagram(name: string, title = "How it fits together") {
  // Some tests compare two diagrams, and a canvas is only ever alone on a page.
  cleanup();
  mermaidMocks.render.mockResolvedValue({ svg: fixture(name) });
  render(<Mermaid source="flowchart TD" title={title} />);
  const drawing = await screen.findByRole("img", { name: title });
  const surface = drawing.parentElement as HTMLElement;
  return { canvas: surface.parentElement as HTMLElement, surface, drawing };
}

/** What the reader is looking at: how far the diagram moved, and how big it is. */
function viewOf(drawing: HTMLElement) {
  const match = /translate\((.+)px, (.+)px\) scale\((.+)\)/.exec(
    drawing.style.transform,
  );
  if (!match) throw new Error(`no transform in "${drawing.style.transform}"`);
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

function wheelOver(surface: HTMLElement, init: WheelEventInit) {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  // The canvas binds the wheel natively, so React does not know it is an event
  // it should flush around — hence act, which fireEvent would have done itself.
  act(() => {
    surface.dispatchEvent(event);
  });
  return event;
}

function dragAcross(surface: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(surface, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(surface, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: 100 + dx,
    clientY: 100 + dy,
  });
  fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "mouse" });
}

describe("a diagram canvas in the page", () => {
  test("presents the diagram inline with its own zoom controls", async () => {
    const { drawing } = await showDiagram(SMALL_DIAGRAM);

    expect(drawing.querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Fit to screen" })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("tells the reader which modifier zooms", async () => {
    await showDiagram(SMALL_DIAGRAM);

    expect(screen.getByText(/Ctrl \+ scroll to zoom/)).toBeVisible();
  });
});

describe("the wheel over a diagram canvas", () => {
  test("a plain wheel is left alone, so the page keeps scrolling", async () => {
    const { surface, drawing } = await showDiagram(SMALL_DIAGRAM);
    const before = viewOf(drawing);

    const event = wheelOver(surface, { deltaY: -120 });

    expect(event.defaultPrevented).toBe(false);
    expect(viewOf(drawing)).toEqual(before);
  });

  test("a held modifier zooms the canvas instead of the page", async () => {
    const { surface, drawing } = await showDiagram(SMALL_DIAGRAM);
    const before = viewOf(drawing);

    const event = wheelOver(surface, { deltaY: -120, ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(viewOf(drawing).scale).toBeGreaterThan(before.scale);
  });

  test("a trackpad pinch zooms, arriving as a modified wheel", async () => {
    const { surface, drawing } = await showDiagram(SMALL_DIAGRAM);
    const before = viewOf(drawing);

    // What a trackpad sends: small deltas, with ctrlKey set by the browser.
    wheelOver(surface, { deltaY: -8, ctrlKey: true });
    expect(viewOf(drawing).scale).toBeGreaterThan(before.scale);

    wheelOver(surface, { deltaY: 8, ctrlKey: true });
    expect(viewOf(drawing).scale).toBeCloseTo(before.scale, 5);
  });

  test("zooming is anchored at the pointer, not at the middle", async () => {
    const atCorner = await showDiagram(SMALL_DIAGRAM);
    wheelOver(atCorner.surface, {
      deltaY: -120,
      ctrlKey: true,
      clientX: 40,
      clientY: 40,
    });
    const zoomedAtCorner = viewOf(atCorner.drawing);

    const atOtherCorner = await showDiagram(SMALL_DIAGRAM);
    wheelOver(atOtherCorner.surface, {
      deltaY: -120,
      ctrlKey: true,
      clientX: 560,
      clientY: 320,
    });
    const zoomedAtOtherCorner = viewOf(atOtherCorner.drawing);

    expect(zoomedAtOtherCorner.scale).toBeCloseTo(zoomedAtCorner.scale, 5);
    expect(zoomedAtOtherCorner.x).not.toBeCloseTo(zoomedAtCorner.x, 1);
    expect(zoomedAtOtherCorner.y).not.toBeCloseTo(zoomedAtCorner.y, 1);
  });
});

describe("moving around a diagram canvas", () => {
  test("dragging pans the diagram", async () => {
    const { surface, drawing } = await showDiagram(SMALL_DIAGRAM);
    const before = viewOf(drawing);

    dragAcross(surface, 60, -25);

    const after = viewOf(drawing);
    expect(after.x).toBeCloseTo(before.x + 60, 5);
    expect(after.y).toBeCloseTo(before.y - 25, 5);
  });

  test("the controls zoom and refit with no modifier held", async () => {
    const { drawing } = await showDiagram(SMALL_DIAGRAM);
    const fitted = viewOf(drawing);

    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(viewOf(drawing).scale).toBeGreaterThan(fitted.scale);

    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(viewOf(drawing).scale).toBeLessThan(fitted.scale);

    await userEvent.click(screen.getByRole("button", { name: "Fit to screen" }));
    expect(viewOf(drawing).scale).toBeCloseTo(fitted.scale, 5);
  });
});

describe("how tall a diagram canvas is", () => {
  test.each(fixtureNames())(
    "%s sits between the floor and the ceiling",
    async (name) => {
      const { canvas } = await showDiagram(name);

      const height = Number.parseFloat(canvas.style.height);
      expect(height).toBeGreaterThanOrEqual(200);
      expect(height).toBeLessThanOrEqual(560);
    },
  );

  test("a short diagram gets a shorter canvas than a tall one", async () => {
    const short = await showDiagram(SMALL_DIAGRAM);
    const shortHeight = Number.parseFloat(short.canvas.style.height);

    const tall = await showDiagram(TALL_DIAGRAM);
    const tallHeight = Number.parseFloat(tall.canvas.style.height);

    expect(shortHeight).toBeLessThan(tallHeight);
  });

  test("a diagram smaller than the canvas keeps its natural size", async () => {
    stubLayout(2000);

    const { drawing } = await showDiagram(SMALL_DIAGRAM);

    expect(viewOf(drawing).scale).toBe(1);
  });

  test("a diagram larger than the canvas arrives fitted into it", async () => {
    const { drawing } = await showDiagram(TALL_DIAGRAM);

    expect(viewOf(drawing).scale).toBeLessThan(1);
  });

  test("the canvas is not padded with empty space around the diagram", async () => {
    const { canvas, drawing } = await showDiagram(MID_DIAGRAM);

    // A wide diagram is scaled down by its width, so a canvas sized to the
    // diagram's natural height would leave most of itself empty.
    const drawnHeight =
      Number.parseFloat(drawing.style.height) * viewOf(drawing).scale;
    const height = Number.parseFloat(canvas.style.height);
    expect(height).toBeGreaterThan(drawnHeight);
    expect(height - drawnHeight).toBeLessThanOrEqual(32);
  });
});

describe("a theme change under a diagram canvas", () => {
  test("keeps the reader where they had zoomed and panned to", async () => {
    const { surface, drawing } = await showDiagram(MID_DIAGRAM);
    const lightRender = drawing.querySelector("svg")?.id;

    wheelOver(surface, {
      deltaY: -120,
      ctrlKey: true,
      clientX: 80,
      clientY: 60,
    });
    dragAcross(surface, 40, 20);
    const moved = viewOf(drawing);

    // A theme change re-renders the diagram into different SVG — a real dark
    // render of the same diagram, at the same size. The canvas must not treat
    // that as a new diagram and refit.
    mermaidMocks.render.mockResolvedValue({
      svg: fixture(`${MID_DIAGRAM}-dark`),
    });
    await act(async () => {
      document.documentElement.dataset.theme = "dark";
    });
    await waitFor(() =>
      expect(drawing.querySelector("svg")?.id).not.toBe(lightRender),
    );

    expect(viewOf(drawing)).toEqual(moved);
  });
});

describe("a diagram the canvas cannot model", () => {
  test("is still a pan and zoom surface, with no selection affordances", async () => {
    const { canvas, surface, drawing } = await showDiagram(UNMODELLED_DIAGRAM);

    expect(canvas.dataset.diagramAddressable).toBe("false");

    const before = viewOf(drawing);
    wheelOver(surface, { deltaY: -120, ctrlKey: true });
    expect(viewOf(drawing).scale).toBeGreaterThan(before.scale);

    dragAcross(surface, 30, 30);
    expect(viewOf(drawing).x).toBeGreaterThan(before.x);
  });

  test.each(["sample-0-flowchart", "sample-1-er", "sample-2-sequence"])(
    "%s exposes addressable elements",
    async (name) => {
      const { canvas } = await showDiagram(name);

      expect(canvas.dataset.diagramAddressable).toBe("true");
    },
  );
});
