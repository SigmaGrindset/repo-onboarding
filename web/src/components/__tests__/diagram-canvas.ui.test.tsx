import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
import type { RepoFileIndex } from "@/lib/repo-files";

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
 * A fullscreen canvas sets no height of its own: it is as tall as the viewport.
 */
let canvasWidth = 600;
const FULLSCREEN_HEIGHT = 700;

function boxHeight(el: Element) {
  const box = el.closest<HTMLElement>("[data-diagram-addressable]");
  if (!box) return 0;
  if (box.closest('[role="dialog"]')) return FULLSCREEN_HEIGHT;
  return Number.parseFloat(box.style.height) || 0;
}

function stubLayout(width: number) {
  canvasWidth = width;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => canvasWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return boxHeight(this);
    },
  });
}

/** Every box a live canvas is watching, so a test can change one and re-report. */
let watched: Array<{ observer: ResizeObserverStub; target: Element }> = [];

class ResizeObserverStub {
  constructor(private readonly notify: ResizeObserverCallback) {}
  observe(target: Element) {
    watched.push({ observer: this, target });
    this.report(target);
  }
  report(target: Element) {
    this.notify(
      [
        {
          contentRect: { width: canvasWidth, height: boxHeight(target) },
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  disconnect() {
    watched = watched.filter((entry) => entry.observer !== this);
  }
  unobserve() {}
}

/** The reader resizing the window, which a canvas hears through its observer. */
function resizeCanvasTo(width: number) {
  canvasWidth = width;
  act(() => {
    for (const { observer, target } of watched) observer.report(target);
  });
}

beforeEach(() => {
  watched = [];
  stubLayout(600);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

async function showDiagram(
  name: string,
  title = "How it fits together",
  repoFiles?: RepoFileIndex,
) {
  return showRendered(fixture(name), title, repoFiles);
}

async function showRendered(
  svg: string,
  title = "How it fits together",
  repoFiles?: RepoFileIndex,
) {
  // Some tests compare two diagrams, and a canvas is only ever alone on a page.
  cleanup();
  mermaidMocks.render.mockResolvedValue({ svg });
  render(<Mermaid source="flowchart TD" title={title} repoFiles={repoFiles} />);
  const drawing = await screen.findByRole("img", { name: title });
  return canvasAround(drawing);
}

/** The three nested boxes a canvas is, found from the drawing inside them. */
function canvasAround(drawing: HTMLElement) {
  const surface = drawing.parentElement as HTMLElement;
  return { canvas: surface.parentElement as HTMLElement, surface, drawing };
}

/**
 * The fullscreen view of a diagram. While it is open the canvas it was promoted
 * from is hidden from the accessibility tree behind it, so a role query finds
 * the one the reader is actually looking at.
 */
function fullscreenCanvas() {
  const dialog = screen.getByRole("dialog");
  return {
    ...canvasAround(within(dialog).getByRole("img")),
    dialog,
  };
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

function dragAcross(target: Element, dx: number, dy: number) {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(target, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: 100 + dx,
    clientY: 100 + dy,
  });
  fireEvent.pointerUp(target, { pointerId: 1, pointerType: "mouse" });
}

/** A finger that arrives, stays put and lifts. A browser follows it with a click. */
function tapOn(target: Element) {
  // A tap arrives as a pointerover first, so a preview would flash across the
  // diagram before the press even lands.
  fireEvent.pointerOver(target, { pointerId: 2, pointerType: "touch" });
  fireEvent.pointerDown(target, {
    pointerId: 2,
    pointerType: "touch",
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerUp(target, {
    pointerId: 2,
    pointerType: "touch",
    clientX: 100,
    clientY: 100,
  });
  fireEvent.click(target);
}

/**
 * A finger travelling across the surface — which in the page is the page
 * scrolling under it. The click at the end is deliberate: a browser suppresses
 * it after a scroll, and the canvas must not need it to, since what the press
 * did is what decides.
 */
function touchDragAcross(target: Element, dx: number, dy: number) {
  fireEvent.pointerDown(target, {
    pointerId: 2,
    pointerType: "touch",
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(target, {
    pointerId: 2,
    pointerType: "touch",
    clientX: 100 + dx,
    clientY: 100 + dy,
  });
  fireEvent.pointerUp(target, {
    pointerId: 2,
    pointerType: "touch",
    clientX: 100 + dx,
    clientY: 100 + dy,
  });
  fireEvent.click(target);
}

/** Two fingers moving from one spread apart to another. */
function pinchOn(target: Element, from: number, to: number) {
  const touch = (pointerId: number, clientX: number) => ({
    pointerId,
    pointerType: "touch",
    clientX,
    clientY: 200,
  });
  fireEvent.pointerDown(target, touch(1, 200));
  fireEvent.pointerDown(target, touch(2, 200 + from));
  fireEvent.pointerMove(target, touch(2, 200 + to));
  fireEvent.pointerUp(target, touch(2, 200 + to));
  fireEvent.pointerUp(target, touch(1, 200));
}

function expandControl() {
  return screen.getByRole("button", { name: /^Expand diagram/ });
}

async function promote() {
  await userEvent.click(expandControl());
  return fullscreenCanvas();
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

  test("a diagram already at natural size is re-centred when the column narrows", async () => {
    // Its canvas is as tall as the diagram is drawn, so a width change that
    // does not change the scale does not change the height either — and a fit
    // that was not redone would leave the diagram centred on a width the canvas
    // no longer has, hanging off the side of it.
    stubLayout(2000);
    const { canvas, drawing } = await showDiagram(SMALL_DIAGRAM);
    const wide = viewOf(drawing);
    const height = canvas.style.height;

    resizeCanvasTo(1600);

    expect(canvas.style.height).toBe(height);
    expect(viewOf(drawing).scale).toBe(wide.scale);
    expect(viewOf(drawing).x).toBeCloseTo(wide.x - 200, 5);
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

  test("keeps the reader's selection, re-applied to the new drawing", async () => {
    const { canvas, drawing } = await showDiagram(MID_DIAGRAM);
    const lightRender = drawing.querySelector("svg")?.id;

    await userEvent.click(elementIn(canvas, "entity-MENTOR-0"));

    mermaidMocks.render.mockResolvedValue({
      svg: fixture(`${MID_DIAGRAM}-dark`),
    });
    await act(async () => {
      document.documentElement.dataset.theme = "dark";
    });
    await waitFor(() =>
      expect(drawing.querySelector("svg")?.id).not.toBe(lightRender),
    );

    // A new drawing, and the selection re-applied to it by element id.
    expect(
      elementIn(canvas, "entity-MENTOR-0").getAttribute(
        "data-diagram-selected",
      ),
    ).toBe("true");
    expect(litElements(canvas)).toEqual([
      "entity-COMMITTEE_MEMBERSHIP-3",
      "entity-MENTOR-0",
      "entity-THESIS-1",
    ]);
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

  test("offers nothing to select, and clicking it does nothing", async () => {
    const { canvas, surface } = await showDiagram(UNMODELLED_DIAGRAM);

    expect(canvas.querySelectorAll("[data-diagram-element]")).toHaveLength(0);

    await userEvent.click(surface);

    expect(litElements(canvas)).toEqual([]);
    expect(dimmedElements(canvas)).toEqual([]);
  });

  test.each(["sample-0-flowchart", "sample-1-er", "sample-2-sequence"])(
    "%s exposes addressable elements",
    async (name) => {
      const { canvas } = await showDiagram(name);

      expect(canvas.dataset.diagramAddressable).toBe("true");
    },
  );
});

/**
 * What the reader sees of a selection: which parts of the drawing stayed lit and
 * which dimmed. The canvas expresses that by marking the SVG it was handed, so
 * that is where the tests read it back from — jsdom paints nothing.
 */
function litElements(canvas: HTMLElement) {
  return marked(canvas, "data-diagram-element", "true");
}

function dimmedElements(canvas: HTMLElement) {
  return marked(canvas, "data-diagram-element", "false");
}

function litConnections(canvas: HTMLElement) {
  return marked(canvas, "data-diagram-connection", "true");
}

/** Every connection the canvas could resolve, whether lit or not. */
function connections(canvas: HTMLElement) {
  return marked(canvas, "data-diagram-connection", null);
}

function marked(canvas: HTMLElement, attribute: string, lit: string | null) {
  const selector =
    lit === null
      ? `[${attribute}]`
      : `[${attribute}][data-diagram-lit="${lit}"]`;
  const ids = [...canvas.querySelectorAll(selector)].map((el) =>
    el.getAttribute(attribute),
  );
  // A connection marks both its path and its label, so identities repeat.
  return [...new Set(ids)].sort();
}

function dimmed(parts: NodeListOf<Element>) {
  return [...parts].filter(
    (part) => part.getAttribute("data-diagram-lit") === "false",
  ).length;
}

function elementIn(canvas: HTMLElement, id: string) {
  const element = canvas.querySelector(`[data-diagram-element="${id}"]`);
  if (!element) throw new Error(`no addressable element "${id}" in this diagram`);
  return element;
}

describe("selecting an element in a diagram canvas", () => {
  test("nothing is dimmed until the reader picks something", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");

    expect(litElements(canvas)).toEqual([]);
    expect(dimmedElements(canvas)).toEqual([]);
  });

  test("clicking a flowchart node lights it and everything one connection away", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");

    await userEvent.click(elementIn(canvas, "HTTP"));

    // HTTP is drawn with an edge to CMD and another to QRY, and nothing else.
    expect(litElements(canvas)).toEqual(["CMD", "HTTP", "QRY"]);
    expect(dimmedElements(canvas)).toEqual([
      "CLI",
      "ENTRY",
      "LEDGER",
      "MONEY",
      "OUTBOX",
      "PORTS",
      "REPO",
    ]);
  });

  test("clicking an ER entity does the same", async () => {
    const { canvas } = await showDiagram("fer-mentor-1-er");

    await userEvent.click(elementIn(canvas, "entity-MENTOR-0"));

    expect(litElements(canvas)).toEqual([
      "entity-COMMITTEE_MEMBERSHIP-3",
      "entity-MENTOR-0",
      "entity-THESIS-1",
    ]);
    expect(dimmedElements(canvas)).toHaveLength(5);
  });

  test("the drawing around the neighbourhood dims with it", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");

    // This diagram groups its boxes into four subgraphs. They belong to no
    // neighbourhood, so they recede with everything else rather than staying
    // bright over a dimmed drawing.
    const frames = canvas.querySelectorAll("[data-diagram-decoration]");
    expect(frames.length).toBeGreaterThan(0);
    expect(dimmed(frames)).toBe(0);

    await userEvent.click(elementIn(canvas, "HTTP"));

    expect(dimmed(frames)).toBe(frames.length);
  });

  test("the connections into the neighbourhood are lit with it", async () => {
    const { canvas } = await showDiagram("fer-mentor-1-er");

    await userEvent.click(elementIn(canvas, "entity-MENTOR-0"));

    // Two of the diagram's seven relationships touch MENTOR.
    expect(connections(canvas)).toHaveLength(7);
    expect(litConnections(canvas)).toHaveLength(2);
  });

  test("hovering previews the highlight without committing a selection", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    const node = elementIn(canvas, "HTTP");

    await userEvent.hover(node);
    expect(litElements(canvas)).toEqual(["CMD", "HTTP", "QRY"]);
    expect(node.getAttribute("data-diagram-selected")).toBeNull();

    await userEvent.unhover(node);
    expect(litElements(canvas)).toEqual([]);
    expect(dimmedElements(canvas)).toEqual([]);
  });
});

describe("clearing a selection", () => {
  test("clicking the selected element again clears it", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    const node = elementIn(canvas, "HTTP");

    await userEvent.click(node);
    await userEvent.click(node);

    expect(node.getAttribute("data-diagram-selected")).toBeNull();
    // The pointer is still on the node, so what stays lit is the preview any
    // hover gives; it goes when the pointer does.
    await userEvent.unhover(node);
    expect(litElements(canvas)).toEqual([]);
    expect(dimmedElements(canvas)).toEqual([]);
  });

  test("clicking the space around the diagram clears it", async () => {
    const { canvas, surface } = await showDiagram("sample-0-flowchart");

    await userEvent.click(elementIn(canvas, "HTTP"));
    await userEvent.click(surface);

    expect(litElements(canvas)).toEqual([]);
  });

  test("Escape clears it", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    const node = elementIn(canvas, "HTTP");

    await userEvent.click(node);
    await userEvent.keyboard("{Escape}");

    expect(node.getAttribute("data-diagram-selected")).toBeNull();
    await userEvent.unhover(node);
    expect(litElements(canvas)).toEqual([]);
  });

  test("dragging from a node pans the diagram instead of selecting it", async () => {
    const { canvas, drawing } = await showDiagram("sample-0-flowchart");
    const before = viewOf(drawing);

    const node = elementIn(canvas, "HTTP");
    dragAcross(node, 80, 40);
    // A browser still delivers the click; what the press did decides.
    fireEvent.click(node);

    expect(viewOf(drawing).x).toBeGreaterThan(before.x);
    expect(litElements(canvas)).toEqual([]);
  });

  test("a tap selects nothing in the page, because touch belongs to it", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    const node = elementIn(canvas, "HTTP");

    tapOn(node);

    expect(litElements(canvas)).toEqual([]);
    expect(dimmedElements(canvas)).toEqual([]);
  });
});

describe("connections between elements whose names contain the joining separator", () => {
  test("an element is still lit with the right neighbours", async () => {
    const { canvas } = await showDiagram("fer-mentor-1-er");

    // COURSE, COURSE_OFFERING and COURSE_EMBEDDING are three entities, and a
    // relationship id joins two of them with the underscore two of them contain.
    await userEvent.click(elementIn(canvas, "entity-COURSE-6"));

    expect(litElements(canvas)).toEqual([
      "entity-COURSE-6",
      "entity-COURSE_EMBEDDING-7",
      "entity-COURSE_OFFERING-5",
    ]);
    expect(litConnections(canvas)).toHaveLength(2);
  });

  test("an entity named with a separator can be selected in its own right", async () => {
    const { canvas } = await showDiagram("fer-mentor-1-er");

    await userEvent.click(elementIn(canvas, "entity-THESIS_EMBEDDING-2"));

    expect(litElements(canvas)).toEqual([
      "entity-THESIS-1",
      "entity-THESIS_EMBEDDING-2",
    ]);
  });

  test("a connection naming an element the diagram does not have is inert", async () => {
    // The one thing a real fixture cannot show: Mermaid always stamps endpoints
    // it drew. One relationship is re-pointed at an entity that is not in this
    // diagram, which is what a changed Mermaid would look like from here.
    const { canvas } = await showRendered(
      fixture("fer-mentor-1-er").replaceAll(
        "id_entity-MENTOR-0_entity-THESIS-1_0",
        "id_entity-MENTOR-0_entity-GHOST-9_0",
      ),
    );

    await userEvent.click(elementIn(canvas, "entity-MENTOR-0"));

    // The unreadable relationship is left out rather than attached to whichever
    // entity its id half-matches, so THESIS dims with everything else.
    expect(connections(canvas)).toHaveLength(6);
    expect(litElements(canvas)).toEqual([
      "entity-COMMITTEE_MEMBERSHIP-3",
      "entity-MENTOR-0",
    ]);
    expect(litConnections(canvas)).toHaveLength(1);
    // Inert means dimmed, not left as the brightest line on a dimmed diagram.
    expect(
      dimmed(canvas.querySelectorAll("[data-diagram-decoration]")),
    ).toBeGreaterThan(0);
  });
});

/**
 * The card a selection opens, or null when the reader has none open. It is a
 * region rather than a dialog: it never takes focus off the canvas, and a
 * reader goes on panning and selecting with it on screen.
 */
function inspectorCard(root: HTMLElement = document.body) {
  return within(root).queryByRole("region", { name: "Selected element" });
}

function openInspectorCard(root?: HTMLElement) {
  const card = inspectorCard(root);
  if (!card) throw new Error("no card is open on this canvas");
  return card;
}

/** What the open card says the selection connects to, in the order it lists them. */
function connectionsListed(root?: HTMLElement) {
  const list = within(openInspectorCard(root)).getByRole("list", {
    name: "Connects to",
  });
  return within(list)
    .getAllByRole("button")
    .map((button) => button.textContent);
}

function connectionListed(name: string, root?: HTMLElement) {
  return within(openInspectorCard(root)).getByRole("button", { name });
}

/**
 * A repository the express diagram's labels can be resolved against. It names
 * some of the files that diagram draws and not others, which is what separates
 * a label that earns a link from one that does not.
 */
const EXPRESS_REPO: RepoFileIndex = {
  paths: ["index.js", "lib/express.js", "lib/application.js", "lib/view.js"],
  repoUrl: "https://github.com/expressjs/express",
  commitSha: "4bd6c1b",
};

async function showExpress() {
  return showDiagram(
    "express-0-flowchart",
    "How it fits together",
    EXPRESS_REPO,
  );
}

describe("the card a selection opens", () => {
  test("names the selected element and what kind of element it is", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    expect(inspectorCard()).toBeNull();

    await userEvent.click(elementIn(canvas, "HTTP"));

    const card = openInspectorCard();
    expect(within(card).getByText("HTTP API (Fastify)")).toBeVisible();
    expect(within(card).getByText("Node")).toBeVisible();
  });

  test("lists the elements the selection connects to", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");

    await userEvent.click(elementIn(canvas, "HTTP"));

    expect(connectionsListed()).toEqual(["command handlers", "query handlers"]);
  });

  test("lists every element around one the whole diagram leans on", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");

    await userEvent.click(elementIn(canvas, "PORTS"));

    expect(connectionsListed()).toEqual([
      "command handlers",
      "query handlers",
      "Postgres repositories",
      "Outbox publisher",
    ]);
  });

  test("names an entity and the entities it relates to", async () => {
    const { canvas } = await showDiagram("fer-mentor-1-er");

    await userEvent.click(elementIn(canvas, "entity-MENTOR-0"));

    const card = openInspectorCard();
    expect(within(card).getByText("MENTOR")).toBeVisible();
    expect(within(card).getByText("Entity")).toBeVisible();
    expect(connectionsListed()).toEqual(["THESIS", "COMMITTEE_MEMBERSHIP"]);
  });

  test("costs the diagram none of the canvas width", async () => {
    const { canvas, drawing } = await showDiagram("sample-0-flowchart");
    const before = viewOf(drawing);

    await userEvent.click(elementIn(canvas, "HTTP"));

    // The card is inside the canvas, over the drawing — not beside it.
    expect(canvas.contains(openInspectorCard())).toBe(true);
    expect(viewOf(drawing)).toEqual(before);
  });
});

describe("walking the diagram from the card", () => {
  test("clicking a listed connection moves the selection there", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    await userEvent.click(elementIn(canvas, "HTTP"));

    await userEvent.click(connectionListed("command handlers"));

    expect(elementIn(canvas, "CMD").getAttribute("data-diagram-selected")).toBe(
      "true",
    );
    expect(litElements(canvas)).toEqual(["CMD", "HTTP", "LEDGER", "PORTS"]);
  });

  test("the card follows the selection it moved", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    await userEvent.click(elementIn(canvas, "HTTP"));

    await userEvent.click(connectionListed("command handlers"));

    const card = openInspectorCard();
    expect(within(card).getByText("command handlers")).toBeVisible();
    expect(connectionsListed()).toEqual([
      "HTTP API (Fastify)",
      "ports (interfaces)",
      "Ledger aggregate",
    ]);
  });
});

describe("dismissing the card", () => {
  test("closes it without clearing the selection", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    await userEvent.click(elementIn(canvas, "HTTP"));

    await userEvent.click(
      within(openInspectorCard()).getByRole("button", { name: "Dismiss" }),
    );

    expect(inspectorCard()).toBeNull();
    expect(elementIn(canvas, "HTTP").getAttribute("data-diagram-selected")).toBe(
      "true",
    );
    expect(litElements(canvas)).toEqual(["CMD", "HTTP", "QRY"]);
  });

  test("does not stop the next selection opening one", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    await userEvent.click(elementIn(canvas, "HTTP"));
    await userEvent.click(
      within(openInspectorCard()).getByRole("button", { name: "Dismiss" }),
    );

    await userEvent.click(elementIn(canvas, "CMD"));

    expect(within(openInspectorCard()).getByText("command handlers")).toBeVisible();
  });

  test("the card closes on its own when the selection clears", async () => {
    const { canvas, surface } = await showDiagram("sample-0-flowchart");
    await userEvent.click(elementIn(canvas, "HTTP"));
    expect(inspectorCard()).not.toBeNull();

    await userEvent.keyboard("{Escape}");
    expect(inspectorCard()).toBeNull();

    await userEvent.click(elementIn(canvas, "HTTP"));
    expect(inspectorCard()).not.toBeNull();

    // Clicking the space around the drawing clears the selection too.
    await userEvent.click(surface);
    expect(inspectorCard()).toBeNull();
  });
});

/**
 * Promotion. A diagram too large for the reading column is opened at the size of
 * the viewport, and what the reader has done to it comes along: the fullscreen
 * view is the same canvas, so moving between the two is a change of size and not
 * a change of tool.
 */
describe("promoting a diagram canvas to fullscreen", () => {
  test("a control on the canvas toolbar opens the fullscreen view", async () => {
    await showDiagram("sample-0-flowchart");
    expect(screen.queryByRole("dialog")).toBeNull();

    const { dialog } = await promote();

    expect(dialog).toHaveAccessibleName("Diagram: How it fits together");
    expect(
      within(dialog).getByRole("button", { name: "Zoom in" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Fit to screen" }),
    ).toBeVisible();
  });

  test("clicking the diagram body selects, and no longer opens it", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");

    await userEvent.click(elementIn(canvas, "HTTP"));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(selectedIn(canvas)).toEqual(["HTTP"]);
  });

  test("carries the selection, the highlight and the card into it", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    await userEvent.click(elementIn(canvas, "HTTP"));

    const { canvas: full, dialog } = await promote();

    expect(selectedIn(full)).toEqual(["HTTP"]);
    expect(litElements(full)).toEqual(["CMD", "HTTP", "QRY"]);
    expect(dimmedElements(full)).toHaveLength(7);
    expect(
      within(openInspectorCard(dialog)).getByText("HTTP API (Fastify)"),
    ).toBeVisible();
    expect(connectionsListed(dialog)).toEqual([
      "command handlers",
      "query handlers",
    ]);
  });

  test("carries what the reader did in it back out to the page", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    const { canvas: full, dialog } = await promote();

    // Walking the diagram in fullscreen — pick one element, then step from its
    // card to the next — is the reading the page should come back to.
    await userEvent.click(elementIn(full, "HTTP"));
    await userEvent.click(connectionListed("command handlers", dialog));
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(selectedIn(canvas)).toEqual(["CMD"]);
    expect(litElements(canvas)).toEqual(["CMD", "HTTP", "LEDGER", "PORTS"]);
    expect(within(openInspectorCard()).getByText("command handlers")).toBeVisible();
  });

  test("carries a dismissed card across too, still holding its selection", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    await userEvent.click(elementIn(canvas, "HTTP"));
    await userEvent.click(
      within(openInspectorCard()).getByRole("button", { name: "Dismiss" }),
    );

    const { canvas: full, dialog } = await promote();

    expect(inspectorCard(dialog)).toBeNull();
    expect(litElements(full)).toEqual(["CMD", "HTTP", "QRY"]);
  });

  test("Escape closes it, keeping the selection and the page's place", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    await userEvent.click(elementIn(canvas, "HTTP"));
    await promote();
    expect(document.body.style.overflow).toBe("hidden");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    // The page scrolls again, and the reader is back on the control they left
    // from rather than at the top of the document.
    expect(document.body.style.overflow).toBe("");
    expect(expandControl()).toHaveFocus();
    // One press left the view; it did not also clear what the reader had picked.
    expect(selectedIn(canvas)).toEqual(["HTTP"]);
    expect(openInspectorCard()).toBeVisible();
  });

  test("keeps the keyboard inside it, as aria-modal says the page is not there", async () => {
    await showDiagram("sample-0-flowchart");
    const { dialog } = await promote();
    const closeControl = within(dialog).getByRole("button", { name: "Close" });

    // The reader arrives on the way out, which is also the last stop in the
    // view — so the next tab comes round to the first rather than walking into
    // the page behind, where the controls cannot be seen.
    expect(closeControl).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "Zoom out" })).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(closeControl).toHaveFocus();
  });

  test("a second Escape then clears the selection, as it does in the page", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    await userEvent.click(elementIn(canvas, "HTTP"));
    await promote();

    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");

    expect(selectedIn(canvas)).toEqual([]);
    expect(inspectorCard()).toBeNull();
  });

  test("names the gestures the fullscreen view has, not the page's", async () => {
    await showDiagram("sample-0-flowchart");
    expect(screen.getByText(/Ctrl \+ scroll to zoom/)).toBeInTheDocument();

    const { dialog } = await promote();

    // No page behind it to keep the wheel for, and a way out that the canvas in
    // the page does not have.
    expect(
      within(dialog).getByText(
        "Click to highlight · scroll to zoom · drag to pan · Esc to close",
      ),
    ).toBeVisible();
  });

  test("the fullscreen view zooms on a plain wheel, having no page behind it", async () => {
    await showDiagram("sample-0-flowchart");
    const { surface, drawing } = await promote();
    const before = viewOf(drawing);

    const event = wheelOver(surface, { deltaY: -120 });

    expect(event.defaultPrevented).toBe(true);
    expect(viewOf(drawing).scale).toBeGreaterThan(before.scale);
  });
});

describe("a diagram canvas met with a finger", () => {
  test("takes no gesture in the page, so the page scrolls through it", async () => {
    const { canvas, surface, drawing } = await showDiagram("sample-0-flowchart");
    const before = viewOf(drawing);

    touchDragAcross(surface, 60, -25);

    // Nothing moved, nothing was picked, and nothing was promoted: the diagram
    // is exactly the picture it used to be while a finger is on the page.
    expect(viewOf(drawing)).toEqual(before);
    expect(litElements(canvas)).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a tap in the page opens the fullscreen view", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");

    tapOn(elementIn(canvas, "HTTP"));

    const { canvas: full } = fullscreenCanvas();
    // The tap opened the view; it did not also pick what it landed on.
    expect(selectedIn(full)).toEqual([]);
    expect(litElements(full)).toEqual([]);
  });

  test("a tap opens it on a diagram with nothing to select, too", async () => {
    const { surface } = await showDiagram(UNMODELLED_DIAGRAM);

    tapOn(surface);

    expect(screen.getByRole("dialog")).toBeVisible();
  });

  test("a finger that travelled was the page scrolling, and opens nothing", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");

    touchDragAcross(elementIn(canvas, "HTTP"), 80, 40);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("in fullscreen a drag pans, because nothing is under it to scroll", async () => {
    await showDiagram("sample-0-flowchart");
    const { canvas: full, surface, drawing } = await promote();
    const before = viewOf(drawing);

    touchDragAcross(surface, 60, -25);

    const after = viewOf(drawing);
    expect(after.x).toBeCloseTo(before.x + 60, 5);
    expect(after.y).toBeCloseTo(before.y - 25, 5);
    // A pan is not a selection, however the drag ends.
    expect(litElements(full)).toEqual([]);
  });

  test("in fullscreen a pinch zooms", async () => {
    await showDiagram("sample-0-flowchart");
    const { surface, drawing } = await promote();
    const before = viewOf(drawing);

    pinchOn(surface, 100, 200);
    expect(viewOf(drawing).scale).toBeCloseTo(before.scale * 2, 5);

    pinchOn(surface, 200, 100);
    expect(viewOf(drawing).scale).toBeCloseTo(before.scale, 5);
  });

  test("in fullscreen a tap selects", async () => {
    await showDiagram("sample-0-flowchart");
    const { canvas: full, dialog } = await promote();

    tapOn(elementIn(full, "HTTP"));

    expect(selectedIn(full)).toEqual(["HTTP"]);
    expect(litElements(full)).toEqual(["CMD", "HTTP", "QRY"]);
    expect(
      within(openInspectorCard(dialog)).getByText("HTTP API (Fastify)"),
    ).toBeVisible();
  });
});

describe("a diagram label that names a file", () => {
  test("is offered as a link to that file", async () => {
    const { canvas } = await showExpress();

    await userEvent.click(elementIn(canvas, "view"));

    const link = within(openInspectorCard()).getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/expressjs/express/blob/4bd6c1b/lib/view.js",
    );
    expect(link.textContent).toContain("lib/view.js");
  });

  test("is still offered when the label carries a second line", async () => {
    const { canvas } = await showExpress();

    // Drawn as "lib/express.js" over "createApplication()". The path is exact,
    // so there is nothing being guessed at.
    await userEvent.click(elementIn(canvas, "express"));

    const card = openInspectorCard();
    expect(within(card).getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/expressjs/express/blob/4bd6c1b/lib/express.js",
    );
    // The line that is the path is the link; what is left of the label is the
    // name. The path is never printed twice.
    expect(within(card).getByText("createApplication()")).toBeVisible();
    expect(card.textContent?.match(/lib\/express\.js/g)).toHaveLength(1);
  });

  test("a bare filename is never matched against a path that ends with it", async () => {
    // Resolving "express.js" against lib/express.js is an inference, not a
    // reading of the drawing, so the card offers nothing.
    const { canvas } = await showRendered(
      fixture("express-0-flowchart").replace(
        ">lib/express.js<br>createApplication()<",
        ">express.js<",
      ),
      "How it fits together",
      EXPRESS_REPO,
    );

    await userEvent.click(elementIn(canvas, "express"));

    const card = openInspectorCard();
    expect(within(card).getByText("express.js")).toBeVisible();
    expect(within(card).queryByRole("link")).toBeNull();
  });

  test("a label that is prose offers no link at all", async () => {
    const { canvas } = await showExpress();

    await userEvent.click(elementIn(canvas, "router"));

    const card = openInspectorCard();
    expect(within(card).getByText("router (npm)")).toBeVisible();
    expect(within(card).queryByRole("link")).toBeNull();
  });

  test("a path the repository does not have offers no link at all", async () => {
    const { canvas } = await showExpress();

    // lib/utils.js is drawn by this diagram but is not among the paths the
    // analysis document names, so the card offers nothing rather than a guess.
    await userEvent.click(elementIn(canvas, "utils"));

    expect(within(openInspectorCard()).queryByRole("link")).toBeNull();
  });

  test("offers no link when there is no repository to link to", async () => {
    const { canvas } = await showDiagram("express-0-flowchart");

    await userEvent.click(elementIn(canvas, "view"));

    expect(within(openInspectorCard()).queryByRole("link")).toBeNull();
  });
});

/**
 * A sequence diagram is read through a grammar of its own: its participants are
 * columns, and its messages are the arrows stacked between them. Both are
 * selectable, because on a drawing where thirteen arrows run between six
 * columns, picking one arrow out is the reading a reader came for.
 */
const SEQUENCE = "sample-2-sequence";

/** The arrow itself, which is what a reader points at to pick a message. */
function messageIn(canvas: HTMLElement, id: string) {
  const arrow = canvas.querySelector(
    `[data-et="message"][data-diagram-connection="${id}"]`,
  );
  if (!arrow) throw new Error(`no message "${id}" in this diagram`);
  return arrow;
}

/** The words the diagram wrote along it, which are part of the same message. */
function messageWordsIn(canvas: HTMLElement, id: string) {
  const text = canvas.querySelector(
    `text[data-diagram-connection="${id}"]`,
  );
  if (!text) throw new Error(`message "${id}" has no words along it`);
  return text;
}

/** What the canvas is showing as picked, rather than merely lit around it. */
function selectedIn(canvas: HTMLElement) {
  const ids = [...canvas.querySelectorAll('[data-diagram-selected="true"]')].map(
    (el) =>
      el.getAttribute("data-diagram-element") ??
      el.getAttribute("data-diagram-connection"),
  );
  return [...new Set(ids)];
}

/** Every part of the drawing the canvas marked as one element. */
function partsOf(canvas: HTMLElement, id: string) {
  return [...canvas.querySelectorAll(`[data-diagram-element="${id}"]`)];
}

function litness(parts: Element[]) {
  return parts.map((part) => part.getAttribute("data-diagram-lit"));
}

describe("selecting a participant in a sequence diagram", () => {
  test("lights every message it sends or receives, and who is at the far end", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    // The client sends the request and is sent the response, and both run to
    // the same participant — so it is lit with the API and nothing else.
    await userEvent.click(elementIn(canvas, "Client"));

    expect(litElements(canvas)).toEqual(["API", "Client"]);
    expect(dimmedElements(canvas)).toEqual(["D", "H", "OB", "Repo"]);
    expect(litConnections(canvas)).toEqual(["i0", "i9"]);
  });

  test("lights all of them for a participant in the middle of the exchange", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    await userEvent.click(elementIn(canvas, "H"));

    expect(litElements(canvas)).toEqual(["API", "D", "H", "Repo"]);
    expect(dimmedElements(canvas)).toEqual(["Client", "OB"]);
    // Eight of the diagram's thirteen messages run through the handler.
    expect(connections(canvas)).toHaveLength(13);
    expect(litConnections(canvas)).toHaveLength(8);
  });

  test("lights the message a participant sends to itself", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    await userEvent.click(elementIn(canvas, "OB"));

    // The outbox worker polls and marks in the repository, and publishes to
    // itself; the self-message lights without a second participant to add.
    expect(litElements(canvas)).toEqual(["OB", "Repo"]);
    expect(litConnections(canvas)).toEqual(["i10", "i11", "i12"]);
  });

  test("lights both drawings of it, at the head and foot of its lifeline", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    // Mermaid draws every participant twice, once at the head of its lifeline
    // and once mirrored at the foot, and stamps identity only on the first.
    // Both are the participant, so a selection has to reach both — including
    // the stick-figure actor, which Mermaid gives no id of any kind.
    expect(partsOf(canvas, "OB")).toHaveLength(2);
    expect(partsOf(canvas, "Client")).toHaveLength(2);

    await userEvent.click(elementIn(canvas, "OB"));

    expect(litness(partsOf(canvas, "OB"))).toEqual(["true", "true"]);
    expect(litness(partsOf(canvas, "Client"))).toEqual(["false", "false"]);
  });

  test("names the participant and what it exchanges messages with", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    await userEvent.click(elementIn(canvas, "Client"));

    const card = openInspectorCard();
    expect(within(card).getByText("Client")).toBeVisible();
    expect(within(card).getByText("Participant")).toBeVisible();
    expect(connectionsListed()).toEqual(["Fastify handler"]);
  });
});

describe("selecting a message in a sequence diagram", () => {
  test("lights the two participants it runs between, and nothing else", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    // The handler calls the domain, and that arrow runs between those two.
    await userEvent.click(messageIn(canvas, "i4"));

    expect(litElements(canvas)).toEqual(["D", "H"]);
    expect(dimmedElements(canvas)).toEqual(["API", "Client", "OB", "Repo"]);
    expect(litConnections(canvas)).toEqual(["i4"]);
    expect(selectedIn(canvas)).toEqual(["i4"]);
  });

  test("a message a participant sends to itself lights that one participant", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    await userEvent.click(messageIn(canvas, "i11"));

    expect(litElements(canvas)).toEqual(["OB"]);
    expect(dimmedElements(canvas)).toEqual(["API", "Client", "D", "H", "Repo"]);
    expect(litConnections(canvas)).toEqual(["i11"]);
  });

  test("the words written along a message pick it too", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    // An arrow is two pixels of stroke; the words beside it are the target a
    // reader actually has, and they belong to the same message.
    await userEvent.click(messageWordsIn(canvas, "i4"));

    expect(selectedIn(canvas)).toEqual(["i4"]);
    expect(litElements(canvas)).toEqual(["D", "H"]);
  });

  test("an arrow carries a wider invisible twin that picks the same message", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    // Two pixels of stroke is not something a reader can hit, so each arrow is
    // shadowed by an unpainted copy of itself with a stroke wide enough to.
    const twin = messageIn(canvas, "i11").nextElementSibling as Element;
    expect(twin.hasAttribute("data-diagram-hit")).toBe(true);

    await userEvent.click(twin);

    expect(selectedIn(canvas)).toEqual(["i11"]);
    expect(litElements(canvas)).toEqual(["OB"]);
    // Being pointed at is all it does: it is never lit, dimmed or drawn, and it
    // says so where Mermaid's own id-scoped rules cannot outrank it.
    expect(twin.hasAttribute("data-diagram-lit")).toBe(false);
    expect(twin.getAttribute("style")).toContain(
      "stroke: transparent !important",
    );
  });

  test("names the message and the participants it runs between", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    await userEvent.click(messageIn(canvas, "i0"));

    const card = openInspectorCard();
    expect(
      within(card).getByText("POST /transfers {from,to,amount}"),
    ).toBeVisible();
    expect(within(card).getByText("Message")).toBeVisible();
    // Sender first, then receiver — the order the message is read in.
    expect(connectionsListed()).toEqual(["Client", "Fastify handler"]);
  });

  test("names a self-message's one participant once, not twice", async () => {
    const { canvas } = await showDiagram(SEQUENCE);

    await userEvent.click(messageIn(canvas, "i11"));

    const card = openInspectorCard();
    expect(within(card).getByText("publish settlement.v1")).toBeVisible();
    expect(connectionsListed()).toEqual(["Outbox worker"]);
  });

  test("walking from the card moves the selection onto a participant", async () => {
    const { canvas } = await showDiagram(SEQUENCE);
    await userEvent.click(messageIn(canvas, "i0"));

    await userEvent.click(connectionListed("Fastify handler"));

    expect(selectedIn(canvas)).toEqual(["API"]);
    expect(litElements(canvas)).toEqual(["API", "Client", "H"]);
  });
});

describe("a sequence diagram clears and survives as the other families do", () => {
  test("hovering a message previews it without committing a selection", async () => {
    const { canvas } = await showDiagram(SEQUENCE);
    const message = messageIn(canvas, "i4");

    await userEvent.hover(message);
    expect(litElements(canvas)).toEqual(["D", "H"]);
    expect(selectedIn(canvas)).toEqual([]);
    expect(inspectorCard()).toBeNull();

    await userEvent.unhover(message);
    expect(litElements(canvas)).toEqual([]);
    expect(dimmedElements(canvas)).toEqual([]);
  });

  test("the same message again, the space around the drawing, or Escape clears", async () => {
    const { canvas, surface } = await showDiagram(SEQUENCE);
    const message = messageIn(canvas, "i4");

    await userEvent.click(message);
    await userEvent.click(message);
    await userEvent.unhover(message);
    expect(litElements(canvas)).toEqual([]);

    await userEvent.click(elementIn(canvas, "OB"));
    await userEvent.click(surface);
    expect(litElements(canvas)).toEqual([]);

    await userEvent.click(elementIn(canvas, "OB"));
    await userEvent.keyboard("{Escape}");
    expect(selectedIn(canvas)).toEqual([]);
    expect(inspectorCard()).toBeNull();
  });

  test("a theme change keeps the selected message, re-applied to the new drawing", async () => {
    const { canvas, drawing } = await showDiagram(SEQUENCE);
    const lightRender = drawing.querySelector("svg")?.id;

    await userEvent.click(messageIn(canvas, "i4"));

    mermaidMocks.render.mockResolvedValue({ svg: fixture(`${SEQUENCE}-dark`) });
    await act(async () => {
      document.documentElement.dataset.theme = "dark";
    });
    await waitFor(() =>
      expect(drawing.querySelector("svg")?.id).not.toBe(lightRender),
    );

    expect(selectedIn(canvas)).toEqual(["i4"]);
    expect(litElements(canvas)).toEqual(["D", "H"]);
  });
});

describe("what a sequence diagram draws besides participants and messages", () => {
  // The express diagram draws a note across two of its participants.
  const NOTED_SEQUENCE = "express-1-sequence";

  test("lifelines and notes are decoration, and dim with everything else", async () => {
    const { canvas } = await showDiagram(NOTED_SEQUENCE);

    const decoration = canvas.querySelectorAll("[data-diagram-decoration]");
    expect(canvas.querySelectorAll('[data-et="life-line"]')).toHaveLength(6);
    expect(canvas.querySelectorAll('[data-et="note"]')).toHaveLength(1);
    expect(dimmed(decoration)).toBe(0);

    await userEvent.click(elementIn(canvas, "Client"));

    expect(dimmed(decoration)).toBe(decoration.length);
  });

  test("clicking a note selects nothing", async () => {
    const { canvas } = await showDiagram(NOTED_SEQUENCE);
    const note = canvas.querySelector('[data-et="note"]') as Element;
    const lifeline = canvas.querySelector('[data-et="life-line"]') as Element;

    expect(note.hasAttribute("data-diagram-selectable")).toBe(false);
    expect(lifeline.hasAttribute("data-diagram-selectable")).toBe(false);

    await userEvent.click(note);

    expect(litElements(canvas)).toEqual([]);
    expect(inspectorCard()).toBeNull();
  });

  test("a message naming a participant the diagram does not have is inert", async () => {
    // Mermaid always stamps endpoints it drew, so this is the one thing a real
    // fixture cannot show: the request re-pointed at a participant nobody drew.
    const { canvas } = await showRendered(
      fixture(SEQUENCE).replace(
        'data-id="i0" data-from="Client" data-to="API"',
        'data-id="i0" data-from="Client" data-to="GHOST"',
      ),
    );

    await userEvent.click(elementIn(canvas, "Client"));

    // Only the response is left running between the client and the API.
    expect(connections(canvas)).toHaveLength(12);
    expect(litConnections(canvas)).toEqual(["i9"]);
    expect(litElements(canvas)).toEqual(["API", "Client"]);
  });
});

/**
 * Every fixture whose diagram the canvas offers selection on. What is not marked
 * as element, connection or decoration keeps its full strength while everything
 * else dims, so the marks have to cover the whole drawing — and a family's
 * grammar can add parts no diagram in this repository happens to draw yet.
 */
const SELECTABLE_FIXTURES = fixtureNames().filter(
  (name) => name !== UNMODELLED_DIAGRAM,
);

/** The tags that put ink on the page. */
const PAINTED = "rect, circle, ellipse, line, polyline, polygon, path, text";

/**
 * An arrowhead, which is painted only where the line it belongs to is drawn and
 * so already carries that line's dimming. Walked by tag, because `closest` does
 * not answer for an SVG tag name in jsdom.
 */
function insideMarker(part: Element) {
  for (let node: Element | null = part; node; node = node.parentElement) {
    const tag = node.tagName.toLowerCase();
    if (tag === "defs" || tag === "marker") return true;
  }
  return false;
}

function unmarkedPaint(canvas: HTMLElement) {
  // The drawing only: the canvas's own zoom controls are icons of ours.
  const drawing = canvas.querySelector(".diagram-canvas") as HTMLElement;
  return [...drawing.querySelectorAll(PAINTED)]
    .filter((part) => !insideMarker(part))
    .filter(
      (part) =>
        !part.closest(
          "[data-diagram-element], [data-diagram-connection], [data-diagram-decoration]",
        ),
    )
    .map((part) => `${part.tagName}.${part.getAttribute("class") ?? ""}`);
}

describe("what a selection dims", () => {
  test.each(SELECTABLE_FIXTURES)(
    "%s has nothing left bright when something is lit",
    async (name) => {
      const { canvas } = await showDiagram(name);

      expect([...new Set(unmarkedPaint(canvas))]).toEqual([]);
    },
  );

  test("a loop, an alternative, an activation and a participant box all dim", async () => {
    // The control structures of the sequence grammar, which no analysis document
    // in this repository draws yet — so this fixture is rendered for them.
    const { canvas } = await showDiagram("sequence-control-structures");

    expect(canvas.querySelectorAll('[data-et="control-structure"]')).toHaveLength(2);
    expect(canvas.querySelectorAll("rect.activation0")).toHaveLength(1);
    expect(canvas.querySelectorAll("rect.rect")).toHaveLength(1);

    const decoration = canvas.querySelectorAll("[data-diagram-decoration]");
    expect(dimmed(decoration)).toBe(0);

    await userEvent.click(elementIn(canvas, "DB"));

    expect(litElements(canvas)).toEqual(["API", "DB"]);
    expect(dimmed(decoration)).toBe(decoration.length);
  });

  test("an unreadable message dims rather than staying the brightest arrow", async () => {
    const { canvas } = await showRendered(
      fixture(SEQUENCE).replace(
        'data-id="i0" data-from="Client" data-to="API"',
        'data-id="i0" data-from="Client" data-to="GHOST"',
      ),
    );

    await userEvent.click(elementIn(canvas, "Client"));

    // The arrow the canvas could not read is left out of every neighbourhood,
    // so it has to recede with the rest and not hang over the drawing.
    const orphan = canvas.querySelector('[data-et="message"][data-id="i0"]');
    expect(orphan?.hasAttribute("data-diagram-connection")).toBe(false);
    expect(orphan?.getAttribute("data-diagram-lit")).toBe("false");
  });
});
