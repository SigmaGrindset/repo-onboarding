/**
 * The addressable elements of a rendered architecture diagram, and the
 * connections between them.
 *
 * A diagram canvas has to know what a reader can point at, and that knowledge is
 * derived from Mermaid's *rendered SVG* rather than parsed from the diagram
 * source: Mermaid's public parse entry point returns a diagram-type string and
 * no syntax tree, so a source parser would be a grammar clone with nothing to
 * check it against — and a clone that disagrees with the renderer highlights the
 * wrong element. Reading the drawing means the model cannot disagree with it.
 *
 * The attributes below are not a documented public API, so a Mermaid upgrade can
 * change them. `deriveDiagramModel` returning null is the capability probe: a
 * diagram it cannot model is presented as a plain pan-and-zoom surface with no
 * selection affordances, which is never worse than a static picture. See
 * docs/adr/0003-diagram-interaction-derived-from-rendered-output.md.
 */

export type DiagramFamily = "flowchart" | "er" | "sequence";

/** What a reader is looking at, in the language of the diagram they are reading. */
export type ElementKind = "node" | "entity" | "participant";

export interface AddressableElement {
  /** Identity as the diagram's own connections refer to it. Unique per diagram. */
  id: string;
  /** The `id` of the rendered group, for finding it in the drawing again. */
  domId: string;
  /**
   * What the drawing calls it — the text drawn inside the element, not its
   * identity, which is frequently an abbreviation the reader never sees. Line
   * breaks the diagram drew are kept, because a label is often a path over a
   * function name and the two are separate things.
   */
  label: string;
  kind: ElementKind;
}

export interface DiagramConnection {
  /**
   * Identity as the drawing stamps it, which finds the connection's own path and
   * its label again. Unique per diagram: the trailing counter separates two
   * connections that run between the same pair of elements.
   */
  id: string;
  from: string;
  to: string;
}

export interface DiagramModel {
  family: DiagramFamily;
  elements: AddressableElement[];
  connections: DiagramConnection[];
}

/** A selected element together with everything exactly one connection away. */
export interface Neighbourhood {
  elements: Set<string>;
  connections: Set<string>;
}

/**
 * The model for one rendered diagram, or null when it exposes none of the
 * identity the canvas depends on — an unmodelled family, or a Mermaid version
 * that stamps something else.
 */
export function deriveDiagramModel(svg: SVGSVGElement): DiagramModel | null {
  return readFlowchartOrEr(svg) ?? readSequence(svg);
}

/** What stays lit around `id` while the rest of the diagram dims. */
export function neighbourhoodOf(
  model: DiagramModel,
  id: string,
): Neighbourhood {
  const elements = new Set([id]);
  const connections = new Set<string>();
  for (const connection of model.connections) {
    const far =
      connection.from === id
        ? connection.to
        : connection.to === id
          ? connection.from
          : null;
    if (far === null) continue;
    elements.add(far);
    connections.add(connection.id);
  }
  return { elements, connections };
}

/**
 * Flowchart and ER share a reader: both draw their elements as `g.node` groups
 * carrying identity in `id`, and stamp their connections on the edge path. Only
 * the id formats differ, and that difference is what names the family.
 */
function readFlowchartOrEr(svg: SVGSVGElement): DiagramModel | null {
  const elements: AddressableElement[] = [];
  let family: "flowchart" | "er" | null = null;

  for (const node of svg.querySelectorAll("g.node[id]")) {
    const stripped = stripRenderId(node.id, svg.id);
    if (!stripped) continue;

    // Both formats end in a layout counter; the middle is the identity. Greedy,
    // because identities legitimately contain hyphens and digits of their own.
    const flowchart = /^flowchart-(.+)-\d+$/.exec(stripped);
    if (flowchart) {
      family ??= "flowchart";
      elements.push({
        id: flowchart[1],
        domId: node.id,
        label: labelOf(node, flowchart[1]),
        kind: "node",
      });
      continue;
    }

    // An ER diagram's connections embed the whole stripped id, so unlike a
    // flowchart's, that — not the entity name inside it — is the identity.
    const er = /^entity-(.+)-\d+$/.exec(stripped);
    if (er) {
      family ??= "er";
      elements.push({
        id: stripped,
        domId: node.id,
        label: labelOf(node, er[1]),
        kind: "entity",
      });
    }
  }

  if (!family || elements.length === 0) return null;
  return {
    family,
    elements,
    connections: readConnections(svg, EDGE_PREFIX[family], elements),
  };
}

/** Sequence diagrams stamp participant identity directly, under a name of its own. */
function readSequence(svg: SVGSVGElement): DiagramModel | null {
  const elements: AddressableElement[] = [];
  const seen = new Set<string>();

  for (const participant of svg.querySelectorAll(
    '[data-et="participant"][data-id]',
  )) {
    const id = participant.getAttribute("data-id") ?? "";
    // Mermaid can draw a participant twice — top and mirrored bottom. One
    // element, whichever box the reader reaches first.
    if (!id || seen.has(id)) continue;
    seen.add(id);
    elements.push({
      id,
      domId: participant.id,
      label: drawnText(participant) || id,
      kind: "participant",
    });
  }

  if (elements.length === 0) return null;
  // Messages carry their two endpoints explicitly, so a sequence diagram needs
  // no resolution at all — that reader arrives with the family's own selection.
  return { family: "sequence", elements, connections: [] };
}

/**
 * The text drawn inside an element. A flowchart node and an ER entity both draw
 * their name in a `.nodeLabel`; an ER entity's attribute rows follow it, and are
 * not part of the name. Falls back to the identity when there is no label to
 * read, so an element is never nameless.
 */
function labelOf(node: Element, fallback: string): string {
  const label = node.querySelector(".nodeLabel");
  return (label ? drawnText(label) : "") || fallback;
}

/**
 * The text of a drawn label, with the line breaks the diagram drew. Mermaid
 * writes a multi-line label as one element broken by `<br>`, which plain
 * `textContent` would run together — and the lines are frequently distinct
 * things, such as a file path above the function it holds.
 */
function drawnText(root: Element): string {
  let text = "";
  for (const child of root.childNodes) {
    if (child.nodeType === 3 /* text */) {
      text += child.nodeValue ?? "";
      continue;
    }
    if (child.nodeType !== 1 /* element */) continue;
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") text += "\n";
    else text += drawnText(element) + (tag === "p" ? "\n" : "");
  }
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** How each family opens the id it stamps on a connection. */
const EDGE_PREFIX = { flowchart: "L_", er: "id_" } as const;

/**
 * The connections between elements, read off the edges the diagram drew. An edge
 * whose endpoints do not resolve is dropped rather than attached to the wrong
 * element, so it is simply not part of any neighbourhood.
 */
function readConnections(
  svg: SVGSVGElement,
  prefix: string,
  elements: AddressableElement[],
): DiagramConnection[] {
  const ids = elements.map((element) => element.id);
  const connections: DiagramConnection[] = [];

  for (const edge of svg.querySelectorAll('path[data-et="edge"][data-id]')) {
    const id = edge.getAttribute("data-id") ?? "";
    if (!id.startsWith(prefix)) continue;
    const ends = resolveEndpoints(id.slice(prefix.length), ids);
    if (ends) connections.push({ id, from: ends[0], to: ends[1] });
  }

  return connections;
}

/**
 * The two elements a connection runs between, out of `<from>_<to>_<counter>`.
 *
 * Element identities legitimately contain the underscore used to join them —
 * `entity-JOURNAL_ENTRY-1` is real, and present in this repository's own
 * documents — so the split point is found by testing candidates against the
 * identities actually in this diagram, never by splitting on the first
 * separator. Nothing is returned unless exactly one reading survives: a second
 * reading means the drawing cannot say which pair it meant, and attaching a
 * connection to the wrong element is worse than leaving it out.
 */
function resolveEndpoints(body: string, ids: string[]): [string, string] | null {
  let resolved: [string, string] | null = null;

  for (const from of ids) {
    if (!body.startsWith(`${from}_`)) continue;
    const rest = body.slice(from.length + 1);
    for (const to of ids) {
      if (!endsAfter(rest, to)) continue;
      if (resolved) return null;
      resolved = [from, to];
    }
  }

  return resolved;
}

/** Whether `rest` is `to`, followed by nothing but the layout counter. */
function endsAfter(rest: string, to: string): boolean {
  if (!rest.startsWith(to)) return false;
  const tail = rest.slice(to.length);
  return tail === "" || /^_\d+$/.test(tail);
}

/**
 * Element identity is prefixed with the render id, which carries a timestamp and
 * a counter — so the prefix is removed by its known length. Matching on
 * separators would eat into the timestamp.
 */
function stripRenderId(domId: string, renderId: string): string | null {
  if (!renderId || !domId.startsWith(`${renderId}-`)) return null;
  return domId.slice(renderId.length + 1);
}
