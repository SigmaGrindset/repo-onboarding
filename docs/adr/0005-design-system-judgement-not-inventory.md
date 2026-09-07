# A design system is a judgement, not an inventory

The obvious way to model a design system is to list what is in it: every token, every
component. We rejected that. The primitive components are enumerated exhaustively, but
within a boundary the analysis engine draws rather than one a validator can check; the
tokens are **sampled** by group, with a hard cap on how many examples a group may carry;
and the reuse rule — when to use an existing primitive rather than write a new one — is a
required key of its own rather than a sentence that may or may not turn up in prose.

This is worth recording because it makes one section carry two lists with different
promises, which reads as an inconsistency until you know it was chosen. The API surface
that shipped before it is exhaustive throughout, and the shape did not generalise. A route
is decidable — you read the routing files and either a route is there or it is not, and
`POST /api/analyses` describes itself. Neither half holds here. What counts as a primitive
rather than a feature component is a judgement, and `Card` tells a newcomer nothing about
when to reach for it.

## Considered options

**Enumerate every token.** Rejected: it is a copy of a file, and a copy that goes stale the
first time someone adds a shade. The reader's question is not "what is `--surface-3`" — the
file answers that, and answers it correctly — it is "how does this repository do colour, and
where do I look". A token group answers that in four lines and stays true across a
repaint. The cap on examples is not a size limit; it is what makes "sample" a contract
rather than a hope, because an engine asked for a representative handful and given room for
sixty will supply sixty.

**Carry token values, so the viewer can draw swatches.** Rejected, and it is the most
tempting of these: a Design System page with no colour on it looks like a page missing its
best feature. But values rot faster than anything else in an analysis document, they rot
invisibly — a swatch is still a swatch when it is the wrong blue — and a document that
paints last month's palette is worse than one that sends the reader to the file. The
section teaches a reader where colour is decided and how to reference it. It is not a
colour reference sheet, and the file it points at is a better one.

**Mirror the API surface exactly: cheap facts on every row, prose on a curated few.**
Rejected: it puts two prose fields on every primitive. A route note is optional because a
method and a path already say what the route is; a primitive's name does not, so the line
saying what to reach for it for has to be on every row. Adding a second, curated prose
field on top of it invites an engine to fill both and produces the wall of text the
two-tier shape exists to prevent. Curation still applies — it moved to the section level,
where the styling approach and the reuse rule are the two things worth a reader's full
attention.

**Leave the reuse rule to the styling-approach prose.** Rejected: it is the most valuable
thing in the section and the first thing an engine drops, precisely because it is the only
part that cannot be read off a file. A key that must be filled is the only instruction a
model reliably follows. Splitting it in two — when to reuse, when to create — is deliberate
for the same reason: asked for one blob, an engine writes the half that is a platitude
("reuse an existing component where one fits") and omits the half a newcomer actually
needs, which is the test for when creating is the right call.

## Consequences

**Two lists in one section mean two different promises, and the section must not blur
them.** If a primitive is not listed, it does not exist; if a token is not listed, it very
likely does exist and this is not where you would find it. Anything rendering the section
has to keep that legible — the tokens are a way in, the primitives are the set.

**Nothing can check that the primitive list is complete.** The API surface's exhaustiveness
is enforced by nothing either, but at least a reviewer can check it against the routing
files; here, a reviewer would first have to agree about the boundary. The substance floor
and the generator prompt carry the whole weight, which is why the floor is a count of
primitives and not a count of anything softer.

**A repository has no design system unless someone can say when to add to it.** The rule is
required, so an engine that finds tokens and components but cannot form the judgement is
being told to omit the section rather than fill the field with a platitude. That is the
intended reading: a set of components nobody can tell you when to extend is a folder, not a
system. The rule is usually unwritten, and stating the practice the code shows is the
expected answer — a documented rule is a bonus, not the bar.
