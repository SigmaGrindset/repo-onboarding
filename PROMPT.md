# Repo Onboarding — Build Brief

> **How to launch:** open a fresh Claude Code session in this directory with **Fable 5 / high effort** as the model (already the default), then send:
> `Follow the instructions in @PROMPT.md`

---

## Mission

Build **Repo Onboarding** in this directory: a tool that turns any GitHub repo into a rich, interactive onboarding website. It has two halves joined by a strict data contract:

1. **Analysis engine** — a Claude Code skill (`/onboard`) that deep-analyzes a repo locally and produces a structured `analysis.json`.
2. **Presentation engine** — a Next.js web app that renders any `analysis.json` as an onboarding site (diagrams, dependency graph, guided reading tour), with auth and per-user server-side storage.

---

## Orchestration policy (non-negotiable)

**You, the orchestrator, are Fable 5 at high effort. You never write implementation code yourself.** Your jobs are: decompose work into packages, write precise self-contained subagent briefs, review and QA every deliverable, integrate, and report progress to the user.

**All implementation is delegated to Opus 4.8 subagents at high or xhigh effort.**

### First action: create the implementer agent definitions

Create two agent definitions so implementation runs on Opus 4.8 at pinned effort:

- `.claude/agents/impl-opus-high.md` — frontmatter: `model: opus`, effort **high**. General implementation work.
- `.claude/agents/impl-opus-xhigh.md` — frontmatter: `model: opus`, effort **xhigh**. Reserved for the hardest, design-heavy work.

If the effort frontmatter key errors or is ignored, verify the exact key against the Claude Code docs (use the `claude-code-guide` agent), and as a last resort fall back to the Agent tool's `model: "opus"` override with effort instructions in the brief.

### Delegation rules

- **Never use `fork` subagents for implementation** — forks inherit the parent model (Fable), which violates this policy. Forks are acceptable only for your own QA/review legwork.
- Subagent briefs must be **self-contained**: subagents start cold, so every brief must include full context (what the project is, relevant decisions from this document), exact file paths, the applicable acceptance criteria, and what "done" looks like.
- For fixes and iterations, **continue the same agent via SendMessage** (its context is intact) rather than respawning a new one.

### QA protocol (you run this after every work package)

1. Read the full diff the subagent produced.
2. Run build / typecheck / tests and report results honestly.
3. Exercise the deliverable for real: start the dev server and look at pages, run the script against real input — not just tests.
4. Check every acceptance criterion for the work package explicitly.
5. Send defects back to the same agent with precise findings; re-verify after fixes.
6. Only then commit and move to the next package.

---

## Project context (decisions already made — do not relitigate)

- **Why local:** the analysis must run *inside a Claude Code session* so it uses the user's Opus 4.8 Pro **subscription**. A web backend calling the Anthropic API would be pay-per-token and couldn't use the subscription — that limitation is exactly why the user's previous fully-online version produced weak, shallow analyses. The model doing the analysis here IS the product's quality.
- **Two-piece architecture:** analysis engine (Claude Code skill) ↔ presentation engine (Next.js app), joined by `analysis.json`. The UI is a pure function of the JSON — no model calls in the web app.
- **Quality levers** that fix the old version's lackluster output:
  - A **deterministic pre-pass** (script) that computes real facts — file tree, LOC, language breakdown, dependency manifests, git churn — and feeds them to the model so the narrative is grounded in numbers, not vibes. This is the single biggest quality lever.
  - **Parallel subagent fan-out** across subsystems for large repos, then synthesis.
  - An **opinionated schema** that forces depth (see WP1) — the model must fill every section; generic summaries are schema violations.
- **Stack:** Next.js (App Router), Clerk (auth), Neon Postgres via Drizzle (metadata/ownership), Vercel Blob **private** (the `analysis.json` payloads). All to be provisioned through the Vercel Marketplace later — build against stubs first.
- **Data model** (designed so sharing lands later with zero rework):
  - `analyses`: `id, owner_id, repo_name, repo_url, blob_key, summary, created_at`
  - `analysis_access`: `analysis_id, user_id, role ('owner' | 'viewer')`
  - Every upload inserts one `analysis_access` row (`owner`). Future sharing = inserting `viewer` rows. The access check ("may this user read this analysis?") is written **once**, now, and used on every read path.
- **Privacy:** only the uploading user can see their analyses. Sharing is a future feature — the schema supports it today, but build **no sharing UI** yet.

---

## Work packages (delegate each; effort level specified)

Execute in order. Each package ends with your QA protocol and a git commit.

### WP1 — `analysis.json` schema (impl-opus-**xhigh**)

The contract everything else depends on. Deliverables:

- A JSON Schema (`schema/analysis.schema.json`) and matching TypeScript types (`schema/analysis.ts`).
- Required sections: elevator pitch + tech stack; architecture narrative with Mermaid diagram sources; module/dependency graph data (nodes + edges, internal and external); annotated codebase map (directories with purpose annotations); **guided reading tour** (ordered steps, each with file references and *why this file, in this order*); git-churn hotspots; setup/run/test instructions; suggested first tasks for a new contributor.
- A realistic, clearly-labeled hand-written sample fixture (`data/sample/analysis.json`) that validates against the schema — rich enough to drive UI development in WP3.

**Acceptance:** schema and types agree; fixture validates; every section above is present and structured for rendering (not blobs of prose).

### WP2 — the `/onboard` skill (impl-opus-**xhigh**)

`.claude/skills/onboard/` containing:

- A deterministic **pre-pass script** (Node or Python): file tree, LOC, language breakdown, dependency manifests, git churn. Machine-readable output.
- `SKILL.md` directing the analysis session: run the pre-pass, then deep multi-file reading grounded in its numbers; fan out subagents per subsystem for large repos; synthesize; emit `analysis.json` to `data/<repo-name>/`; **validate the output against the WP1 schema** before finishing; accept a GitHub URL (clone to a temp dir) or a local path.

**Acceptance:** pre-pass script runs standalone against a real repo and produces correct facts; SKILL.md instructions are complete enough that a cold session can execute them; output path and validation step are explicit.

### WP3 — Next.js viewer (impl-opus-**high**; escalate graph/diagram components to xhigh if needed)

Scaffold the app and render the WP1 sample fixture fully:

- Pages: repo overview (pitch, stack, key stats), architecture (rendered Mermaid diagrams + narrative), interactive dependency graph (force-directed or equivalent), codebase map, guided-tour stepper, churn-hotspots chart, setup/run/test guide.
- Must run **fully against the local fixture with auth disabled** (dev mode) so it is testable before any accounts exist.
- Index page listing available analyses (fixture-backed for now).

**Acceptance:** `npm run dev` + fixture shows every section rendering correctly; no auth or network dependencies required in dev mode; build passes.

### WP4 — auth + storage + upload (impl-opus-**high**)

- Clerk integration (middleware-protected routes), Neon Postgres via Drizzle (both tables from the data model), Vercel Blob private upload/download.
- Upload page (user submits an `analysis.json`; server validates against schema, stores payload in Blob, rows in Postgres), per-user index page (only their analyses), analysis viewer reading from Blob.
- A single **access-check helper** used by every read path (owner-only today; `viewer` rows will just work later).
- `.env.example` stubbing every required key; the app must keep running in degraded local/fixture mode without real keys where feasible.

**Acceptance:** with stub/dev config the app still works on the fixture; the code paths for auth'd upload/list/view are complete and typecheck; access checks demonstrably gate every analysis read.

### WP5 — end-to-end verification (impl-opus-**high**)

- Run the `/onboard` skill against a real, small public GitHub repo.
- Load the produced `analysis.json` through the full pipeline (validation → viewer; upload flow if keys exist by then).
- Fix integration gaps found; re-run until the pipeline is clean.

**Acceptance:** one real repo goes from URL → analysis.json → fully rendered onboarding site with no manual patching.

---

## Ground rules & stop points

- **Stop and ask the user before:** provisioning any account (Vercel, Clerk, Neon), deploying anywhere, or any billable / outward-facing action.
- **Report honestly:** failing tests are reported as failing; skipped steps are reported as skipped. No fabricated analysis data anywhere except the clearly-labeled WP1 sample fixture.
- `git init` first (this directory is not yet a repo); commit per work package with clear messages.
- Keep the user informed at work-package boundaries: what shipped, what QA found, what's next.
