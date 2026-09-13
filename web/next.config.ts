import path from "node:path";
import type { NextConfig } from "next";

/**
 * The repository root, one level above this app. Server bundles are traced from
 * here so they can carry a file from `data/` — the public demo analysis lives
 * there, outside the app. Next requires `turbopack.root` to equal
 * `outputFileTracingRoot`, so both are pinned to it; setting the root
 * explicitly is also what stops Next guessing between this app's
 * package-lock.json and the one at the repo root (for the schema validator).
 */
const repoRoot = path.join(import.meta.dirname, "..");

const nextConfig: NextConfig = {
  // Browser automation uses an isolated production output so a local-mode
  // build cannot clobber a developer's live `.next` dev-server state.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
  // Guarantee the public demo (`src/lib/demo.ts`) is in every server bundle
  // rather than relying on the tracer resolving the data source's runtime
  // path. The tracer does sweep the other fixtures in as well — the proxy, not
  // the bundle, is what keeps them private.
  outputFileTracingIncludes: {
    "/*": ["../data/epic-stack/analysis.json"],
  },
  // Send the metadata in the <head>, not streamed into the <body>.
  //
  // By default Next.js does not hold up the first flush for an async
  // `generateMetadata`: the <title> is appended to the <body> ~50KB in, and
  // React hoists it into <head> if and when the page re-renders on the client.
  // On the tour page it does re-render — reading stored progress — and the
  // hoist is a remove-then-insert that is not always in one tick, so the
  // document has NO title for up to ~300ms mid-hydration. On every other page
  // the title simply stays in the <body> for good.
  //
  // The reason to accept that is TTFB, and here it is cheap: `generateMetadata`
  // awaits `getAnalysisCached(id)`, the very same cached read the layout is
  // about to await anyway, so holding the flush costs one cache hit rather than
  // a second fetch. Measured warm on a local production build of this app,
  // /analysis/sample/tour: ~21ms -> ~30ms. `/.*/` is the documented way to opt
  // every request out of streaming metadata.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
