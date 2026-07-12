# Repo Onboarding — viewer

Next.js (App Router) viewer that renders a repo's `analysis.json` as an
interactive onboarding site: overview, architecture narrative, dependency
graph, guided tour, churn hotspots, setup guide and first tasks.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
```

## Two modes: local and cloud

The app runs in one of two modes. **Mode is auto-detected from environment
variables**; set `APP_MODE=local|cloud` to force one.

### Local mode (default — zero configuration)

With **no** environment variables set, the app runs entirely on the filesystem:

- Analyses are read from `../data/<name>/analysis.json` (the repo-root `data/`
  directory). The bundled `sample` fixture is served out of the box.
- **No** authentication, database or blob storage. No `ClerkProvider`, and the
  proxy (middleware) is a pass-through — nothing reaches the network.
- The index lists the fixture analyses. `/upload` renders an informative
  "cloud mode not configured" state; `POST /api/analyses` returns `503`.

This is the WP3 experience, unchanged.

### Cloud mode (auth + per-user storage + upload)

When **all** of these keys are present (or `APP_MODE=cloud`), the app switches
to Clerk auth + Neon Postgres (metadata) + Vercel Blob (private payloads):

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`

In cloud mode:

- The proxy protects `/analysis/*`, `/upload` and `/api/*`. The home page `/`
  and Clerk's sign-in/sign-up flows stay public.
- The index (`/`) lists **only the signed-in user's** analyses (owned or shared
  with them), via `listAnalysesFor(userId)`.
- `/upload` accepts an `analysis.json`, validates it against
  `schema/analysis.schema.json` (Ajv, server-side), stores the payload to a
  **private** Vercel Blob, and inserts the `analyses` + owner `analysis_access`
  rows atomically. On success it redirects to the new analysis.
- The bundled filesystem fixtures (e.g. `sample`) remain reachable by direct
  link as public demos, but are **not** listed on the per-user index.

Every read of a user-uploaded analysis passes through `canReadAnalysis`
(`src/lib/access.ts`), so the moment a future "share" feature inserts a
`role='viewer'` row into `analysis_access`, that user can read the analysis with
no other code change.

### Id scheme

`/analysis/[id]` handles two id kinds side by side:

- **Fixture ids** — a filesystem path segment, e.g. `sample`.
- **Cloud ids** — `db_<uuid>`, e.g.
  `db_550e8400-e29b-41d4-a716-446655440000`. The `db_` prefix keeps the id a
  clean URL path segment (no percent-encoding) and marks it as DB + Blob backed.

## Provisioning cloud mode later

1. Copy `.env.example` to `.env.local` and fill in the keys (each is documented
   inline with where it comes from).
2. **Clerk** — provision via the Vercel Marketplace (Clerk) or clerk.com; copy
   the publishable + secret keys from the Clerk dashboard.
3. **Neon Postgres** — provision via the Vercel Marketplace (Neon); copy the
   pooled connection string into `DATABASE_URL`.
4. **Vercel Blob** — create a Blob store (Vercel dashboard → Storage → Blob);
   the `BLOB_READ_WRITE_TOKEN` is created with the store (injected automatically
   on Vercel).

On Vercel, the Marketplace integrations inject most of these automatically.

## Database migrations (cloud mode)

The Drizzle schema lives in `src/db/schema.ts`; migrations are generated under
`drizzle/`.

```bash
# Regenerate SQL from the schema (offline, no DB needed) — already committed:
npx drizzle-kit generate

# Apply the schema to the database (needs DATABASE_URL):
npx drizzle-kit push          # quick sync, good for dev
# or run the generated SQL migrations:
npx drizzle-kit migrate
```

> **Migration 0002 carries a data backfill.** It adds `repo_key` (plus
> `commit_sha` / `analyzed_at`) and then runs an `UPDATE` to backfill `repo_key`
> for existing rows. It MUST be applied with `npx drizzle-kit migrate`, which
> runs the SQL verbatim. Do NOT use `npx drizzle-kit push` here — push diffs the
> schema only and skips the `UPDATE`, leaving old rows with an empty `repo_key`.

## Architecture notes

- `src/lib/datasource.ts` — the `DataSource` seam. `resolveDataSource()` picks
  the filesystem source (local) or the Neon + Blob source (cloud); cloud modules
  are dynamically imported so local mode never evaluates Clerk/DB/Blob.
- `src/lib/cloud-datasource.ts` — cloud `DataSource`; access-checks every read
  and delegates fixture ids to the fs source.
- `src/lib/access.ts` — the single authorization chokepoint
  (`canReadAnalysis`, `isOwner`, `listAnalysesFor`).
- `src/lib/validateAnalysis.ts` — server-side Ajv validation, mirroring the
  repo-root `schema/validate.mjs` config.
- `src/proxy.ts` — dual-mode proxy (Next 16's renamed middleware convention);
  Clerk protection in cloud mode, pass-through in local mode.
