# Work Brief: BYO-Model Analysis Pipeline

Hand this to a fresh Claude Code session in `D:\Antonio\repo-onboarding-local`. It captures decisions made 2026-07-13; treat it as the source of truth for scope.

## Project context (30 seconds)

Repo Onboarding turns a codebase into an interactive onboarding site (architecture, repo map, dependency graph, hotspots, guided tour, setup, tasks, per-repo AI chat). Two-part system:

- **Analysis engine**: the `/onboard` skill in `.claude/skills/onboard/` (`prepass.mjs` zero-dep facts script + `SKILL.md` protocol) produces `data/<repo>/analysis.json`, validated by `schema/validate.mjs` against `schema/analysis.schema.json` (draft 2020-12, schemaVersion 1.0.0).
- **Viewer**: `web/` — Next 16 App Router, Tailwind v4. Dual-mode: local (fs fixtures, no keys) and cloud (Clerk auth + Neon Postgres via Drizzle + private Vercel Blob; single access chokepoint `web/src/lib/access.ts`). Live at https://repo-onboarding-tau.vercel.app (Vercel project `repo-onboarding`, root dir `web`, auto-deploys from pushes to `main`). Browser upload exists at `/upload` (`web/src/components/UploadForm.tsx`, API under `web/src/app/api/analyses/`); it validates via `web/src/lib/validateAnalysis.ts`.

## Non-negotiable constraints

1. **$0 stack, forever.** Hobby project. Everything must fit free tiers (Vercel Hobby, Neon free, Clerk dev instance, Blob included quota). Never add anything with a bill.
2. **No hosted/server-side analysis generation.** Explicitly rejected: free-tier models produce noticeably worse analyses, and quality wins. Users generate analyses **locally with their own paid frontier models** and upload the result. Do not build generation infrastructure on the server.
3. **Quality gate = the JSON schema.** The schema validator is what protects output quality across whatever model/agent a user runs, so validation UX matters more than usual.
4. **Orchestration policy (from PROMPT.md): the main agent orchestrates and QAs only; ALL implementation is delegated to Opus subagents** (`impl-opus-high` / `impl-opus-xhigh` agent types exist in `.claude/agents/`).
5. Cloud-DB migrations: always `drizzle-kit migrate` (never `push`), and the user must explicitly approve applying anything to Neon. Never commit keys; `web/.env.local` is git-ignored.
6. Privacy rule: analyses of private repos are never committed to this repo (`data/fer-mentor/` pattern).

## What to build — 4 features

The goal: a stranger who sees a demo analysis can get their own repo in, end to end, without the app owner involved. From the user's perspective: **discover → generate → publish → recover from errors.**

### 1. Distributable analyzer (generate)

Make the analyzer runnable outside this repo, so users can run it in their own repo with their own agent (Claude Code, Cursor, Codex…).

- Preferred shape: an agent-agnostic CLI, e.g. `npx repo-onboard` — runs the deterministic pre-pass (`prepass.mjs` is already zero-dep), emits the facts + the SKILL.md analysis protocol as a prompt for whatever agent the user drives, and **validates the resulting JSON against the schema locally**, with actionable errors so the user's agent can self-correct.
- Also worth shipping the Claude Code path (installable plugin/skill) since that's the highest-quality flow today.
- Decide packaging details (npm package name, how the schema ships with it, versioning against schemaVersion) at plan time.

### 2. CLI upload with API tokens (publish)

- Token-authenticated upload endpoint so a CLI (or the user's agent) can POST the validated `analysis.json` and get back the live analysis URL.
- Tokens: per-user, created/revoked from an account page in the app; stored in a new Neon table (hash the token, show once). Uploads via token must reuse the exact same validation + versioning path as the browser upload (`repoKeyFor` lineage, version ordinals, `tour_steps` denormalization — see `web/src/lib/repo-key.ts` and migration 0002/0003 patterns).
- `repo-onboard upload <file>` in the CLI wraps this and prints the resulting URL.

### 3. "Generate your analysis" page (discover)

- A public page in the app that pitches the model — *your* agent + frontier model does the deep reading, so quality is high and it costs the app nothing — and gives exact copy-paste commands for the install → run → upload flow.
- Link it from the home page and from demo analyses. Framing: analyses produced by frontier models reading the code with full agentic depth is the differentiator, not a limitation.

### 4. Rich schema-validation errors on upload (recover)

- Both the browser upload and the token API should return precise, structured validation failures (JSON path, expected vs. got), so a user can paste them back to their agent and regenerate. Today's upload validates but check how much error detail actually reaches the user — improve to field-level.
- Same error format shared between CLI local validation, API response, and upload UI.

## Suggested order

Feature 4 → 2 → 1 → 3 (validation errors underpin everything; tokens+API before the CLI that calls them; docs page last, once the commands it documents are real).

## Verification expectations

- Headless: `npm test` in `web/` (node:test), build both modes (`APP_MODE=local` forces local), Playwright against `npx next start` on a fresh port (3007+; stale servers have squatted 3001 before — see `.claude/skills/verify/SKILL.md`).
- Anything requiring authenticated cloud writes (real uploads, token creation) must be E2E'd by the user in the browser — the environment blocks agent-side Clerk auth and direct DB+blob inserts.
- Note: an unrelated pending E2E exists (upload `express-v2.analysis.json` at `/upload` to test versioning); the token-upload work may fold into it.
