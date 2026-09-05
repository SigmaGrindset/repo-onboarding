import type { Analysis } from "@schema/analysis";
import { githubBlobUrl } from "./github";

/**
 * The paths an analysis document names, and what it takes to link to one of
 * them. This is the whole of what the viewer knows about a repository's
 * contents: the document annotates the parts worth reading rather than listing
 * every file, so "the repository" here means "everywhere this document points".
 */
export interface RepoFileIndex {
  /** Every repo-relative path the document names, de-duplicated. */
  paths: string[];
  repoUrl: string | null;
  commitSha: string | null;
}

/** A path a diagram label turned out to name, and where to read it. */
export interface RepoFileLink {
  path: string;
  href: string;
}

export function repoFileIndex(analysis: Analysis): RepoFileIndex {
  const paths = new Set<string>();
  const add = (path: string | undefined | null) => {
    const normalised = normalise(path);
    if (normalised) paths.add(normalised);
  };

  for (const entry of analysis.codebaseMap) {
    add(entry.path);
    for (const file of entry.keyFiles ?? []) add(file.path);
  }
  for (const node of analysis.dependencyGraph.nodes) add(node.path);
  for (const step of analysis.tour) {
    for (const file of step.files) add(file.path);
  }
  for (const hotspot of analysis.hotspots.entries) add(hotspot.path);
  for (const risk of analysis.contributorGuide?.knownRisks ?? []) {
    for (const file of risk.files) add(file);
  }
  for (const route of analysis.contributorGuide?.changeRoutes ?? []) {
    add(route.primaryPath);
    for (const path of route.relatedPaths) add(path);
  }
  for (const entry of analysis.learningResources ?? []) {
    for (const file of entry.inRepo.files) add(file.path);
  }
  for (const task of analysis.firstTasks) {
    for (const file of task.files) add(file);
  }

  return {
    paths: [...paths],
    repoUrl: analysis.metadata.repoUrl,
    commitSha: analysis.metadata.commitSha,
  };
}

/**
 * The file a diagram label names, or null — which is the usual answer.
 *
 * Diagram labels are prose: measured across every analysis document in this
 * repository, two labels in twenty named a file. So this never guesses, and the
 * test is the strictest one available — a line of the label has to *be* one of
 * the paths the document names, character for character. Matching a bare
 * filename against the tail of a path would resolve `utils.js` against whichever
 * `utils.js` happened to be the only one, which is an inference; a wrong link is
 * worse than no link.
 *
 * A label whose lines name two different files resolves to neither, for the same
 * reason.
 */
export function fileLinkFor(
  label: string,
  index: RepoFileIndex | null | undefined,
): RepoFileLink | null {
  if (!index) return null;

  let found: string | null = null;
  // Line by line, because a label is frequently a path drawn over the thing
  // inside it, and the path half of that is exact.
  for (const line of label.split("\n")) {
    const candidate = normalise(line);
    if (!candidate || !index.paths.includes(candidate)) continue;
    if (found && found !== candidate) return null;
    found = candidate;
  }
  if (!found) return null;

  const href = githubBlobUrl(index.repoUrl, index.commitSha, found);
  return href ? { path: found, href } : null;
}

/** A path as the document would have written it: no `./`, no trailing slash. */
function normalise(path: string | undefined | null): string | null {
  const trimmed = path?.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  return trimmed ? trimmed : null;
}
