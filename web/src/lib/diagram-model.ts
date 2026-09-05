/**
 * The addressable elements of a rendered architecture diagram, the connections
 * between them, and the marks the canvas hangs its highlighting off.
 *
 * A diagram canvas has to know what a reader can point at, and that knowledge is
 * derived from Mermaid's *rendered SVG* rather than parsed from the diagram
 * source: Mermaid's public parse entry point returns a diagram-type string and
 * no syntax tree, so a source parser would be a grammar clone with nothing to
 * check it against — and a clone that disagrees with the renderer highlights the
 * wrong element. Reading the drawing means the model cannot disagree with it.
 *
 * Every selector that knows what Mermaid stamps lives here, reading the drawing
 * and marking it both, so a version that changes it has one module to answer to.
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

/** What runs between two of them, in the same language. */
export type ConnectionKind = "edge" | "message";

export interface AddressableElement {
  /** Identity as the diagram's own connections refer to it. Unique per diagram. */
  id: string;
  /**
   * The `id` of the rendered group, where the drawing gives one — how a
   * flowchart node and an ER entity are found in the drawing again. A sequence
   * participant carries its identity in an attribute instead, and its
   * stick-figure form carries no `id` at all, so this is empty there.
   */
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
   * Identity as the drawing stamps it, which finds the connection's own line and
   * its label again. Unique per diagram: the trailing counter separates two
   * connections that run between the same pair of elements.
   */
  id: string;
  from: string;
  to: string;
  kind: ConnectionKind;
  /**
   * What the drawing writes along it, or empty where it wrote nothing. Unlike an
   * element, a connection never falls back to its identity: `i7` is a layout
   * counter, not anyone's word for the arrow.
   */
  label: string;
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
 * Anything a reader can put a selection on: an element of the diagram, and in a
 * family whose connections are its content, a connection. Both an element and a
 * connection already are one, which is why nothing here is constructed.
 */
export interface Addressable {
  id: string;
  label: string;
  kind: ElementKind | ConnectionKind;
}

/**
 * The model for one rendered diagram, or null when it exposes none of the
 * identity the canvas depends on — an unmodelled family, or a Mermaid version
 * that stamps something else.
 */
export function deriveDiagramModel(svg: SVGSVGElement): DiagramModel | null {
  return readFlowchartOrEr(svg) ?? readSequence(svg);
}

/**
 * What stays lit around `id` while the rest of the diagram dims. `id` is
 * whatever the reader picked, which in a family whose connections are selectable
 * is as readily a connection as an element.
 */
export function neighbourhoodOf(
  model: DiagramModel,
  id: string,
): Neighbourhood {
  const picked = model.connections.find((connection) => connection.id === id);
  // What a connection is one step from is what it runs between — which is one
  // participant, not two, when the message is one a participant sends itself.
  if (picked) {
    return {
      elements: new Set([picked.from, picked.to]),
      connections: new Set([picked.id]),
    };
  }

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
 * Everything in this diagram a reader can select, in the order the diagram drew
 * it — which is the order a keyboard cursor walks and the order the outline
 * lists, so neither has an order of its own to disagree with the drawing about.
 */
export function addressablesIn(model: DiagramModel): Addressable[] {
  return SELECTABLE_CONNECTIONS[model.family]
    ? [...model.elements, ...model.connections]
    : model.elements;
}

/** The one the reader picked, whichever of the two it turned out to be. */
export function addressableIn(
  model: DiagramModel,
  id: string,
): Addressable | null {
  return addressablesIn(model).find((subject) => subject.id === id) ?? null;
}

/**
 * The elements one connection away from `id`, as they are read out: to the
 * reader of an inspector card, and to a screen reader hearing the outline.
 *
 * A message is read from its sender to its receiver, so its ends are listed in
 * that order rather than the order the participants were drawn in — and a
 * participant messaging itself is one end, not two. Everything else is listed in
 * the order the diagram drew it, so the list does not reshuffle as the reader
 * walks from one element to the next.
 */
export function connectedTo(
  model: DiagramModel,
  id: string,
): AddressableElement[] {
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const message = model.connections.find((connection) => connection.id === id);
  if (message) {
    return [...new Set([message.from, message.to])]
      .map((end) => byId.get(end))
      .filter((element): element is AddressableElement => element !== undefined);
  }

  const near = neighbourhoodOf(model, id).elements;
  return model.elements.filter(
    (element) => element.id !== id && near.has(element.id),
  );
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
    connections: readEdges(svg, EDGE_PREFIX[family], elements),
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
    // Mermaid draws a participant twice — at the head of its lifeline and
    // mirrored at the foot — and stamps identity only on the first. One element,
    // both drawings; the mirror is found again by the name it carries.
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
  return { family: "sequence", elements, connections: readMessages(svg, seen) };
}

/**
 * The messages a sequence diagram draws. A message names both of its endpoints
 * outright, so unlike an edge nothing has to be resolved — but one naming a
 * participant this diagram does not have is still left out rather than attached
 * to nothing, exactly as an unreadable edge is.
 */
function readMessages(
  svg: SVGSVGElement,
  participants: Set<string>,
): DiagramConnection[] {
  const messages: DiagramConnection[] = [];

  for (const arrow of svg.querySelectorAll('[data-et="message"][data-id]')) {
    const id = arrow.getAttribute("data-id") ?? "";
    const from = arrow.getAttribute("data-from") ?? "";
    const to = arrow.getAttribute("data-to") ?? "";
    if (!id || !participants.has(from) || !participants.has(to)) continue;
    const text = messageTextOf(arrow);
    messages.push({
      id,
      from,
      to,
      kind: "message",
      label: text ? drawnText(text) : "",
    });
  }

  return messages;
}

/**
 * The words a sequence diagram writes along a message. Mermaid stamps no
 * identity on them, but draws them immediately before the arrow they belong to,
 * so the arrow's own previous sibling is its label — checked by class, so an
 * arrow the diagram drew without one takes nothing.
 */
function messageTextOf(arrow: Element): Element | null {
  const previous = arrow.previousElementSibling;
  return previous?.classList.contains("messageText") ? previous : null;
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
function readEdges(
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
    if (!ends) continue;
    // Where the diagram wrote words along the edge, they are drawn in a label
    // group of their own, stamped with the edge's identity.
    const label = svg.querySelector(`g.label[data-id="${quoted(id)}"]`);
    connections.push({
      id,
      from: ends[0],
      to: ends[1],
      kind: "edge",
      label: label ? drawnText(label) : "",
    });
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

/**
 * Whether a reader can point at this family's connections, rather than only at
 * the things they run between.
 *
 * A sequence diagram's messages *are* its content: thirteen arrows stack up
 * between six participants, and picking one out is the reading a reader came
 * for. A flowchart's edges are the relation between two boxes, which a reader
 * asks about by pointing at either box.
 */
const SELECTABLE_CONNECTIONS: Record<DiagramFamily, boolean> = {
  flowchart: false,
  er: false,
  sequence: true,
};

/**
 * Everything a family draws that carries no identity, and every connection whose
 * ends would not resolve. Decoration is never part of a neighbourhood, so it dims
 * whenever anything is lit — a line the canvas admits it cannot read must not end
 * up the brightest thing on a dimmed diagram.
 *
 * These lists have to name everything a family draws, not everything the reader
 * is likely to meet: what is left out stays at full strength over a dimmed
 * drawing, which is the loudest possible way to be wrong. A sequence diagram's
 * are the parts its grammar adds around the messages — the frame and title of a
 * participant box, an activation bar, and the box, label and title of a `loop`
 * or an `alt`, none of which any analysis document in this repository draws yet.
 */
const FLOWCHART_OR_ER_DECORATION =
  'g.cluster, g.cluster-label, path[data-et="edge"], g.edgeLabels g.label';

const SEQUENCE_DECORATION = [
  '[data-et="life-line"]',
  '[data-et="note"]',
  '[data-et="control-structure"]',
  // A message the model could not read, and the words along one.
  '[data-et="message"]',
  "text.messageText",
  ".actor-bottom",
  // An activation bar, numbered by how deeply the activations nest.
  'rect[class^="activation"]',
  // The frame and title Mermaid draws around a `box` of participants.
  "rect.rect",
  "text.text",
].join(", ");

const DECORATION: Record<DiagramFamily, string> = {
  flowchart: FLOWCHART_OR_ER_DECORATION,
  er: FLOWCHART_OR_ER_DECORATION,
  sequence: SEQUENCE_DECORATION,
};

/**
 * Marks the drawing with the identities the model derived, so that pointing,
 * highlighting and styling all work off our own attributes instead of
 * re-deriving Mermaid's on every event. Re-applied whenever the diagram is
 * re-rendered, since that replaces the drawing wholesale.
 */
export function markDiagram(svg: SVGSVGElement, model: DiagramModel) {
  for (const element of model.elements) {
    for (const part of elementParts(svg, model.family, element)) {
      part.setAttribute("data-diagram-element", element.id);
      part.setAttribute("data-diagram-selectable", "");
    }
  }

  const selectable = SELECTABLE_CONNECTIONS[model.family];
  for (const connection of model.connections) {
    for (const part of connectionParts(svg, model.family, connection)) {
      part.setAttribute("data-diagram-connection", connection.id);
      if (selectable) part.setAttribute("data-diagram-selectable", "");
    }
  }

  for (const part of svg.querySelectorAll(DECORATION[model.family])) {
    // Marked after identity, so whatever belongs to something the model read —
    // a participant's mirrored box, an edge's own label — is left to it. Marking
    // both would nest one dimming inside another and sink the part twice over.
    if (part.closest("[data-diagram-element], [data-diagram-connection]")) {
      continue;
    }
    part.setAttribute("data-diagram-decoration", "");
  }
}

/** Every part of the drawing that *is* this element. */
function elementParts(
  svg: SVGSVGElement,
  family: DiagramFamily,
  element: AddressableElement,
): Element[] {
  if (family !== "sequence") {
    const node = svg.querySelector(`[id="${quoted(element.domId)}"]`);
    return node ? [node] : [];
  }

  const id = quoted(element.id);
  const parts = [
    ...svg.querySelectorAll(`[data-et="participant"][data-id="${id}"]`),
  ];
  // The mirrored foot of the lifeline is the same participant drawn again, so it
  // lights with it. It carries the name rather than the identity, and a box
  // actor's name sits on the box inside the group that also holds its label —
  // where a stick-figure actor *is* that group.
  for (const mirror of svg.querySelectorAll(`.actor-bottom[name="${id}"]`)) {
    const group =
      mirror.tagName.toLowerCase() === "g" ? mirror : mirror.parentElement;
    if (group) parts.push(group);
  }
  return parts;
}

/**
 * Every part of the drawing that *is* this connection: its line, its label, and
 * for a message the invisible twin that makes the line worth pointing at — which
 * is drawn here if the connection does not have one yet.
 */
function connectionParts(
  svg: SVGSVGElement,
  family: DiagramFamily,
  connection: DiagramConnection,
): Element[] {
  const id = quoted(connection.id);
  if (family !== "sequence") {
    // A flowchart or ER edge stamps its identity on both the path and the label
    // group, so one selector finds them together.
    return [...svg.querySelectorAll(`[data-id="${id}"]`)];
  }

  // A message stamps only its arrow; the words along it are found by position.
  const parts: Element[] = [];
  for (const arrow of svg.querySelectorAll(
    `[data-et="message"][data-id="${id}"]`,
  )) {
    parts.push(arrow, hitTwinOf(arrow));
    const text = messageTextOf(arrow);
    if (text) parts.push(text);
  }
  return parts;
}

/** How wide an arrow's invisible twin is, in the units the diagram is drawn in. */
const MESSAGE_HIT_WIDTH = 14;

/**
 * An arrow with a stroke wide enough to point at, drawn invisibly over the one
 * the diagram drew.
 *
 * A message arrow is two pixels of stroke, and a message a participant sends
 * itself is two pixels of curve around an empty middle — neither is something a
 * reader can reliably hit, least of all on a canvas that arrives zoomed out. The
 * twin carries the same identity, so pointing anywhere near the arrow picks it,
 * and it is never painted: the highlighting skips it, and it keeps no marker,
 * class or style of the arrow it copies.
 */
function hitTwinOf(arrow: Element): Element {
  const existing = arrow.nextElementSibling;
  if (existing?.hasAttribute("data-diagram-hit")) return existing;

  const twin = arrow.cloneNode(false) as Element;
  for (const name of [
    "id",
    "class",
    "style",
    "marker-end",
    "marker-start",
    "data-et",
    "data-id",
    "data-from",
    "data-to",
  ]) {
    twin.removeAttribute(name);
  }
  // Inline and !important, because Mermaid styles its own drawing through
  // id-scoped rules that outrank anything a presentation attribute could say —
  // which is how the twin ended up two pixels wide, exactly like the arrow it
  // was there to make easier to hit. `pointer-events` is stated too, so the twin
  // is hit along its stroke however it is painted.
  twin.setAttribute(
    "style",
    [
      "stroke: transparent !important",
      `stroke-width: ${MESSAGE_HIT_WIDTH} !important`,
      "fill: none !important",
      "pointer-events: stroke !important",
    ].join("; "),
  );
  twin.setAttribute("data-diagram-hit", "");
  arrow.after(twin);
  return twin;
}

/** An attribute value, safe to sit inside the quotes of a selector. */
function quoted(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
