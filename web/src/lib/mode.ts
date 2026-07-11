/**
 * Dual-mode switch. The whole app runs in one of two modes:
 *
 *  - "local"  (default): filesystem fixtures over `../data/*`, no Clerk, no DB,
 *             no Blob. Works with zero environment variables.
 *  - "cloud":  Clerk auth + Neon Postgres (metadata) + Vercel Blob (payloads),
 *             with per-user access control.
 *
 * Mode is resolved from the environment and is stable for the lifetime of the
 * process. `APP_MODE` forces a mode; otherwise cloud mode is auto-detected by
 * the presence of every required key. This lets a fresh checkout with no keys
 * behave exactly like WP3, and a fully-provisioned deployment "just work".
 *
 * This module is intentionally dependency-free so it is safe to import from
 * Edge middleware, server components, route handlers and client components
 * alike (it only reads `process.env`).
 */

/** The required cloud-mode keys. All must be present for auto-detection. */
const CLOUD_KEYS = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "DATABASE_URL",
  "BLOB_READ_WRITE_TOKEN",
] as const;

/** True when the app should run in cloud (auth + DB + Blob) mode. */
export function isCloudMode(): boolean {
  const explicit = process.env.APP_MODE?.trim().toLowerCase();
  if (explicit === "cloud") return true;
  if (explicit === "local") return false;
  // Auto-detect: cloud only when every key is present and non-empty.
  return CLOUD_KEYS.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.length > 0;
  });
}

export type AppMode = "local" | "cloud";

/** The active mode as a string, handy for rendering / logging. */
export function appMode(): AppMode {
  return isCloudMode() ? "cloud" : "local";
}
