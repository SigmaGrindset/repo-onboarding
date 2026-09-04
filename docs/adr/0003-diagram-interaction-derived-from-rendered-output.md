# Diagram interaction is derived from rendered output

A diagram canvas has to know what a reader can point at. That knowledge is read out of the
SVG Mermaid produces, by matching the attributes it stamps on nodes, entities, participants,
edges and messages. Nothing about a diagram's structure is parsed from its source, and
nothing about it is carried in the analysis document.

This is worth recording because the attributes below are not a documented public API. Read
cold, `deriveDiagramModel` looks like it is scraping a third party's internals — and it is.
That is the decision, not an accident.

## Considered options

**Parsing the diagram source.** Rejected: Mermaid's public parse entry point returns a
diagram-type string and no syntax tree, so we would be maintaining a clone of Mermaid's
grammar with nothing to check it against. The failure mode is the bad one — when the clone
and the renderer disagree, the reader clicks a box and a different box lights up, silently
and plausibly. Deriving from the emitted SVG means the model cannot disagree with the
drawing, because it comes from it.

**Structured diagrams in the analysis document.** Rejected: a schema major bump that every
generator would have to learn, and every analysis document already written would still need
the derived path as a fallback — so we would own both, forever, to remove a dependency that
the capability probe already makes safe.

## The observed contract

Verified against **Mermaid 11.16.0** by rendering every diagram in every analysis document in
this repository. Two assumptions held before verification were wrong, and are called out
because intuition reaches for both: nodes carry **no `data-id`**, and node identity is
**prefixed with the render id**.

    flowchart / graph
      node     g.node    id="<renderId>-flowchart-<key>-<n>"     (NO data-id)
      edge     path      data-et="edge"
                         data-id="L_<from>_<to>_<n>"             (un-prefixed)
                         data-points="<base64 JSON polyline>"
    er
      entity   g.node    id="<renderId>-entity-<NAME>-<n>"       (NO data-id)
      edge     path      data-et="edge"
                         data-id="id_<nodeIdA>_<nodeIdB>_<n>"    (endpoints verbatim)
    sequence
      actor    g         data-et="participant"   data-id="<actor name>"
      message  line      data-et="message"       data-id="i<N>"
                         data-from="<actor>"     data-to="<actor>"

Two rules bind any code that reads it:

- **The render-id prefix is stripped by known length**, never by matching on separators. Our
  render ids embed a timestamp and a counter, so splitting on `-` eats into the timestamp.
- **Connection endpoints are resolved against the set of identities present in that diagram**,
  by testing candidate split points, never by splitting on the first separator. Identities
  legitimately contain the separator used to join them — `JOURNAL_ENTRY` is an entity in this
  repository's own documents. A connection is only read when exactly one candidate pair
  survives; one that resolves to none, or to two, is left inert rather than attached to the
  wrong element.

Both rules have code. `deriveDiagramModel` reads a diagram's elements and, for flowchart and
ER, the connections between them — which is what a neighbourhood is made of, and where the
second rule binds. A sequence diagram's connections are not read yet; when they are, they will
need no resolution at all, because a message carries its two endpoints explicitly.

## Consequences

**A Mermaid upgrade can break this, and can break it silently.** If the identity moves, the
canvas derives nothing and every architecture diagram quietly becomes what it was before —
a picture that pans and zooms. Two things exist because of that, and neither is
belt-and-braces:

- **The capability probe.** `deriveDiagramModel` returns null when a rendered diagram exposes
  none of the expected identity, and the canvas then shows no selection affordances at all.
  Degradation is total and silent to the reader; there is never a half-interactive state. A
  model whose connections all failed to resolve degrades the same way, because a diagram with
  no connections has no neighbourhood to light — so an upgrade that moved only the edge
  identity costs the reader selection rather than giving them a broken half of it.
- **A browser contract spec**, which renders through the real Mermaid and asserts the table
  above. It does not exist yet — it is the last ticket of this feature, because it has to
  assert the whole table, not the part read first. Until it lands, an upgrade that moves the
  identity degrades every canvas to pan and zoom without failing a build. Whoever upgrades
  Mermaid before then should regenerate the fixtures and read the diff. Afterwards, expect
  that spec to be the thing that goes red.

**Highlighting means marking up someone else's SVG, inside a container React owns.** The
canvas is handed its diagram as a string and injects it, then writes its own attributes onto
the nodes and edges it derived, and the styling hangs off those. React re-sets `innerHTML`
whenever the `dangerouslySetInnerHTML` object changes identity — not when the string changes
— so that object has to stay stable while the diagram does, or every re-render silently
rebuilds the drawing and throws the marks away.

**Component tests run against committed fixtures, which cannot notice an upgrade.** The
fixtures under `web/src/components/__tests__/fixtures/diagrams/` are photographs of the
pinned Mermaid, regenerated by `npm run fixtures:diagrams` — a script that renders this
repository's own diagrams in a real browser. They are never written by hand: a hand-written
SVG only proves the canvas can read a shape we invented for it. After an upgrade, regenerate
them deliberately and read the diff.

**One architecture diagram in the express analysis document has never rendered**, because it
uses a reserved word of the diagram language as an identifier. The fixture generator reports
and skips it. That is a data defect to fix in the document, not a canvas concern.
