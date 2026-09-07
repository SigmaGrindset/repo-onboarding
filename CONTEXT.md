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
The property that a join by name has no gaps and no orphans on either side: every tech
stack entry has exactly one learning-resources entry, and — where an API surface names
its actors — every actor a route requires is described exactly once, and every actor
described is required by a route. A partially covered document is not valid.
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

**API surface**:
Everything a repository exposes to callers over the network, as one section. It is a
specialized section: a repository that serves no requests has no API surface, and no tab
where one would be. A library whose *users* define routes has none either — the routes
belong to the users.
_Avoid_: endpoints, API, REST API, public API — most of these surfaces are neither REST
nor public

**Route**:
One address a caller can reach, named by its method and its path, carrying the file that
implements it and the actor allowed to call it. Routes are listed **exhaustively**: the
list is trustworthy only if a reader can conclude that a route not in it does not exist.
_Avoid_: endpoint, handler (that is the function, not the address), path (that is one
half of a route)

**Route note**:
The prose on a route that a newcomer needs explained — the one that is not what its path
suggests, the one with a surprising permission, the one everything else goes through.
Curation lives here and nowhere else in the section, because attention is the scarce
thing and a note on every route emphasises none of them.
_Avoid_: description, summary, docs — every route could carry one of those, which is
exactly the failure

**Actor**:
A class of caller the API surface distinguishes between — an administrator, a signed-in
reader, an unauthenticated visitor, a service account, a scheduled job. Named with what
it can do in this repository, and joined by name to the routes that require it. The list
is optional; where it exists it is a claim about the routes, so it carries the same
coverage property as learning resources and is checked rather than trusted.
_Avoid_: role — taken by tech stack entries, which name the role a technology plays —
user, persona, permission

## Design system

**Design system**:
How a repository's interface is built, as one section: its styling approach, its design
token groups, its primitives, and its reuse rule. A specialized section — a repository
that renders no interface has none, and no tab where one would be. So does one with a
folder of components nobody can say when to add to: without a reuse rule there is no
system, only components.
_Avoid_: UI kit, component library (that is usually a dependency, not this repository's
own), theme, styleguide

**Styling approach**:
The one way this repository writes styles — the mechanism and the convention that keeps it
single. Prose, because the useful part is what a newcomer must not do instead.
_Avoid_: CSS strategy, methodology, stack (the tech stack names the library; this names
the practice)

**Design token group**:
One kind of design decision that has been given names — colour, spacing, typography,
elevation, layering — with the file it is defined in, how a value from it is referenced in
code, and a handful of example names. **Sampled, never enumerated**: the file is the
inventory and stays correct; the group is the way in. Carries no values, so nothing here
can go quietly stale.
_Avoid_: token (a single one is not what is listed), variable, palette, theme

**Primitive**:
One component the interface is built from rather than one built for a screen — the thing a
newcomer should find before writing a fourth of it. Listed **exhaustively** within the
boundary the analysis engine draws, so that a component not listed is one that does not
exist. Two of the same name in different files are two entries, because that is exactly
what a reader needs to know.
_Avoid_: component (every file in a React repository is one), atom, widget, element,
building block

**Reuse rule**:
The judgement a newcomer would otherwise get wrong: when to reach for an existing
primitive, and the test for when writing a new one is right instead. Usually unwritten, so
it states the practice the code shows rather than a rule someone documented. Required —
the section cannot exist without it.
_Avoid_: guideline, convention, policy, contribution rule

## Delivery

**Delivery**:
How committed code reaches a running environment, as one section: the pipeline it travels,
the gates it must pass, the build a deploy runs, the environments it lands in, how
migrations are applied, and the variables a deploy requires. A specialized section — a
repository with nothing committed about its pipeline has no Delivery, and no tab where one
would be. It stops at what is committed, which is a boundary rather than an omission.
_Avoid_: CI/CD, release process, and — as a name for this section — deploy or deployment.
"Deploy" is the word that invites an analysis engine into the operational half, which is why
the section is not called it; the ordinary verb, for the thing a pipeline does, is fine.

**Operational half**:
Everything true about running the system that is not in the repository — production
dashboards, log access, rollback procedure, on-call. Named so that the schema, the
generator prompt and the viewer can all refer to the same excluded thing. It is absent by
design: the repository does not contain it, so an analysis engine asked for it invents it,
and an invented instruction about production is one somebody follows against a live system.
_Avoid_: ops, production knowledge, operations section — there is no such section and there
is no field to hold it. "Runbook" names a real document and the word is fine for one; it is
not a name for this concept

**Gate**:
One automated check a change must pass, at the grain a reader could run it at — usually a
job, sometimes a single step where a job runs several distinct checks. Named as this
repository names it, grounded in the file that defines it, and carrying what it actually
checks, because a gate called `web` says nothing. Listed **exhaustively**: a check not
listed is one that does not run.
_Avoid_: check (that is what a gate does), status check, and — as a name for the concept —
job, step or workflow. Those three name the mechanism a gate happens to be built from, which
is why the definition uses them and the term does not: one workflow file defines several
gates, and one job can be several.

**Environment**:
One place committed configuration deploys to, named with what reaches it — a branch, a tag,
an event — and the committed file that says so. The file is not decoration: a
branch-to-environment mapping that lives only in a hosting dashboard cannot be read, so it
is not written down.
_Avoid_: stage, tier, target, deployment (that is one event, not the place)

**Migration application**:
What applies this repository's database migrations, and when. Its most valuable answer is
frequently "nothing does — a person runs the command by hand", which is exactly the answer
a newcomer who ships a schema change needs and the one an analysis engine is most tempted
to improve upon.
_Avoid_: schema change, database deploy, and "migrations" alone — that word names the files,
which is why the document's key `migrations` holds this concept *about* them rather than a
list of them.

**Deploy variable**:
One name a deploy must have a value for, given with what it is for and the committed file
that declares it. Listed **exhaustively**, unlike design token groups, because a partial
list of required variables is worse than none — and carrying **no values ever**, because an
analysis document is shared and a value beside a database URL is a leak, not a stale fact.
_Avoid_: env var, secret, config, and "environment variable" unqualified — that is what the
thing is, not which ones this section lists, and "environment" on its own is the place a
value is set, which is a different entry.

**Build**:
What a deploy actually runs, and the committed file that defines producing it — a container
image from a `Dockerfile`, a bundle from a `build` script, a package published from source.
It is where the repository's committed build and deploy configuration lands, and it is the
one part of the section a repository can always answer, because "nothing is compiled, the
source is the artefact" is an answer rather than an absence.
_Avoid_: artifact (that is the output alone, without where it comes from), compile, bundle,
pipeline (that is the whole journey, of which this is one step)
