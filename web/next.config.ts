import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root also has a package-lock.json (for the schema validator), so
  // pin Turbopack's workspace root to this app directory to avoid ambiguity.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
