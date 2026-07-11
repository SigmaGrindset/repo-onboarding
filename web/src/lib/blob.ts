/**
 * Private Vercel Blob helpers for analysis.json payloads (cloud mode only).
 *
 * Payloads are stored with `access: 'private'`, so reads require the store's
 * `BLOB_READ_WRITE_TOKEN` and are never publicly reachable by URL. Server-only.
 */

import { put, get, del } from "@vercel/blob";

/** Deterministic pathname for an analysis payload. */
export function blobKeyFor(ownerId: string, uuid: string): string {
  return `analyses/${ownerId}/${uuid}.json`;
}

/** Store a JSON payload privately. Returns the pathname (our stored blob key). */
export async function putAnalysisPayload(
  key: string,
  json: string,
): Promise<string> {
  const res = await put(key, json, {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return res.pathname;
}

/** Read a private payload back as text, or null if missing. */
export async function getAnalysisPayload(key: string): Promise<string | null> {
  const res = await get(key, { access: "private" });
  if (!res || res.statusCode !== 200) return null;
  return new Response(res.stream).text();
}

/** Best-effort delete of a private payload. */
export async function deleteAnalysisPayload(key: string): Promise<void> {
  try {
    await del(key);
  } catch {
    // Swallow — the DB row is the source of truth; a stale blob is harmless.
  }
}
