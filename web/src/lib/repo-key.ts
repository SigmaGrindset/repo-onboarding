/**
 * Repo lineage key.
 *
 * A stable string that groups the analyses of one repository into a lineage
 * ("versions"). The lineage is (ownerId, repoKey) — this key is NOT owner-scoped
 * on its own; the owner id is always paired with it at the query layer, so two
 * users analyzing the same repo keep separate lineages.
 *
 * Trade-off (accepted): a repo with a remote URL groups by that URL, which is
 * stable across clones and renames. A local-only repo (no URL) groups by its
 * name instead, so renaming a local repo forks the lineage into a new one — the
 * old versions stay under the old name. This is deemed acceptable: local-only
 * onboarding is the uncommon path, and the `name:` prefix keeps the two key
 * spaces disjoint so a URL-shaped repo name can never collide with a real URL.
 *
 * Pure module — no imports, no side effects. The two `replace` regexes mirror
 * the SQL backfill in migration 0002 exactly (`^https?://(www\.)?` and
 * `(\.git)?/*$`); keep the two in sync.
 */

/** Stable lineage key for a repo. NOT owner-scoped; lineage = (ownerId, repoKey). */
export function repoKeyFor(repoUrl: string | null, repoName: string): string {
  if (repoUrl && repoUrl !== "") {
    return repoUrl
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/(\.git)?\/*$/, "");
  }
  return "name:" + repoName.trim().toLowerCase();
}
