/**
 * The addressable elements of a rendered architecture diagram.
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
 *
 * This reads elements only. A neighbourhood needs the connections between them,
 * and those are read where selection is built.
 */

export type DiagramFamily = "flowchart" | "er" | "sequence";

export interface AddressableElement {
  /** Identity as the diagram's own connections refer to it. Unique per diagram. */
  id: string;
  /** The `id` of the rendered group, for finding it in the drawing again. */
  domId: string;
}

export interface DiagramModel {
  family: DiagramFamily;
  elements: AddressableElement[];
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
 * Flowchart and ER share a reader: both draw their elements as `g.node` groups
 * carrying identity in `id`. Only the id formats differ, and that difference is
 * what names the family.
 */
function readFlowchartOrEr(svg: SVGSVGElement): DiagramModel | null {
  const elements: AddressableElement[] = [];
  let family: DiagramFamily | null = null;

  for (const node of svg.querySelectorAll("g.node[id]")) {
    const stripped = stripRenderId(node.id, svg.id);
    if (!stripped) continue;

    // Both formats end in a layout counter; the middle is the identity. Greedy,
    // because identities legitimately contain hyphens and digits of their own.
    const flowchart = /^flowchart-(.+)-\d+$/.exec(stripped);
    if (flowchart) {
      family ??= "flowchart";
      elements.push({ id: flowchart[1], domId: node.id });
      continue;
    }

    // An ER diagram's connections embed the whole stripped id, so unlike a
    // flowchart's, that — not the entity name inside it — is the identity.
    if (/^entity-.+-\d+$/.test(stripped)) {
      family ??= "er";
      elements.push({ id: stripped, domId: node.id });
    }
  }

  if (!family || elements.length === 0) return null;
  return { family, elements };
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
    elements.push({ id, domId: participant.id });
  }

  if (elements.length === 0) return null;
  return { family: "sequence", elements };
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
