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
