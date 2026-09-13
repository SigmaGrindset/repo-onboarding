---
name: verify
description: How to build, launch, and drive the Repo Onboarding web app (web/) for runtime verification.
---

# Verifying the Repo Onboarding web app

The Next.js app is in `web/` (repo root package.json is only the schema validator).

## Build / launch

- `cd web && npm run build` — production build (Turbopack).
- **A user dev server often already runs on port 3000** (cloud mode via `.env.local` Clerk/Neon/Blob keys). Next 16 refuses a second `next dev` in the same dir ("Another next dev server is already running"), so don't try.
- To get your own server without killing theirs: `APP_MODE=local npx next start -p 3001` after a build. `APP_MODE=local` forces filesystem-fixture mode (`web/src/lib/mode.ts`) — no auth, home page lists analyses from `data/*` (e.g. `/analysis/express`, `/analysis/sample`).
- Signed-out cloud-mode home lists only the public demo (`/analysis/epic-stack`, see `web/src/lib/demo.ts`); every other analysis needs sign-in, so use local mode to reach them.

## Driving it

- Playwright 1.60 is installed globally: `require("C:/Users/user/AppData/Roaming/npm/node_modules/playwright")` from a `.cjs` script (no local install).
- Good surfaces: `/analysis/<id>/architecture` (Mermaid diagrams, `.diagram-canvas svg`; each render gets a fresh `mmd-*` id — wait for the id to change to detect a re-render), `/analysis/<id>` (tech-stack badges), `/analysis/<id>/graph` (d3 SVG).
- Theme: resolved theme lives on `<html data-theme>`, stamped pre-paint by an inline script in `web/src/app/layout.tsx`; toggle button is in the header (`aria-label*="Switch to"`).

## Gotchas

- **`npm run build` corrupts a live dev server.** Build and dev share `web/.next`; building while the user's `next dev` runs clobbers state its render workers reference, and the *next* page they open dies with "Jest worker encountered 2 child process exceptions" (happened 2026-07-14). After any build, tell the user their dev server needs a restart (`Ctrl+C`, `npm run dev`; if still broken, delete `.next` first).
- The long-running user dev server has missed rapid successive file edits before (served an intermediate compile). A real content change to the file forces a recompile; a bare mtime touch does not.
- Dev server log: `web/.next/dev/logs/next-development.log` (JSON lines). Its timestamps look like clock times but are **uptime** (elapsed since server start) — correlate with wall clock via the server start time.
- **`NEXT_DIST_DIR=<new dir> next build` edits `web/tsconfig.json`**: Next appends `<dir>/types/**/*.ts` and `<dir>/dev/types/**/*.ts` to `include`. Reuse an existing dist dir or revert the file afterwards, and delete the dist dir — not every `.next-*` name is gitignored.
- In Playwright, `innerText` applies CSS `text-transform` (the `kicker` class uppercases), so assert on `textContent`. After a client-side navigation into an analysis, its loading skeleton renders first — wait for `aside h2` before reading the sidebar, or an "X is absent" check passes vacuously.
- To see what a deploy carries, read `<distDir>/server/app/**/*.nft.json`. Tracing starts at the repo root (`outputFileTracingRoot` in `next.config.ts`), so `data/` fixtures and `schema/` show up there as relative paths.
