# Produce `analysis.json` for {{REPO_NAME}}

You are an AI coding agent producing a **Repo Onboarding `analysis.json`** — the
complete, self-describing document that the Repo Onboarding viewer renders
directly into an interactive onboarding site.

**The UI is a pure function of this JSON. Your analysis IS the product.** Shallow
or generic output is a failure even when it passes validation. The schema's
`minLength` / `minItems` are a floor, never a target.

- Repository under analysis: `{{REPO_PATH}}`
- Facts already computed for you: `{{PREPASS_PATH}}`
- The schema you must conform to: `{{SCHEMA_PATH}}` (JSON Schema draft 2020-12)
- Write your output to: **`analysis.json` at the repository root**

Work through the steps below in order. Do not skip the pre-pass and do not invent
numbers.

---

## Step 1 — Read the facts and the schema

A deterministic pre-pass has already computed the hard, verifiable facts about
this repo. **Read `{{PREPASS_PATH}}` in full first** and treat its numbers as
authoritative. It gives you:

- `stats` — `totalFiles`, `totalLoc`, and `languages[]` with
  `{ language, files, loc, percentage }`.
- `primaryLanguage`, `largestFiles[]`.
- `git` — `isRepo`, `headSha`, `remoteUrl`, `branch`, `commitsAnalyzed`, and
  `topChurn[]` (`{ path, commits, lastCommitDate, lastCommitDaysAgo, recentActivity }`).
- `manifests[]` — parsed dependencies per ecosystem, plus npm `scripts`.
- `notable` — README, license, entry-point hints, CI configs, container files.
- `fileTree` — the ignore-filtered tree (`node_modules` / `.git` / build dirs
  already excluded).

Then **read the schema at `{{SCHEMA_PATH}}`** so you target the exact structure,
required fields, enums, and length floors the viewer expects.

### Hard rules on the numbers (the quality core — do not violate)

- `metadata.stats.totalFiles`, `totalLoc`, and every `languages[]` entry MUST be
  copied **verbatim** from the pre-pass. Do not recount, round, or estimate.
- `metadata.commitSha` = `git.headSha` (or `null` if not a git checkout).
  `metadata.repoUrl` = `git.remoteUrl` (or `null` for a local-only path).
- `hotspots.entries[]` MUST be built from `git.topChurn`: use its `path`,
  `commits`, and `recentActivity` **as-is**; you add the `insight` (why it's hot,
  what it tells a newcomer) and the overall `interpretation`. Pick the ~5–8 most
  instructive churn files (skip pure lockfile / generated noise when a source
  file is more telling).
- `metadata.primaryLanguage` is usually the pre-pass `primaryLanguage`, but use
  judgment: if generated fixtures or vendored data skew the raw top-by-LOC, pick
  the language a human would call primary. `stats.languages` stays verbatim
  regardless.
- If `git.isRepo` is `false` there is no churn data — you must still populate
  `hotspots` with at least one entry using structural reasoning (largest /
  most-central files, `commits: 0`, `recentActivity: "dormant"`) and say so
  honestly in `interpretation`.

**Anti-filler bar:** no sentence that would be true of "any repo of this kind".
If a claim isn't traceable to a file you read or a pre-pass number, cut it or go
read the file.

---

## Step 2 — Decide how to read the code

Look at `stats` from the pre-pass.

- **Below threshold** (≤ 400 source files AND ≤ 50,000 LOC): read the code
  directly yourself.
- **At or above threshold** (> 400 files OR > 50,000 LOC): if your environment
  supports parallel subagents, partition the repo into 3–6 subsystems using the
  `fileTree` and top-level directories, and fan out — one subagent per subsystem,
  each briefed to identify its responsibility, entry points, key files (with real
  line ranges for the 2–3 most important), its public interface, what it imports
  from other subsystems and what imports it, and any notable patterns. Then
  synthesize their briefs into one analysis yourself; cross-subsystem edges come
  from the "imports / imported-by" facts each reports. **If your environment has
  no subagents, read sequentially instead**, prioritizing entry points and the
  highest-churn files and sampling breadth across subsystems.

Either way, ground **every** claim in files you actually read. Cite real
repo-relative paths. Every tour line range must be real — open the file and
confirm the lines.

---

## Step 3 — Read with real depth

Reading order:

1. **README** (`notable.readme`) and **manifests** — what it claims to be, its
   scripts, its dependencies. Cross-check claims against code; READMEs go stale.
2. **Entry points** (`notable.entryHints`; `main` / `index` / `server` / `cli`)
   — trace how the program starts and wires itself together.
3. **Follow the dependency structure** from entry points inward: imports, the
   core domain, then adapters / infrastructure / IO at the edges. Note module
   boundaries as you go.
4. **Hot files** (`git.topChurn`) — churn reveals where the real complexity and
   active work live.
5. **Tests** — often the clearest executable spec of intended behavior.

---

## Step 4 — Extract each schema section as you read

- **`pitch`** — `summary` (≥ 80 chars, real substance: what it is and does),
  `audience`, and a `techStack[]` (≥ 3) where each `role` says what that tech
  does *in THIS repo* (from the manifests + how it's actually used), never a
  generic definition. `category` is one of the schema's enums.
- **`architecture[]`** (2–4 sections) — an ordered narrative of the real design
  (layers, boundaries, data flow, key patterns). **At least one section MUST
  carry a Mermaid `diagram`**, and diagrams must reflect **actual imports /
  boundaries you saw in code**, not an idealized textbook picture. Prefer
  `flowchart` for module / layer structure, `sequence` for a key request / data
  flow, `er` for the persistence model; multiple diagrams is better.
  **Diagram sources must NOT contain `;` inside statement / label / message
  text** — Mermaid treats `;` as a statement separator and the diagram fails to
  render. Use commas, arrows (`→`), or "then" instead (e.g. `BEGIN → insert →
  COMMIT`, not `BEGIN; insert; COMMIT`).
- **`dependencyGraph`** — `nodes[]` (≥ 3) for the important internal modules
  (with repo-relative `path`), key external packages (from manifests), and
  external services / datastores; `edges[]` (≥ 1) for the real relationships
  (`imports` / `calls` / `reads from` / `implements`). **Every `edge.from` and
  `edge.to` MUST reference an existing `node.id`, and node ids must be unique** —
  this is checked at validation time. Keep it the meaningful graph, not every
  file.
- **`codebaseMap[]`** (≥ 3) — annotate the notable directories / paths:
  `purpose` (what lives here and why), `role` (core domain / entrypoint /
  adapter / config / tests / supporting), and `keyFiles[]` with one-line notes.
- **`tour[]`** (≥ 3, aim for 5–8) — the pedagogically ordered heart of
  onboarding. Order steps so each builds on the last (foundational concepts → the
  spine that ties the layers together → the edges). `why` explains why read THIS
  at THIS point (the ordering rationale, ≥ 40 chars); `notice` says what to
  specifically take away (≥ 40 chars). Use real `startLine` / `endLine` when
  pointing at a specific region.
- **`setup`** — `prerequisites`, `setup`, `run`, `test` steps with real commands
  derived from the manifests / scripts / README / CI (`notable.ciConfigs`), each
  step titled, `notes` for gotchas. Do not invent scripts that don't exist —
  check `manifests[].scripts`.
- **`hotspots`** — see the Hard rules in Step 1.
- **`firstTasks[]`** (≥ 2, aim for 3–4) — concrete, real tasks referencing real
  files, each with a `difficulty` (`easy` / `medium` / `hard`) and a `rationale`
  for why it's a good newcomer task. Range easy → hard.

---

## Step 5 — Emit `analysis.json` at the repository root

Write the document to **`analysis.json` in the root of `{{REPO_PATH}}`** (NOT in
a subdirectory). Constants:

- `schemaVersion`: `"{{SCHEMA_VERSION}}"`
- `metadata.analyzerVersion`: `"{{ANALYZER_VERSION}}"`
- `metadata.analyzedAt`: the current time in UTC, RFC 3339
  (e.g. `2026-01-15T14:22:05Z`)

Fill `metadata.stats`, `commitSha`, and `repoUrl` from the pre-pass per Step 1.

---

## Step 6 — Validate and fix until green

Run:

```
{{VALIDATE_COMMAND}}
```

This checks the JSON Schema **and** dependency-graph edge integrity in one pass.
Exit `0` means both pass. On failure it prints each issue with its JSON path,
what was expected, and what it got. Common failures: a missing required field, a
stray key (`additionalProperties`), a string under its `minLength`, an `enum`
mismatch (`recentActivity` must be `active` / `moderate` / `dormant`;
`difficulty` `easy` / `medium` / `hard`), a bad `commitSha` / `repoUrl` format,
or a dangling edge that references a non-existent node id.

**Fix every issue and re-run until it exits `0`.** Do not stop early.

When it passes, publish with a token from `{{SITE_URL}}/account`:

```
{{UPLOAD_COMMAND}}
```

---

## Quality checklist (self-review before you finish)

- [ ] `stats` numbers are verbatim from the pre-pass; `commitSha` / `repoUrl` correct.
- [ ] Every architecture claim, tour step, and codebase-map note is traceable to
      a file you actually read; all cited paths and tour line ranges are real.
- [ ] At least one architecture diagram, and diagrams mirror real imports / boundaries.
- [ ] Tour is ordered pedagogically with genuine `why` rationale — not just a file list.
- [ ] Hotspots come from real churn data (or honest structural reasoning) with
      insight that helps a newcomer.
- [ ] Setup commands actually exist (checked against manifest scripts / README / CI).
- [ ] No generic filler that would be true of any repo.
- [ ] `{{VALIDATE_COMMAND}}` exits `0`.
