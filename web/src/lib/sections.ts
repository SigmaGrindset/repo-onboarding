/**
 * The canonical registry of analysis sections. Single source of truth for the
 * sidebar nav (which adds icons), the command-palette search index and the
 * Markdown export. `slug` is the path segment under /analysis/[id]; "" is the
 * overview.
 *
 * Which of these a reader is shown is a property of the document, not a
 * constant — derive it with `visibleSections`.
 */

import type { Analysis } from "@schema/analysis";

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
  | "guide"
  | "tour"
  | "hotspots"
  | "setup"
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
interface SpecializedSection extends SectionBase {
  class: "specialized";
  /** The top-level document key whose presence declares this section. */
  key: keyof Analysis;
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
  { slug: "guide", label: "Contributor Guide", class: "core" },
  { slug: "tour", label: "Guided Tour", class: "core" },
  { slug: "hotspots", label: "Hotspots", class: "core" },
  { slug: "setup", label: "Setup", class: "core" },
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
