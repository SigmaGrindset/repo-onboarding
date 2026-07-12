/**
 * Freshness of an analysis relative to the analyzed repo's default branch.
 *
 * One GitHub compare call (`{analyzedSha}...HEAD`) returns `ahead_by`: how
 * many commits the default branch has gained since the analysis. Wrapped in
 * unstable_cache (1h) because the analysis layout renders with force-dynamic,
 * which opts every fetch in its tree out of the data cache. Failures cache as
 * null so a rate-limited or private repo is not re-queried on every view.
 */
import { unstable_cache } from "next/cache";
import { parseGitHubRepo } from "./github";

const fetchCommitsBehind = unstable_cache(
  async (owner: string, repo: string, sha: string): Promise<number | null> => {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub rejects requests without a User-Agent.
      "User-Agent": "repo-onboarding",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(sha)}...HEAD?per_page=1`,
        { headers, signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { ahead_by?: number };
      return typeof body.ahead_by === "number" ? body.ahead_by : null;
    } catch {
      return null;
    }
  },
  ["commits-behind"],
  { revalidate: 3600 },
);

/**
 * Commits on the default branch since the analyzed sha, or null when it
 * cannot be known (non-GitHub URL, unknown sha, API failure, rate limit).
 */
export async function getCommitsBehind(
  repoUrl: string | null,
  commitSha: string | null,
): Promise<number | null> {
  const gh = parseGitHubRepo(repoUrl);
  if (!gh || !commitSha) return null;
  return fetchCommitsBehind(gh.owner, gh.repo, commitSha);
}

/** Whole days elapsed since an ISO date-time; 0 for unparseable or future. */
export function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export type StalenessTier = "fresh" | "aging" | "stale";

const TIER_ORDER: StalenessTier[] = ["fresh", "aging", "stale"];

/** Worse of age-based and drift-based staleness; age alone when drift is unknown. */
export function stalenessTier(
  daysOld: number,
  commitsBehind: number | null,
): StalenessTier {
  const byAge: StalenessTier =
    daysOld <= 14 ? "fresh" : daysOld <= 60 ? "aging" : "stale";
  if (commitsBehind === null) return byAge;
  const byDrift: StalenessTier =
    commitsBehind <= 10 ? "fresh" : commitsBehind <= 100 ? "aging" : "stale";
  return TIER_ORDER.indexOf(byDrift) > TIER_ORDER.indexOf(byAge)
    ? byDrift
    : byAge;
}
