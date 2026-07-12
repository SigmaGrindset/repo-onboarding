import { formatDate, formatNumber, relativeDate, shortSha } from "@/lib/format";
import {
  daysSince,
  getCommitsBehind,
  stalenessTier,
  type StalenessTier,
} from "@/lib/staleness";

/* Written out in full: Tailwind v4 scans source for literal class strings. */
const DOT_CLASS: Record<StalenessTier, string> = {
  fresh: "bg-emerald-500",
  aging: "bg-amber-500",
  stale: "bg-rose-500",
};

/**
 * "Analyzed 23 days ago · 41 commits behind" — how much the repo has moved
 * since this analysis. Async (one cached GitHub call); render inside
 * <Suspense> so it streams in without blocking the page.
 */
export async function StalenessBadge({
  repoUrl,
  commitSha,
  analyzedAt,
}: {
  repoUrl: string | null;
  commitSha: string | null;
  analyzedAt: string;
}) {
  const commitsBehind = await getCommitsBehind(repoUrl, commitSha);
  const tier = stalenessTier(daysSince(analyzedAt), commitsBehind);

  const drift =
    commitsBehind === null
      ? null
      : commitsBehind === 0
        ? "up to date"
        : `${formatNumber(commitsBehind)} ${commitsBehind === 1 ? "commit" : "commits"} behind`;

  const sha = shortSha(commitSha);
  const tooltip = [
    `Analyzed ${formatDate(analyzedAt)}${sha ? ` at commit ${sha}` : ""}.`,
    commitsBehind
      ? `The default branch has ${formatNumber(commitsBehind)} newer ${commitsBehind === 1 ? "commit" : "commits"} — consider re-analyzing.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <p
      className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.68rem] text-faint"
      title={tooltip}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_CLASS[tier]}`}
        aria-hidden
      />
      <span>Analyzed {relativeDate(analyzedAt)}</span>
      {drift ? (
        <>
          <span aria-hidden>·</span>
          <span>{drift}</span>
        </>
      ) : null}
    </p>
  );
}
