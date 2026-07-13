/**
 * Fetch a single source file from GitHub at the analyzed commit.
 *
 * Used by the chat's `fetchFile` tool so the model can read real source for
 * source-level questions. `sanitizeRepoPath` / `rawFileUrl` are pure; only
 * `fetchRepoFileAtSha` touches the network, and it NEVER throws — every
 * failure (bad path, timeout, 404, binary, oversize) is returned as a tagged
 * result so the caller can hand a clean message back to the model.
 */

/** Hard cap on returned file content, in characters. Longer files are sliced. */
export const MAX_FILE_BYTES = 100_000;

/** Maximum number of file fetches allowed per chat request (enforced upstream). */
export const MAX_FETCHES_PER_REQUEST = 4;

/**
 * Normalize and validate a repo-relative path. Trims, strips a single leading
 * `./`, then rejects anything unsafe (absolute, traversal, backslashes,
 * percent-encoding, control chars, empty, or over-long). Returns the
 * normalized path, or null if it is unsafe.
 */
export function sanitizeRepoPath(input: string): string | null {
  let path = input.trim();
  if (path.startsWith("./")) path = path.slice(2);

  if (path.length === 0 || path.length > 512) return null;
  if (path.startsWith("/")) return null;
  if (path.includes("\\")) return null;
  if (path.includes("%")) return null;

  for (const ch of path) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return null;
  }

  for (const segment of path.split("/")) {
    if (segment === "." || segment === "..") return null;
  }

  return path;
}

/**
 * Build the raw.githubusercontent.com URL for a file at a commit. Every path
 * segment (and owner/repo/sha) is `encodeURIComponent`-encoded, with `/`
 * preserved as the separator — mirroring `githubBlobUrl` in `@/lib/github`.
 */
export function rawFileUrl(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${encodeURIComponent(
    owner,
  )}/${encodeURIComponent(repo)}/${encodeURIComponent(sha)}/${encodedPath}`;
}

export type FetchFileResult =
  | { ok: true; path: string; content: string; truncated: boolean }
  | { ok: false; error: string };

/**
 * Fetch a repo file at a commit from raw.githubusercontent.com. Never throws:
 * network/timeout errors, HTTP failures, binary content, and oversize files
 * are all returned as `{ ok: false, error }` (or truncated for oversize).
 */
export async function fetchRepoFileAtSha(args: {
  owner: string;
  repo: string;
  sha: string;
  path: string;
  token?: string;
}): Promise<FetchFileResult> {
  const { owner, repo, sha, path, token } = args;
  const url = rawFileUrl(owner, repo, sha, path);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, error: "Could not reach GitHub (timeout or network error)." };
  }

  if (res.status === 404) {
    return {
      ok: false,
      error: "File not found at the analyzed commit (or the repository is private).",
    };
  }
  if (!res.ok) {
    return { ok: false, error: `GitHub returned ${res.status}.` };
  }

  let text: string;
  try {
    text = await res.text();
  } catch {
    return { ok: false, error: "Could not reach GitHub (timeout or network error)." };
  }

  if (text.includes("\0")) {
    return { ok: false, error: "Binary file — cannot display." };
  }

  if (text.length > MAX_FILE_BYTES) {
    return { ok: true, path, content: text.slice(0, MAX_FILE_BYTES), truncated: true };
  }

  return { ok: true, path, content: text, truncated: false };
}
