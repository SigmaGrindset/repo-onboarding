/**
 * Id scheme. Two kinds of analysis id coexist in the same `/analysis/[id]`
 * route so that fixtures and user uploads never collide:
 *
 *  - Fixture ids   — a single filesystem path segment, e.g. `sample`. Read from
 *                    `../data/<id>/analysis.json`. Public demo content.
 *  - Cloud ids     — `db_<uuid>`, e.g. `db_550e8400-e29b-41d4-a716-446655440000`.
 *                    The `db_` prefix marks a database/blob-backed analysis; the
 *                    remainder is the `analyses.id` (a v4 UUID).
 *
 * A `db_`-prefixed id is chosen over `db:<uuid>` so the id stays a clean URL
 * path segment (no percent-encoding) and passes the existing fixture-safe
 * character class `[A-Za-z0-9._-]`.
 */

export const CLOUD_ID_PREFIX = "db_";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `id` addresses a cloud (DB + Blob) analysis. */
export function isCloudId(id: string): boolean {
  return id.startsWith(CLOUD_ID_PREFIX);
}

/** Build the public route id for a database uuid. */
export function toCloudId(uuid: string): string {
  return `${CLOUD_ID_PREFIX}${uuid}`;
}

/**
 * Extract and validate the DB uuid from a cloud id. Returns null when `id` is
 * not a cloud id or the uuid is malformed — callers treat null as "not found",
 * which keeps malformed ids from ever reaching a query.
 */
export function uuidFromCloudId(id: string): string | null {
  if (!isCloudId(id)) return null;
  const uuid = id.slice(CLOUD_ID_PREFIX.length);
  return UUID_RE.test(uuid) ? uuid : null;
}
