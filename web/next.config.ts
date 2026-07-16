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
};

export default nextConfig;
