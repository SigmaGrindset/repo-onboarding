/**
 * Canonical public origin. Used as the Next.js `metadataBase` so that
 * file-convention OG/Twitter image URLs (and any other relative metadata URLs)
 * resolve to absolute links a social crawler can actually fetch.
 *
 * Resolution order:
 *  1. `NEXT_PUBLIC_SITE_URL` — an explicit override for a custom domain.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's *stable* production alias
 *     (e.g. `repo-onboarding-tau.vercel.app`), so shared image URLs stay
 *     constant across deployments instead of pointing at a per-deploy URL.
 *  3. `http://localhost:3000` — local dev fallback.
 *
 * Dependency-free (reads only `process.env`) so it is safe to import anywhere.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;

  return "http://localhost:3000";
}
