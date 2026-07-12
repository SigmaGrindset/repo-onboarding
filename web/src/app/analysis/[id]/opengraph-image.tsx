/**
 * Dynamic Open Graph image for an analysis. Placed at `analysis/[id]/`, so it
 * covers `/analysis/[id]` and every sub-route (tour, graph, hotspots, …) — any
 * shared link to an analysis unfurls with this card.
 *
 * The generated `og:image` URL is `/analysis/<id>/opengraph-image`, which the
 * proxy's public matcher allows for `st_` share links (token = capability), so
 * unlisted links unfurl without auth. `db_` (private) ids stay behind Clerk, so
 * their images are never fetchable by an anonymous crawler — as intended.
 *
 * Runs on the Node runtime (default) because resolving the analysis may touch
 * the filesystem, Neon and Blob. `force-dynamic` keeps the image in step with
 * cloud data and avoids any build-time prerender of dynamic ids.
 */
import { renderAnalysisOgImage, OG_ALT, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const dynamic = "force-dynamic";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return renderAnalysisOgImage(id);
}
