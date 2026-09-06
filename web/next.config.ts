import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser automation uses an isolated production output so a local-mode
  // build cannot clobber a developer's live `.next` dev-server state.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The repo root also has a package-lock.json (for the schema validator), so
  // pin Turbopack's workspace root to this app directory to avoid ambiguity.
  turbopack: {
    root: import.meta.dirname,
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
