/**
 * GitHub URL helpers.
 *
 * Pure module — no imports, no side effects — so it is safe in both server
 * and client bundles (unlike staleness.ts, which pulls in next/cache).
 */

export function parseGitHubRepo(
  repoUrl: string | null,
): { owner: string; repo: string } | null {
  if (!repoUrl) return null;
  const m =
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(
      repoUrl,
    );
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * Permalink to a file at the analyzed commit, with an optional #L line
 * anchor, or null when the repo is not on GitHub or the sha is unknown.
 */
export function githubBlobUrl(
  repoUrl: string | null,
  commitSha: string | null,
  path: string,
  startLine?: number,
  endLine?: number,
): string | null {
  const gh = parseGitHubRepo(repoUrl);
  if (!gh || !commitSha) return null;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const anchor =
    startLine != null
      ? endLine != null && endLine !== startLine
        ? `#L${startLine}-L${endLine}`
        : `#L${startLine}`
      : "";
  return `https://github.com/${gh.owner}/${gh.repo}/blob/${commitSha}/${encodedPath}${anchor}`;
}
