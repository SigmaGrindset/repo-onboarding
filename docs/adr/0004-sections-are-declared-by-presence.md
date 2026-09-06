# A section exists because its key does, not because of a project type

Some sections only make sense for some repositories — a design system on a Rust CLI, an
API surface on a static site generator. The obvious way to express that is to record what
kind of project a repository is and map the type to a set of sections. We rejected that.
Specialized sections are optional top-level keys, a section appears in the viewer exactly
when its key is present, and nothing anywhere records a project type.

## Considered options

**A `projectType` enum in metadata.** Rejected: real repositories are several types at
once. This one is a Next.js application, a published npm CLI and a JSON Schema contract;
a monorepo is four things, none of which is the repository. An enum wide enough to be
honest stops discriminating, and one narrow enough to discriminate lies about most
repositories. It is also a taxonomy that is never finished — every section added later
forces a review of every type, forever.

**An explicit `sections[]` manifest in the document.** Rejected: presence already is the
manifest. A list of the sections a document contains, stored beside the sections it
contains, is a second source of truth whose only distinguishing property is that it can
be wrong.

## Consequences

**The section list stops being a constant.** `ANALYSIS_SECTIONS` becomes a function of
the analysis document, which reaches everything derived from it: the sidebar, the command
palette's search index, and the markdown export — which today keeps a parallel copy of
the order that should derive from the registry instead.

**"Absent" now means two things, so every section carries a class.** A missing
`contributorGuide` means a document produced before that section existed, and the reader
should be told to regenerate. A missing design system means a repository that has none,
and the reader should be told nothing at all. The registry marks each section core or
specialized to keep those apart. Without the distinction, deriving the nav from presence
would silently delete the regenerate prompt that core sections depend on.

**A document cannot say it considered a section and found nothing.** Absence covers both
"this repository has no design system" and "this document predates design systems", and
we chose not to separate them. An explicit null would, but it costs every consumer a
third case and asks generators to reliably emit nulls for things that do not apply, which
is exactly the instruction models drop. Old documents advertise what they are missing
through the staleness badge and the versions view instead, which is already where "your
analysis is out of date" lives.

**Adding a section later is additive and breaks nothing.** Every specialized key is
optional, so a document written against an older schema still validates against a newer
one and no analysis needs migrating. The cost lands on the generator rather than the
contract: a section only appears once the pre-pass emits a signal for it and a prompt
teaches a model to ground it, so shipping one is three coordinated changes — schema,
pre-pass, prompt — released together.
