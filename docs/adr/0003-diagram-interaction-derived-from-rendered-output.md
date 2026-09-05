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
               label     span.nodeLabel, lines broken by <br>
      edge     path      data-et="edge"
                         data-id="L_<from>_<to>_<n>"             (un-prefixed)
                         data-points="<base64 JSON polyline>"
    er
      entity   g.node    id="<renderId>-entity-<NAME>-<n>"       (NO data-id)
               label     span.nodeLabel — the entity name; its attribute
                         rows follow it inside the same group
      edge     path      data-et="edge"
                         data-id="id_<nodeIdA>_<nodeIdB>_<n>"    (endpoints verbatim)
    sequence
      actor    g         data-et="participant"   data-id="<actor name>"
               label     the <text> drawn in the actor box
               mirror    .actor-bottom  name="<actor name>"
                         the same actor drawn again at the foot of its
                         lifeline, carrying the name and no identity; on a
                         box actor the name is on the box, inside the group
                         that also holds its label, and a stick-figure actor
                         *is* that group
      message  line      data-et="message"       data-id="i<N>"
                         data-from="<actor>"     data-to="<actor>"
                         (a self-message is drawn as a path, not a line)
               label     text.messageText, drawn immediately BEFORE its
                         arrow and carrying no identity of its own
      lifeline line      data-et="life-line"     — decoration
      note     g         data-et="note"          data-id="i<N>" — decoration,
                         and numbered out of the same counter as the
                         messages, so `data-id` alone does not say which is
                         which
      loop/alt g         data-et="control-structure"  data-id="i<N>"
                         — decoration; holds the frame, label box and
                         section titles
      activation
               rect      class="activation<depth>"  — decoration
      box      rect.rect + text.text  — decoration; the frame and title
                         Mermaid draws around a `box` of participants

Identity and label are separate readings of the same element, and both are needed: an
identity is frequently an abbreviation the reader never sees, so a card that named one would
be naming something that is not on the drawing. A label's line breaks are load-bearing —
Mermaid writes a multi-line label as one element broken by `<br>`, which `textContent` runs
together, and the lines are frequently distinct things, such as a file path above the function
inside it.

A label is the one reading that degrades rather than disappearing: an element with no
readable label falls back to its identity, so a Mermaid change that moved only the label
leaves a card naming `HTTP` where it used to name "HTTP API (Fastify)". That is deliberate,
and it is the exception to the all-or-nothing rule below — an element with no name at all
would be worse than one named as the drawing's own id names it. A *connection* falls back to
nothing, because its identity is a layout counter rather than anyone's word for it: a card
naming `i7` would be naming something that is not on the drawing at all.

Only a sequence diagram's connections can be selected. A message is the content of that
diagram — thirteen arrows stacked between six participants, where picking one out is the
reading a reader came for — where a flowchart's edge is the relation between two boxes, which
a reader asks about by pointing at either box.

Two rules bind any code that reads it:

- **The render-id prefix is stripped by known length**, never by matching on separators. Our
  render ids embed a timestamp and a counter, so splitting on `-` eats into the timestamp.
- **Connection endpoints are resolved against the set of identities present in that diagram**,
  by testing candidate split points, never by splitting on the first separator. Identities
  legitimately contain the separator used to join them — `JOURNAL_ENTRY` is an entity in this
  repository's own documents. A connection is only read when exactly one candidate pair
  survives; one that resolves to none, or to two, is left inert rather than attached to the
  wrong element.

Both rules have code. `deriveDiagramModel` reads a diagram's elements and the connections
between them — which is what a neighbourhood is made of. The second rule binds for flowchart
and ER only: a message carries its two endpoints explicitly, so a sequence diagram needs no
resolution at all. It is still held to the same standard, and a message naming a participant
the diagram does not have is left inert rather than attached to nothing.

Reading the drawing and marking it are the same knowledge, so they live in the same module.
`markDiagram` writes our own attributes onto what `deriveDiagramModel` read, and every
selector that knows what Mermaid stamps is in `web/src/lib/diagram-model.ts` — a version that
changes the drawing has one file to answer to. Marking also *adds* to the drawing in one
place: a message arrow is two pixels of stroke, so each gets an invisible twin with a stroke
wide enough to point at. Mermaid styles its own drawing through id-scoped rules that outrank
any presentation attribute, so the twin states its width inline and `!important` — without
that it came out exactly as thin as the arrow it was there to make hittable.

## Consequences

**Decoration has to be named exhaustively, and it is the one list that fails loudly.**
Everything else degrades by going quiet: identity that moves leaves the canvas with no
selection at all. A part of the drawing that is *not* in the decoration list does the
opposite — it stays at full strength while everything around it dims, which is the loudest
possible way to be wrong. The sequence list therefore names parts of the grammar no analysis
document in this repository draws yet: `loop` and `alt` frames, activation bars and
participant boxes. `sequence-control-structures.svg` is rendered for them alone, and a test
asserts that nothing a fixture paints is left unmarked.

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

**The derived model is also the diagram's accessible content.** A canvas that can read its
diagram presents the outline generated from that model — every addressable element and what
it connects to — and hides the drawing behind it, because an image with nothing in it is
what a screen reader had before. So an upgrade that moves the identity costs more than
selection: the canvas falls back to the labelled image it was, which is no worse than the
old behaviour but is a good deal worse than the new one. That the outline is generated
rather than authored is the point — a written description of a diagram drifts from it, and
this one is read out of the same drawing.

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
