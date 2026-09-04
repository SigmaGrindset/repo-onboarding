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
  return showRendered(fixture(name), title);
}

async function showRendered(svg: string, title = "How it fits together") {
  // Some tests compare two diagrams, and a canvas is only ever alone on a page.
  cleanup();
  mermaidMocks.render.mockResolvedValue({ svg });
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

  test("a tap selects nothing, because touch belongs to the page", async () => {
    const { canvas } = await showDiagram("sample-0-flowchart");
    const node = elementIn(canvas, "HTTP");

    // A tap arrives as pointerover first, so a preview would flash across the
    // diagram before the press even lands.
    fireEvent.pointerOver(node, { pointerId: 2, pointerType: "touch" });
    fireEvent.pointerDown(node, { pointerId: 2, pointerType: "touch" });
    fireEvent.pointerUp(node, { pointerId: 2, pointerType: "touch" });
    fireEvent.click(node);

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
