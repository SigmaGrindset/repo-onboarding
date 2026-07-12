/**
 * Default Open Graph image for the site — used by the home page and any route
 * without its own `opengraph-image` (the per-analysis card at
 * `analysis/[id]/opengraph-image.tsx` takes precedence for analysis links).
 *
 * Data-free, so it is statically generated at build time and cached. In cloud
 * mode the proxy whitelists `/opengraph-image` so this brand card is fetchable
 * by anonymous social crawlers even though the rest of the app requires auth.
 */
import { renderBrandOgImage, OG_ALT, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpengraphImage() {
  return renderBrandOgImage();
}
