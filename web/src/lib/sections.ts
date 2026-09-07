/**
 * The canonical registry of analysis sections. Single source of truth for the
 * sidebar nav (which adds icons), the command-palette search index and the
 * Markdown export. `slug` is the path segment under /analysis/[id]; "" is the
 * overview.
 *
 * Which of these a reader is shown is a property of the document, not a
 * constant — derive it with `visibleSections`.
 */

import type { Analysis, SchemaVersion } from "@schema/analysis";

/**
 * Every section slug there is. Naming them as a type rather than as plain
 * strings is what makes the slug-keyed maps elsewhere exhaustive: adding a
 * section here fails the build until the nav has an icon for it and the
 * Markdown export has said whether it renders one.
 */
export type SectionSlug =
  | ""
  | "architecture"
  | "graph"
  | "map"
  | "api"
  | "design"
  | "guide"
  | "tour"
  | "hotspots"
  | "setup"
  | "delivery"
  | "learn"
  | "tasks"
  | "versions";

/** The half of a section entry that does not depend on its class. */
interface SectionBase {
  slug: SectionSlug;
  label: string;
}

/**
 * A section every analysis document is expected to carry. Always shown: one
 * missing from a document is a gap, and the page says so and invites the
 * reader to regenerate.
 */
interface CoreSection extends SectionBase {
  class: "core";
}

/**
 * A section only some repositories have anything to put in. Shown exactly when
 * `key` is present in the document, and otherwise absent entirely — no tab, no
 * empty state. See `docs/adr/0004-sections-are-declared-by-presence.md`.
 */
export interface SpecializedSection extends SectionBase {
  class: "specialized";
  /** The top-level document key whose presence declares this section. */
  key: keyof Analysis;
  /**
   * The contract version that introduced this section. Nothing the viewer
   * renders depends on it — presence alone decides that — but a comparison of
   * two documents does: a document declaring an older contract could not have
   * carried the key, so its silence is the contract's and not the
   * repository's. See `canExpressSection`.
   */
  since: SchemaVersion;
}

export type AnalysisSection = CoreSection | SpecializedSection;

/**
 * Every section that exists, in reading order — not every section a given
 * document shows. Consumers that need the whole set regardless of any one
 * document (recognising a slug from a URL, keying a per-section map) read this
 * directly; consumers rendering a document derive from `visibleSections`.
 */
export const ANALYSIS_SECTIONS: AnalysisSection[] = [
  { slug: "", label: "Overview", class: "core" },
  { slug: "architecture", label: "Architecture", class: "core" },
  { slug: "graph", label: "Dependency Graph", class: "core" },
  { slug: "map", label: "Codebase Map", class: "core" },
  // Specialized sections join the structural block after the codebase map,
  // interleaved by meaning rather than grouped by class — see ADR 0004.
  {
    slug: "api",
    label: "API Surface",
    class: "specialized",
    key: "apiSurface",
    // The contract is still labelled 1.2.0 until the release ticket bumps it,
    // so documents this repository generates today carry a surface and declare
    // 1.2.0 anyway. `canExpressSection` reads presence first for exactly that
    // reason; until the bump lands, two 1.2.0 documents cannot be told apart
    // from two that predate the section, and neither is called a removal.
    since: "1.3.0",
  },
  {
    slug: "design",
    label: "Design System",
    class: "specialized",
    key: "designSystem",
    // After the API surface rather than beside Delivery: both describe what a
    // repository is made of, and grouping the specialized sections together
    // would organise the nav around a distinction a reader cannot see.
    //
    // 1.4.0 is unreleased until the release ticket bumps the contract, so — as
    // with the API surface above — a document generated today carries a design
    // system and still declares 1.2.0. Presence is read first for exactly that
    // reason, and nothing calls such a document a removal.
    since: "1.4.0",
  },
  { slug: "guide", label: "Contributor Guide", class: "core" },
  { slug: "tour", label: "Guided Tour", class: "core" },
  { slug: "hotspots", label: "Hotspots", class: "core" },
  { slug: "setup", label: "Setup", class: "core" },
  {
    slug: "delivery",
    label: "Delivery",
    class: "specialized",
    key: "delivery",
    // Straight after setup rather than beside the other two specialized
    // sections: setup is how the repository runs locally, delivery is how it
    // runs everywhere else, and a reader meets them in that order.
    //
    // 1.5.0 is unreleased until the release ticket bumps the contract, so — as
    // with the two above — a document generated today carries a delivery
    // section and still declares 1.2.0. Presence is read first for exactly
    // that reason, and nothing calls such a document a removal.
    since: "1.5.0",
  },
  { slug: "learn", label: "Learn", class: "core" },
  { slug: "tasks", label: "First Tasks", class: "core" },
  { slug: "versions", label: "Versions", class: "core" },
];

/**
 * Whether one section is shown for one document. A core section always is; a
 * specialized section is shown exactly when the document declares it by
 * carrying its key. An explicit `null` counts as absent — ADR 0004 rejected
 * null as a way to say "considered and not applicable", so a document that
 * writes one is saying nothing the viewer should render a tab for.
 */
export function isSectionVisible(
  section: AnalysisSection,
  analysis: Analysis,
): boolean {
  return section.class === "core" || analysis[section.key] != null;
}

/**
 * The ordered sections visible for one analysis document: every core section,
 * plus the specialized sections whose key the document carries. Pure, so the
 * nav, the search index and the Markdown export can all derive from it and
 * cannot disagree about which sections exist or in what order.
 */
export function visibleSections(analysis: Analysis): AnalysisSection[] {
  return ANALYSIS_SECTIONS.filter((s) => isSectionVisible(s, analysis));
}

/**
 * The specialized sections, in registry order. Anything that has to reason
 * about specialized sections as a class — the version diff does — reads this
 * rather than naming any one of them, so a section added to the registry above
 * is covered without a second edit.
 */
export const SPECIALIZED_SECTIONS: SpecializedSection[] =
  ANALYSIS_SECTIONS.filter(
    (s): s is SpecializedSection => s.class === "specialized",
  );

/** `[major, minor, patch]`, or null when the string is not a plain semver. */
function parseSchemaVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Order two `schemaVersion` strings: negative when `a` is the older contract,
 * positive when it is the newer, 0 when they are the same. A string this cannot
 * parse sorts before every one it can, which is the conservative reading — see
 * `canExpressSection`.
 *
 * The published command-line package carries its own comparator
 * (`compareVersions` in `cli/src/util.mjs`), which cannot be imported from here
 * and is deliberately lenient — it reads a malformed segment as 0. This one is
 * strict instead, because it is answering a different question: what a document
 * failed to say, rather than which release is newer.
 */
export function compareSchemaVersions(
  a: SchemaVersion,
  b: SchemaVersion,
): number {
  const pa = parseSchemaVersion(a);
  const pb = parseSchemaVersion(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * Whether a document's contract is new enough to have carried a specialized
 * section — the difference between "this repository has no design system" and
 * "this document was written before design systems existed". ADR 0004 rules out
 * a document saying which of those it means, so the contract version is the
 * only thing that can tell them apart.
 *
 * Presence wins over the declared version: a document carrying the key has
 * plainly expressed the section whatever version it claims, which is what makes
 * this safe to use on documents written while a section was still unreleased.
 * Only absence is read against `since`, and an unparseable `schemaVersion`
 * counts as too old, so nothing downstream claims a repository lost a section
 * on the strength of a version string it could not read.
 */
export function canExpressSection(
  analysis: Analysis,
  section: SpecializedSection,
): boolean {
  return (
    analysis[section.key] != null ||
    compareSchemaVersions(analysis.schemaVersion, section.since) >= 0
  );
}
