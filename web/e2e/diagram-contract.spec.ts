import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { waitForPageReady } from "./helpers";

/**
 * What Mermaid stamps on the diagrams it draws, asserted against the real
 * library in a real browser.
 *
 * Every other test of the diagram canvas runs against committed SVG fixtures,
 * and a fixture is a photograph of the Mermaid that produced it. After an
 * upgrade moves the identity the canvas reads, those tests keep passing serenely
 * while every architecture diagram quietly becomes the picture it used to be.
 * The capability probe makes that degradation graceful; this spec is what makes
 * it noticed, so it must never be handed a fixture.
 *
 * It restates the contract rather than importing it, and that duplication is the
 * point: a spec that reached into `diagram-model.ts` for the selectors would
 * move with them and assert nothing. Read it against the table in the ADR, not
 * against the module.
 *
 * It is thin on purpose, and asserts the rows the canvas cannot do without —
 * element identity, and the connection endpoints that resolve against it, for
 * each of the three families this repository draws — plus one live selection
 * proving the model derived from them still reaches the drawing. Labels and the
 * decoration list are left out: those rows are caught by the component suite
 * when the fixtures are regenerated, whereas identity that moves leaves the
 * canvas with nothing to say at all.
 *
 * The contract is recorded in
 * docs/adr/0003-diagram-interaction-derived-from-rendered-output.md and read in
 * web/src/lib/diagram-model.ts. The expectations below are the Architecture
 * section of `data/sample/analysis.json`, so a failure means either that
 * Mermaid's output moved or that that document did.
 */

const ARCHITECTURE = "/analysis/sample/architecture";
const ADR = "docs/adr/0003-diagram-interaction-derived-from-rendered-output.md";

// The contract is a fact about the rendered output, which does not vary with the
// viewport. One project asserts it; the mobile project has its own concerns.
test.skip(
  ({ isMobile }) => Boolean(isMobile),
  "the rendered contract is the same at every viewport",
);

// Every test here reads the same page: the Architecture section draws one
// diagram of each family, through the real Mermaid, in the browser under test.
test.beforeEach(async ({ page }) => {
  await page.goto(ARCHITECTURE);
  await waitForPageReady(page, ARCHITECTURE);
});

/**
 * A family that draws its elements as `g.node` groups carrying identity in `id`,
 * and stamps both ends of a connection into an id of its own. Flowchart and ER
 * share a reader in `diagram-model.ts` for exactly that reason, so they share a
 * test here. The row is what differs between them; the prose is written out per
 * family rather than composed, because a failure should read like the line of
 * the ADR's table that it names.
 */
interface NodeFamily {
  /** What Mermaid writes as the `aria-roledescription` of the root it drew. */
  roledescription: string;
  /** How the test naming this family reads. */
  title: string;
  /** What opens a stripped element id, ahead of the identity and the counter. */
  elementPrefix: string;
  /** What opens the id stamped on a connection. */
  edgePrefix: string;
  /**
   * How a connection names one of these elements. A flowchart edge names the
   * key inside the id — but an ER edge, counter to what intuition reaches for,
   * embeds the whole stripped id, layout counter and all.
   */
  addressOf: (element: DrawnElement) => string;
  /**
   * What `data/sample/analysis.json` draws, written out rather than derived so
   * that a failure compares two readable lists. Sorted, because the order
   * Mermaid draws them in is its own business, not something the canvas reads.
   */
  elements: string[];
  edges: string[];
  /** What each assertion says has moved, in the words of the ADR's table. */
  moved: {
    noElements: string;
    noPrefix: string;
    identity: string;
    edgesDrawn: string;
    edgeIdentity: string;
  };
}

const FLOWCHART: NodeFamily = {
  roledescription: "flowchart-v2",
  title: "a flowchart stamps node identity and edges that resolve to it",
  elementPrefix: "flowchart",
  edgePrefix: "L_",
  addressOf: ({ name }) => name,
  elements: [
    "CLI",
    "CMD",
    "ENTRY",
    "HTTP",
    "LEDGER",
    "MONEY",
    "OUTBOX",
    "PORTS",
    "QRY",
    "REPO",
  ],
  edges: [
    "CLI → REPO",
    "CMD → LEDGER",
    "CMD → PORTS",
    "ENTRY → MONEY",
    "HTTP → CMD",
    "HTTP → QRY",
    "LEDGER → ENTRY",
    "OUTBOX → PORTS",
    "QRY → PORTS",
    "REPO → PORTS",
  ],
  moved: {
    noElements:
      "a flowchart no longer draws its nodes as `g.node` groups with an `id`",
    noPrefix:
      "a flowchart node id no longer opens with the render id Mermaid was given",
    identity:
      'a flowchart node id is no longer "<renderId>-flowchart-<key>-<n>"',
    edgesDrawn:
      'a flowchart edge is no longer a `path` carrying `data-et="edge"`',
    edgeIdentity:
      'a flowchart edge id is no longer "L_<from>_<to>_<n>" naming two of its own nodes',
  },
};

/**
 * `JOURNAL_ENTRY` is the reason a connection's ends are resolved against the
 * identities the diagram actually drew: its name carries the very separator an
 * edge id joins two of them with, so splitting on the first one would read the
 * edge as running from an entity called `JOURNAL` that does not exist.
 */
const ER: NodeFamily = {
  roledescription: "er",
  title:
    "an entity-relationship diagram stamps entity identity and edges that resolve to it",
  elementPrefix: "entity",
  edgePrefix: "id_",
  addressOf: ({ stripped }) => stripped,
  elements: [
    "ACCOUNT",
    "BALANCE_SNAPSHOT",
    "JOURNAL_ENTRY",
    "OUTBOX",
    "TRANSFER",
  ],
  edges: [
    "ACCOUNT → BALANCE_SNAPSHOT",
    "ACCOUNT → JOURNAL_ENTRY",
    "JOURNAL_ENTRY → OUTBOX",
    "TRANSFER → JOURNAL_ENTRY",
  ],
  moved: {
    noElements:
      "an ER diagram no longer draws its entities as `g.node` groups with an `id`",
    noPrefix:
      "an ER entity id no longer opens with the render id Mermaid was given",
    identity: 'an ER entity id is no longer "<renderId>-entity-<NAME>-<n>"',
    edgesDrawn: 'an ER edge is no longer a `path` carrying `data-et="edge"`',
    edgeIdentity:
      'an ER edge id is no longer "id_<entityIdA>_<entityIdB>_<n>" naming two of its own entities',
  },
};

for (const family of [FLOWCHART, ER]) {
  test(family.title, async ({ page }) => {
    const drawing = await drawingOn(page, family.roledescription);

    expect(
      drawing.nodes.length,
      contractFailure(family.moved.noElements),
    ).toBeGreaterThan(0);

    // Identity is prefixed with the id we handed Mermaid to render under, and
    // the canvas takes that prefix off by its known length rather than by
    // matching on separators — our render ids embed a timestamp, which
    // splitting on `-` would eat into.
    expect(
      drawing.nodes.filter(
        (domId) => stripRenderId(domId, drawing.renderId) === null,
      ),
      contractFailure(family.moved.noPrefix),
    ).toEqual([]);

    const elements = elementsOf(drawing, family.elementPrefix);
    expect(
      elements.map((element) => element.name).sort(),
      contractFailure(family.moved.identity),
    ).toEqual(family.elements);

    expect(
      drawnAs(drawing.edges),
      contractFailure(family.moved.edgesDrawn),
    ).toEqual(["path"]);

    // What a connection may name each element by, against how it reads out.
    const byAddress = new Map(
      elements.map((element) => [family.addressOf(element), element.name]),
    );
    expect(
      edgesRead(drawing.edges, family.edgePrefix, byAddress).sort(),
      contractFailure(family.moved.edgeIdentity),
    ).toEqual(family.edges);
  });
}

/**
 * The sequence diagram drawn by the third section. Mermaid draws its
 * participants in an order of its own, so they are sorted; its messages are
 * chronological, which is the diagram's meaning rather than a layout detail, so
 * they are not.
 */
const SEQUENCE_PARTICIPANTS = ["API", "Client", "D", "H", "OB", "Repo"];

const SEQUENCE_MESSAGES = [
  "Client → API",
  "API → H",
  "H → Repo",
  "Repo → H",
  "H → D",
  "D → H",
  "H → Repo",
  "Repo → H",
  "H → API",
  "API → Client",
  "OB → Repo",
  // A message a participant sends itself, which Mermaid draws as a path rather
  // than a line and still stamps with both of its ends.
  "OB → OB",
  "OB → Repo",
];

test("a sequence diagram stamps participant identity and messages that name both ends", async ({
  page,
}) => {
  const drawing = await drawingOn(page, "sequence");

  expect(
    drawing.participants.sort(),
    contractFailure(
      'a sequence participant no longer carries `data-et="participant"` with a `data-id`',
    ),
  ).toEqual(SEQUENCE_PARTICIPANTS);

  // Mermaid draws every participant twice — at the head of its lifeline and
  // mirrored at its foot — and the mirror carries the name rather than the
  // identity. This row moving would cost a participant half of its highlight
  // while the other half went on lighting, and nothing downstream would notice:
  // an unread mirror is decoration, which is exactly what it looks like.
  expect(
    drawing.mirrors.sort(),
    contractFailure(
      "the mirrored foot of a lifeline no longer carries `name` on `.actor-bottom`",
    ),
  ).toEqual(SEQUENCE_PARTICIPANTS);

  // Asserted ahead of the readings below, which a diagram drawing no messages
  // at all would satisfy vacuously and then report as moved endpoints.
  expect(
    drawing.messages.length,
    contractFailure(
      'a sequence diagram no longer stamps `data-et="message"` on its arrows',
    ),
  ).toBeGreaterThan(0);

  expect(
    drawing.messages.filter((message) => !message.id).length,
    contractFailure("a sequence message no longer carries a `data-id`"),
  ).toBe(0);

  // Identity has to tell two messages between the same pair apart, and this
  // diagram draws four of those.
  expect(
    new Set(drawing.messages.map((message) => message.id)).size,
    contractFailure(
      "a sequence message's `data-id` is no longer unique within its diagram",
    ),
  ).toBe(drawing.messages.length);

  const participants = new Set(drawing.participants);
  expect(
    drawing.messages.map(
      (message) =>
        `${messageEnd(message.from, participants)} → ${messageEnd(message.to, participants)}`,
    ),
    contractFailure(
      "a sequence message no longer names both of its ends in `data-from` and `data-to`",
    ),
  ).toEqual(SEQUENCE_MESSAGES);
});

/**
 * The element the live selection picks, what the diagram calls it, and what the
 * model derived from the rendered output says surrounds it. What must dim is
 * exactly two connections away rather than further off, so a neighbourhood that
 * reached one step too far fails here too.
 */
const SELECTED = "PORTS";
const SELECTED_LABEL = "ports (interfaces)";
const NEIGHBOURS = ["CMD", "QRY", "REPO", "OUTBOX"];
const TWO_AWAY = "LEDGER";

test("a live selection lights the neighbourhood the rendered output gave it", async ({
  page,
}) => {
  // The first canvas that could model its diagram at all — which on this page is
  // the flowchart, and which is the capability probe's own answer.
  const canvas = page.locator('[data-diagram-addressable="true"]').first();
  const part = (id: string) => canvas.locator(`[data-diagram-element="${id}"]`);

  await expect(
    part(SELECTED),
    contractFailure(
      "the canvas derived no model from this diagram, so nothing in it can be pointed at",
    ),
  ).toHaveCount(1);

  await part(SELECTED).click();

  await expect(
    canvas.getByRole("region", { name: "Selected element" }),
  ).toContainText(SELECTED_LABEL);
  await expect(part(SELECTED)).toHaveAttribute("data-diagram-selected", "true");
  await expect(part(SELECTED)).toHaveAttribute("data-diagram-lit", "true");
  for (const neighbour of NEIGHBOURS) {
    await expect(part(neighbour)).toHaveAttribute("data-diagram-lit", "true");
  }
  await expect(part(TWO_AWAY)).toHaveAttribute("data-diagram-lit", "false");
});

/** What one rendered diagram stamps, read exactly where the canvas reads it. */
interface Drawing {
  /** The id Mermaid rendered under, which prefixes element identity. */
  renderId: string;
  /** The `id` of every `g.node` — a flowchart's nodes, an ER diagram's entities. */
  nodes: string[];
  edges: { tag: string; id: string }[];
  /** Distinct, because Mermaid draws a participant again at the foot of its lifeline. */
  participants: string[];
  /** The names on those second drawings, which carry no identity of their own. */
  mirrors: string[];
  messages: { id: string; from: string; to: string }[];
}

/**
 * One element of a drawing: its id without the render-id prefix, and the
 * identity inside that — which is not always the part a connection names.
 */
interface DrawnElement {
  stripped: string;
  name: string;
}

/** The one diagram of that family on the Architecture page, as Mermaid drew it. */
async function drawingOn(
  page: Page,
  roledescription: string,
): Promise<Drawing> {
  const drawing = await page.evaluate((family) => {
    const svg = document.querySelector<SVGSVGElement>(
      `.diagram-canvas svg[aria-roledescription="${family}"]`,
    );
    if (!svg) return null;
    const attr = (el: Element, name: string) => el.getAttribute(name) ?? "";
    const distinct = (values: string[]) => [...new Set(values)];
    return {
      renderId: svg.id,
      nodes: [...svg.querySelectorAll("g.node[id]")].map((node) => node.id),
      edges: [...svg.querySelectorAll('[data-et="edge"]')].map((edge) => ({
        tag: edge.tagName.toLowerCase(),
        id: attr(edge, "data-id"),
      })),
      participants: distinct(
        [...svg.querySelectorAll('[data-et="participant"][data-id]')].map(
          (actor) => attr(actor, "data-id"),
        ),
      ),
      mirrors: distinct(
        [...svg.querySelectorAll(".actor-bottom[name]")].map((mirror) =>
          attr(mirror, "name"),
        ),
      ),
      messages: [...svg.querySelectorAll('[data-et="message"]')].map(
        (message) => ({
          id: attr(message, "data-id"),
          from: attr(message, "data-from"),
          to: attr(message, "data-to"),
        }),
      ),
    };
  }, roledescription);

  expect(
    drawing,
    contractFailure(
      "no diagram on the Architecture page is drawn into an `svg` with " +
        `\`aria-roledescription="${roledescription}"\``,
    ),
  ).not.toBeNull();
  return drawing!;
}

/**
 * Identity with the render-id prefix taken off by its known length, or null when
 * the drawing did not put one there. Never by matching on separators: our render
 * ids embed a timestamp and a counter, and splitting on `-` eats into it.
 */
function stripRenderId(domId: string, renderId: string): string | null {
  return domId.startsWith(`${renderId}-`)
    ? domId.slice(renderId.length + 1)
    : null;
}

/**
 * The elements of a drawing, in the two readings a connection may name them by.
 * An id that is not shaped as expected keeps a name saying so rather than being
 * dropped: a named reading says more than a list that is merely short.
 */
function elementsOf(drawing: Drawing, elementPrefix: string): DrawnElement[] {
  const shape = new RegExp(`^${elementPrefix}-(.+)-\\d+$`);
  return drawing.nodes.map((domId) => {
    const stripped = stripRenderId(domId, drawing.renderId);
    if (stripped === null) {
      return { stripped: domId, name: `${domId} (no render-id prefix)` };
    }
    const name = shape.exec(stripped)?.[1];
    return { stripped, name: name ?? `${stripped} (unexpected shape)` };
  });
}

/** The distinct tags a diagram drew these connections as. */
function drawnAs(edges: { tag: string }[]): string[] {
  return [...new Set(edges.map((edge) => edge.tag))].sort();
}

/**
 * How each edge reads, as "<from> → <to>" — or as a description of why it does
 * not, so a comparison names the edge that stopped resolving rather than only
 * showing a shorter list than expected.
 *
 * The ends are found by testing candidate split points against the identities
 * this diagram actually drew, and a reading is taken only when exactly one
 * survives: identities legitimately contain the separator the two are joined
 * with, and attaching a connection to the wrong element is worse than leaving it
 * out.
 */
function edgesRead(
  edges: { id: string }[],
  prefix: string,
  byAddress: Map<string, string>,
): string[] {
  const addresses = [...byAddress.keys()];
  return edges.map(({ id }) => {
    if (!id.startsWith(prefix)) {
      return `${id || "(no data-id)"} (not a "${prefix}" id)`;
    }
    const body = id.slice(prefix.length);
    const pairs: [string, string][] = [];
    for (const from of addresses) {
      if (!body.startsWith(`${from}_`)) continue;
      const rest = body.slice(from.length + 1);
      for (const to of addresses) {
        if (!rest.startsWith(to)) continue;
        const tail = rest.slice(to.length);
        if (tail === "" || /^_\d+$/.test(tail)) pairs.push([from, to]);
      }
    }
    if (pairs.length === 0) return `${id} (names nothing this diagram drew)`;
    if (pairs.length > 1) return `${id} (reads ${pairs.length} ways)`;
    return `${byAddress.get(pairs[0][0])} → ${byAddress.get(pairs[0][1])}`;
  });
}

/** One end of a message, or a note that it names nobody the diagram drew. */
function messageEnd(id: string, participants: Set<string>): string {
  if (!id) return "(unnamed)";
  return participants.has(id) ? id : `${id} (not a participant here)`;
}

/**
 * A failure message that says which row of the contract moved, so an upgrade is
 * diagnosable from the report alone rather than merely red.
 */
function contractFailure(row: string): string {
  return (
    `Rendered-diagram contract: ${row}. ` +
    `Mermaid ${mermaidVersion()} is installed. The contract is recorded in ${ADR} ` +
    "and read in web/src/lib/diagram-model.ts — if the upgrade is intended, verify " +
    "the whole table against a real render, update diagram-model.ts, and regenerate " +
    "the component fixtures with `npm run fixtures:diagrams`. " +
    "(This can also mean data/sample/analysis.json changed.)"
  );
}

let installedMermaid: string | null = null;

/** The version a failure should name, since the contract is a fact about it. */
function mermaidVersion(): string {
  if (installedMermaid === null) {
    // Resolved from the suite's own root rather than the process's, which is
    // wherever the run was started from.
    const packaged = join(
      test.info().project.testDir,
      "..",
      "node_modules",
      "mermaid",
      "package.json",
    );
    try {
      installedMermaid = (
        JSON.parse(readFileSync(packaged, "utf8")) as { version: string }
      ).version;
    } catch {
      installedMermaid = "(version unreadable)";
    }
  }
  return installedMermaid;
}
