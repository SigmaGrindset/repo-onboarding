---
name: onboard
description: Deep-analyze a GitHub repository (URL) or local path and produce a validated analysis.json for the Repo Onboarding viewer. Runs a deterministic pre-pass for hard facts (file tree, LOC, languages, dependencies, git churn), reads the code with real depth, and emits a schema-conformant document under data/<repo-name>/analysis.json. Use when the user wants to onboard, understand, map, or generate an onboarding site for a codebase.
argument-hint: <github-url-or-local-path>
---

# /onboard — repository analysis engine

You are producing `analysis.json`: the complete, self-describing contract that the
Repo Onboarding viewer renders directly. **The UI is a pure function of this JSON —
your analysis IS the product.** Shallow, generic output is a failure even if it
passes schema validation. The schema's `minLength`/`minItems` are a floor, never a target.

`$ARGUMENTS` is either a GitHub URL or a local filesystem path to the repo to analyze.

Work through the steps below in order. Do not skip the pre-pass and do not invent numbers.

---

## Key paths (this project)

Everything is relative to the **repo-onboarding project root** (the project that
contains this skill), NOT the analyzed repo. Use absolute paths in commands.

- Pre-pass script: `.claude/skills/onboard/prepass.mjs`
- Edge-integrity checker: `.claude/skills/onboard/edges-check.mjs`
- Schema validator: `schema/validate.mjs`
- Output location: `data/<repo-name>/analysis.json`
- Scratch (temp clone + pre-pass output): use the OS temp dir, e.g.
  `<tmp>/onboard-<repo-name>/`. NEVER write scratch or output inside the analyzed repo.

---

## Step 1 — Resolve the input

Determine whether `$ARGUMENTS` is a URL or a local path.

- **GitHub URL** (starts with `http`, `git@`, or looks like `owner/repo`): shallow-clone
  it into a temp dir, keeping enough history for churn:
  ```
  git clone --depth 300 <url> <tmp>/onboard-<repo-name>/repo
  ```
  Set `<repo-name>` from the URL's last path segment (strip `.git`). The clone dir is the
  **repo path** for all later steps. `repoUrl` in metadata = the canonical https URL.
- **Local path**: use it in place as the repo path. Derive `<repo-name>` from the directory
  name. **NEVER modify the target repo** — no writes, no new files, no git operations that
  change state. `repoUrl` = the origin remote if the pre-pass found one, else `null`.

Slugify `<repo-name>` to a safe folder name (lowercase, `[a-z0-9._-]`, spaces→`-`).

## Step 2 — Run the deterministic pre-pass (ground truth)

This is the single biggest quality lever. Run it and **treat its numbers as authoritative**:

```
node .claude/skills/onboard/prepass.mjs "<repo-path>" --out "<tmp>/onboard-<repo-name>/prepass.json" --pretty
```

Then READ `prepass.json` fully. It gives you:
- `stats` — `totalFiles`, `totalLoc`, and `languages[]` with `{language, files, loc, percentage}`.
- `primaryLanguage`, `largestFiles[]`.
- `git` — `headSha`, `remoteUrl`, `branch`, `commitsAnalyzed`, and `topChurn[]`
  (`{path, commits, lastCommitDate, lastCommitDaysAgo, recentActivity}`).
- `manifests[]` — parsed dependencies per ecosystem, plus npm `scripts`.
- `notable` — README, license, entry-point hints, CI configs, container files.
- `signals` — candidate hints for the **specialized sections** (below). A signal says a
  repository is worth looking at for a section, never that it has one.
- `fileTree` — the ignore-filtered tree (node_modules/.git/build/etc. already excluded).

**Hard rules on using these numbers:**
- `metadata.stats.totalFiles`, `totalLoc`, and every `languages[]` entry MUST be copied
  **verbatim** from the pre-pass. Do not recount, round, or estimate.
- `metadata.commitSha` = `git.headSha` (or `null` if not a repo). `metadata.repoUrl` =
  `git.remoteUrl` for local paths / the given URL for clones (or `null`).
- `hotspots.entries[]` MUST be built from `git.topChurn`: use its `path`, `commits`, and
  `recentActivity` as-is; you add the `insight` (why it's hot, what it tells a newcomer)
  and the overall `interpretation`. Pick the most meaningful ~5–8 churn files (skip pure
  lockfiles/generated noise if a source file is more instructive).
- `metadata.primaryLanguage` is usually `git`/pre-pass `primaryLanguage`, but use judgment:
  if generated fixtures/vendored data skew the raw top-by-LOC (e.g. a big JSON fixture),
  pick the language a human would call primary. `stats.languages` stays verbatim regardless.
- If `git.isRepo` is false, there is no churn data — you must still populate `hotspots` with
  at least one entry using structural reasoning (largest/most-central files, `commits: 0`,
  `recentActivity: "dormant"`) and say so honestly in `interpretation`.

## Step 3 — Decide direct-read vs. fan-out

Look at `stats` from the pre-pass.

- **Below threshold** (≤ 400 source files AND ≤ 50,000 LOC): read directly yourself.
- **At or above threshold** (> 400 source files OR > 50,000 LOC): fan out. Use the
  `fileTree` and `codebaseMap`-worthy top-level dirs to partition the repo into 3–6
  subsystems. Spawn one `Explore` (or `general-purpose`) subagent **per subsystem in
  parallel**, each with a precise brief:
  > "Read subsystem `<dir>` of `<repo>`. Identify its responsibility, entry points, key
  > files (with real line ranges for the 2–3 most important), its public interface, what
  > it imports from other subsystems and what imports it, and any notable patterns. Ground
  > every claim in files you actually read; cite real repo-relative paths. Return a concise
  > structured brief."
  Then synthesize their briefs into the unified analysis yourself. Cross-subsystem edges in
  the dependency graph come from the "imports/imported-by" facts each agent reports.

## Step 4 — Deep reading strategy

Whether direct or synthesizing, ground **every** claim in files actually read. Cite real
repo-relative paths. Every tour line range must be real (open the file, confirm the lines).

Reading order:
1. **README** (`notable.readme`) and **manifests** — what it claims to be, its scripts,
   its dependencies. Cross-check claims against code; READMEs lie or go stale.
2. **Entry points** (`notable.entryHints`, `main`/`index`/`server`/`cli`) — trace how the
   program starts and wires itself together.
3. **Follow the dependency structure** from entry points inward: imports, the core domain,
   then adapters/infrastructure/IO at the edges. Note module boundaries as you go.
4. **Hot files** (`git.topChurn`) — read them; churn reveals where the real complexity and
   active work live.
5. **Tests** — often the clearest executable spec of intended behavior.

Extract, per schema section, as you read:
- **pitch** — what it is/does (`summary` ≥ 80 chars, real substance), `audience`, and a
  `techStack[]` (≥ 3) where each `role` says what that tech does *in THIS repo* (from the
  manifests + how it's actually used), never a generic definition.
- **architecture[]** — ordered narrative of the real design (layers, boundaries, data flow,
  key patterns). **At least one section MUST carry a Mermaid `diagram`**, and diagrams must
  reflect **actual imports/boundaries you saw in code** — not an idealized textbook picture.
  Prefer `flowchart` for module/layer structure, `sequence` for a key request/data flow,
  `er` for the persistence model. Give 2–4 sections; multiple diagrams is better.
  Diagram sources must NOT contain `;` inside statement/message/label text — Mermaid
  parses `;` as a statement separator, so the diagram fails to render. Use commas,
  arrows (`→`), or "then" instead (e.g. `BEGIN → insert → COMMIT`, not `BEGIN; insert; COMMIT`).
- **dependencyGraph** — `nodes[]` for the important internal modules (with repo-relative
  `path`), key external packages (from manifests), and external services/datastores;
  `edges[]` for the real relationships (imports/calls/reads-from/implements). Every
  `edge.from`/`edge.to` MUST reference an existing `node.id` (checked in Step 6). Keep it
  the meaningful graph, not every file.
- **codebaseMap[]** (≥ 3) — annotate the notable directories/paths: `purpose` (what lives
  here and why), `role` (core domain / entrypoint / adapter / config / tests / supporting),
  and `keyFiles[]` with one-line notes.
- **tour[]** (≥ 3, aim for 5–8) — the pedagogically ordered heart of onboarding. Order
  steps so each builds on the last (foundational concepts → the spine that ties layers
  together → edges). `why` explains why read THIS at THIS point (the ordering rationale,
  ≥ 40 chars); `notice` says what to specifically take away (≥ 40 chars). Use real
  `startLine`/`endLine` where pointing at a specific region.
- **setup** — `prerequisites`, `setup`, `run`, `test` steps with real commands derived from
  the manifests/scripts/README/CI (`notable.ciConfigs`), each step titled, `notes` for
  gotchas. Do not invent scripts that don't exist — check `manifests[].scripts`.
- **hotspots** — see Step 2.
- **learningResources[]** — how a newcomer comes up to speed on the stack. **Exactly one
  entry per `pitch.techStack[]` entry**, joined by `tech`, which MUST match that entry's
  `name` character for character. No gaps, no extras — this is checked at validation time.
  - `official` — that technology's own documentation entry point (its docs home, or its
    repository when that is genuinely where the docs live). Use the homepage you can
    justify from the manifests, never a guess. Set it to `null` when the technology has no
    public documentation at all — internal services, in-house protocols, proprietary
    tooling — and then `resources` MUST be empty.
  - `resources[]` (1–4, empty only when `official` is null) — specific pages **on the same
    documentation domain as `official`**. Subdomains are fine (`docs.python.org` under
    `python.org`); anything else is not. **No blog posts, no course platforms, no videos,
    no third-party tutorials** — this is enforced at validation time and a stray host
    fails the document. Prefer a page you are confident exists: linking two pages you are
    sure of beats four you half-remember. Never invent a deep link to pad the list.
  - Each resource needs a `kind` (`tutorial` = build something step by step, `guide` =
    read start to finish, `reference` = look things up) and a `why` (≥ 40 chars) saying
    why **this repo's** reader opens it — tie it to the role this technology plays here.
    "The official documentation" is a failure; "the routing engine moved into this package
    in v5, so route questions are answered here, not in lib/" is the bar.
  - `inRepo` — the half only you can write: `note` (≥ 40 chars) on what to notice about
    how THIS repo uses the technology (the pattern it leans on, not a definition), plus
    `files[]` (≥ 1) pointing at real repo-relative paths where it actually shows up.
- **apiSurface** — a SPECIALIZED section: emit the key only if this repository really
  exposes routes over the network, and OMIT IT ENTIRELY otherwise. There is no empty
  version of this section — a repository with no API produces a document with no
  `apiSurface` key, and the viewer shows no tab at all. Start from
  `signals.apiSurface`: it names the server frameworks it found in the manifests and the
  route-shaped directories and files in the tree. It is a hint, not a verdict — open
  those files and decide.
  - Emit the section when the repository *serves* requests: an application, a service, a
    site with route handlers. Do NOT emit it for a library or framework whose users
    define the routes (Express itself has no API surface — its users do), for a
    command-line tool, or for a repository whose only "routes" are calls it makes to
    someone else's API.
  - `routes[]` is **exhaustive, not curated**: every route the repository exposes, so a
    reader can conclude that a route not listed does not exist. A partial list is a
    failure even when every row in it is correct. Read the routing files rather than
    recalling the framework's conventions.
  - Each route carries `method`, `path` (as a caller addresses it, with the repository's
    own parameter notation — `/api/analyses/[id]`, `/users/:id`, `/items/{item_id}`),
    `file` (the repo-relative file implementing it), and `actor`.
  - `actor` names the class of caller permitted to call the route, in terms of what it
    can do *here* — "signed-in reader", "analysis owner", "anonymous share-link visitor",
    "token-bearing uploader", "public". Machine callers are actors too: service accounts,
    scheduled jobs and webhook senders usually hold the most dangerous permissions, so
    never reduce the list to the human ones. Read the middleware or the guard in the
    handler rather than assuming, and use the same actor name for every route that
    requires it.
  - `note` is OPTIONAL and belongs on the few routes a newcomer genuinely needs
    explained — the one that is not what its path suggests, the one with a surprising
    permission, the one everything else goes through. Most routes carry none. A note on
    every route is a wall of text with nothing emphasised, which is the failure this
    two-tier shape exists to avoid.
  - `actors[]` is OPTIONAL and gives the reader the permission model without making them
    assemble it from every route row: one entry per class of caller, each a `name` and a
    `summary` (≥ 40 chars) of what that caller can do *here*. Omit the key for a
    repository that only separates public from signed-in — the route rows already say
    that — and emit it when the distinctions are worth summarising.
  - **The actor list and the route requirements must agree, exactly and both ways.**
    Every `actors[].name` must be the `actor` of at least one route, and every route's
    `actor` must appear as a `name`, character for character. Both directions are
    checked at validation time (`actor-coverage`), so an actor you describe but no route
    requires fails the document, and so does a route requiring an actor you never
    described.
  - Machine callers get an entry like anyone else: a service account, a scheduled job or
    a webhook sender is an actor, and dropping it is how a permission summary quietly
    loses its most dangerous caller.
- **firstTasks[]** (≥ 2, aim for 3–4) — concrete, real tasks referencing real files, with a
  `difficulty` and a `rationale` for why it's a good newcomer task. Range easy→hard.

**Anti-filler bar:** no sentence that would be true of "any repo of this kind." If a claim
isn't traceable to a file you read or a pre-pass number, cut it or go read the file.

## Step 5 — Emit analysis.json

Write the document to:
```
data/<repo-name>/analysis.json
```
(under the repo-onboarding project root). Constants:
- `schemaVersion`: `"1.2.0"` — the contract this skill is written against
- `metadata.analyzerVersion`: `"onboard/0.2.0"`
- `metadata.analyzedAt`: current UTC time, RFC 3339 (e.g. `2026-07-11T14:22:05Z`)

Fill `metadata.stats`, `commitSha`, `repoUrl` from the pre-pass per Step 2. Create the
`data/<repo-name>/` directory if needed.

## Step 6 — Validate (both gates must pass)

1. **Schema + cross-references:**
   ```
   node schema/validate.mjs data/<repo-name>/analysis.json --cross-refs
   ```
   Exit 0 = valid. On exit 1, read the printed errors, fix the JSON, and re-run until it
   passes. Common failures: missing required field, `additionalProperties` (a stray key),
   a string under its `minLength`, `enum` mismatch (`recentActivity` must be
   `active|moderate|dormant`; `difficulty` `easy|medium|hard`; check `category`/`kind`/
   diagram `type` enums), a bad `commitSha`/`repoUrl` format, a `learningResources` entry
   missing for a tech-stack entry (or naming one that isn't there), a resource URL that
   is not on the same documentation domain as its `official`, or an `apiSurface.actors`
   entry no route requires (or a route requiring an actor no entry describes).

2. **Edge integrity** (the schema does NOT enforce this — you must):
   ```
   node .claude/skills/onboard/edges-check.mjs data/<repo-name>/analysis.json
   ```
   Exit 0 = every `edge.from`/`edge.to` resolves to a node id and node ids are unique. On
   exit 1, fix the dangling references (add the missing node or correct the id) and re-run.

Do not finish until **both** commands exit 0.

## Step 7 — Cleanup & report

- If you created a temp clone, delete `<tmp>/onboard-<repo-name>/`. Never delete or modify a
  local repo the user pointed you at.
- Report: the output path `data/<repo-name>/analysis.json`, the headline pre-pass numbers
  (files, LOC, top languages, top churn files), that both validation gates passed, and a
  one-line summary of what the repo is.

---

## Quality checklist (self-review before reporting)

- [ ] `stats` numbers are verbatim from the pre-pass; `commitSha`/`repoUrl` correct.
- [ ] Every architecture claim, tour step, and codebase-map note is traceable to a file you
      actually read; all cited paths and tour line ranges are real.
- [ ] At least one architecture diagram, and diagrams mirror real imports/boundaries.
- [ ] Tour is ordered pedagogically with genuine `why` rationale — not just a file list.
- [ ] Hotspots come from real churn data with insight that helps a newcomer.
- [ ] Setup commands actually exist (checked against manifest scripts / README / CI).
- [ ] No generic filler that would be true of any repo.
- [ ] `apiSurface` is present only if this repo really serves routes — and if it is, every
      route it serves is listed, not a selection.
- [ ] If `apiSurface.actors` is present, the join holds both ways: every actor described is
      required by a route, every actor a route requires is described, machine callers
      included.
- [ ] `node schema/validate.mjs …` exits 0 AND `node …/edges-check.mjs …` exits 0.
