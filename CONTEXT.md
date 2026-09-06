# Repo Onboarding

Turns a codebase into a guided onboarding experience. A generator reads a repository
and emits one self-describing document; a viewer renders it. This file fixes the
language both halves speak, so the schema, the generator prompts, and the UI never
drift into different words for the same thing.

## The document

**Analysis document**:
The complete, self-describing description of one repository at one commit, emitted by
a generator and rendered by the viewer. The viewer is a pure function of it.
_Avoid_: report, output, JSON, payload

**Analysis engine**:
Whatever produces an analysis document — a model following a generator prompt. There
is more than one; they must agree.
_Avoid_: analyzer, generator (as a noun for the thing itself)

**Pre-pass**:
The deterministic, offline step that computes hard facts (file counts, lines of code,
languages, manifests, churn) before any model reads the code. Its numbers are
authoritative and are never re-derived by a model.
_Avoid_: scan, index, metrics pass

**Section**:
One named division of an analysis document, with its own key in the document and its
own route in the viewer. The mapping is one-to-one in both directions.
_Avoid_: tab, page, panel

**Core section**:
A section every analysis document is expected to carry, whatever the repository is. One
missing from a document is a gap: the viewer still shows it, and says the document
predates it.
_Avoid_: required section — several are optional in the schema and still core

**Specialized section**:
A section only some repositories have anything to put in. It is present exactly when the
repository has the substance for it, and the viewer shows nothing at all when it is
absent — a repository with no design system has no Design System to be missing.
_Avoid_: optional section (that is a core section a document predates), conditional
section, and anything naming a project type — nothing anywhere records what type a
repository is

**Tech stack entry**:
One technology this repository is built on, named with the role it plays *in this
repository specifically*. The curated shortlist, not an inventory of dependencies.
_Avoid_: dependency, package, library (those are manifest-level things)

## Learn

**Learning resources**:
The section describing how a reader comes up to speed on the technologies this
repository uses. Exactly one entry per tech stack entry.
_Avoid_: tutorials, docs, links, references — most entries are official documentation
rather than tutorials, and naming the concept "tutorials" biases generators toward
blog-style walkthroughs that the origin rule excludes.

**Official entry point**:
The single canonical starting URL for a technology — its own documentation home. Null
when the technology has no public documentation, which is normal for internal and
proprietary technology in private repositories.
_Avoid_: homepage, docs link, primary URL

**Resource**:
One curated page beneath an official entry point, on the same host, carrying a reason
why *this repository's* reader would open it.
_Avoid_: link, reference, article

**In-repo pointer**:
The half of a learning-resources entry that grounds a technology in this repository:
what to notice, and the files where it actually shows up.
_Avoid_: example, usage, local docs

**Coverage**:
The property that every tech stack entry has exactly one learning-resources entry —
no gaps, no orphans. A partially covered document is not valid.
_Avoid_: completeness, parity

## Diagrams

**Diagram canvas**:
The interactive surface presenting one architecture diagram. A reader selects things in
it and inspects them, but can never change it — the analysis document is the only source
of what a diagram contains.
_Avoid_: viewer, lightbox, image, editor — "editor" is actively misleading, since nothing
here edits

**Promotion**:
Opening a diagram canvas at the size of the viewport, and the way back out of it. The
promoted canvas is the same canvas — one selection, one highlight, one inspector card
across both — so promoting changes how much room a diagram has and nothing else.
_Avoid_: lightbox, modal, overlay, full screen as two words. The control the reader
presses is still labelled "Expand diagram", which says what will happen rather than
naming the concept.

**Addressable element**:
A part of a rendered diagram that carries identity and can therefore be selected: a node,
an entity, a participant, and — in a sequence diagram, whose arrows are its content — a
message. Everything else in the drawing is decoration, which cannot be selected: subgraph
frames, lifelines, notes, and any connection whose ends could not be read.
_Avoid_: shape, box, item

**Inspector card**:
The small panel a selection opens in the corner of a diagram canvas, naming the selected
addressable element, its kind, and the elements it connects to — which for a selected
message are the two participants it runs between, sender first. It sits over the drawing
rather than beside it, and dismissing it does not clear the selection it described.
_Avoid_: panel, popover, tooltip, sidebar, rail. Its accessible name is "Selected
element", which describes what it holds rather than what it is called.

**Neighbourhood**:
A selected addressable element together with everything exactly one connection away — the
part that stays lit while the rest of the diagram dims. The same concept governs the
dependency graph and every diagram canvas.
_Avoid_: cluster (that is a diagram's own subgraph), related nodes, context

**Diagram outline**:
What a reader who cannot see a diagram canvas is given in place of the drawing: one entry
per addressable element, in the order the diagram drew them, each naming the element, its
kind, and what it connects to. It is generated from the same model the highlighting runs
on — it is the inspector card's reading of every element at once — so it cannot describe a
diagram other than the one on screen. A diagram with no model has none, and keeps the
labelled image it has always been.
_Avoid_: alt text, description, summary, transcript, legend

**Cursor**:
Where the keyboard is inside a diagram canvas: the element the next arrow key moves from,
and the one Enter opens the inspector card for. It lights a neighbourhood without picking
anything, which is what a pointer's hover does — and like a hover it goes when the reader
does, leaving whatever they had actually selected.
_Avoid_: focus, focused element, active element. Focus belongs to the canvas as a whole,
which is one tab stop however many elements its diagram draws.

## API surface

**Actor**:
A class of caller the API surface distinguishes between — an administrator, a signed-in
reader, an unauthenticated visitor, a service account, a scheduled job. Named with what
it can do in this repository, and joined by name to the routes that require it.
_Avoid_: role — taken by tech stack entries, which name the role a technology plays —
user, persona, permission
