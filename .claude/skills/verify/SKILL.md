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
- Cloud-mode home has no analysis links without signing in; use local mode to reach analysis pages.

## Driving it

- Playwright 1.60 is installed globally: `require("C:/Users/user/AppData/Roaming/npm/node_modules/playwright")` from a `.cjs` script (no local install).
- Good surfaces: `/analysis/<id>/architecture` (Mermaid diagrams, `.mermaid-host svg`; each render gets a fresh `mmd-*` id — wait for the id to change to detect a re-render), `/analysis/<id>` (tech-stack badges), `/analysis/<id>/graph` (d3 SVG).
- Theme: resolved theme lives on `<html data-theme>`, stamped pre-paint by an inline script in `web/src/app/layout.tsx`; toggle button is in the header (`aria-label*="Switch to"`).

## Gotchas

- The long-running user dev server has missed rapid successive file edits before (served an intermediate compile). A real content change to the file forces a recompile; a bare mtime touch does not.
- Dev server log: `web/.next/dev/logs/next-development.log` (JSON lines).
