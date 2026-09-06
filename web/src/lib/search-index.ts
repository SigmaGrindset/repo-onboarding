import type { Analysis } from "@schema/analysis";
import { routeAnchor, routeLabel } from "./api-surface";
import { slugify } from "./format";
import { visibleSections } from "./sections";

/**
 * Every palette group, in the order the palette renders them — which follows
 * the section order, so results read down the page the reader would.
 *
 * This is the ONE list. `SearchGroup` is derived from it and the palette
 * iterates it, so a group cannot exist that the palette does not render. It
 * used to be two lists — a union here and an order constant in the palette —
 * and they disagreed the moment a group was added: the index built the API
 * Surface entries correctly and the palette silently dropped every one.
 */
export const SEARCH_GROUPS = [
  "Sections",
  "Architecture",
  "Codebase Map",
  "API Surface",
  "Contributor Guide",
  "Guided Tour",
  "Hotspots",
  "Learn",
] as const;

/** A display group, and the order it appears in. */
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

/**
 * One jumpable target in the Cmd+K palette. Built server-side from the
 * analysis document and passed to the client as plain serializable data —
 * the palette never needs the full document.
 */
export interface SearchItem {
  /** Display group, also used for ordering. */
  group: SearchGroup;
  label: string;
  /** Secondary text shown right-aligned (role, step number, commit count). */
  hint?: string;
  /** Where selecting this item navigates. */
  href: string;
  /** Extra matchable text that is not displayed (file paths, diagram titles). */
  keywords?: string;
}

/**
 * Flatten an analysis into palette entries. Targets deep-link via query
 * params that each page already understands (`?step=`) or that the new
 * jump components handle (`?section=`, `?entry=`, `?file=`).
 */
export function buildSearchIndex(analysis: Analysis, base: string): SearchItem[] {
  const items: SearchItem[] = [];

  for (const s of visibleSections(analysis)) {
    items.push({
      group: "Sections",
      label: s.label,
      href: s.slug ? `${base}/${s.slug}` : base,
    });
  }

  analysis.architecture.forEach((section, i) => {
    items.push({
      group: "Architecture",
      label: section.title,
      hint: `Section ${i + 1}`,
      href: `${base}/architecture?section=${slugify(section.title)}`,
      keywords: section.diagram?.title,
    });
  });

  for (const entry of analysis.codebaseMap) {
    items.push({
      group: "Codebase Map",
      label: entry.path,
      hint: entry.role,
      href: `${base}/map?entry=${slugify(entry.path)}`,
      keywords: entry.keyFiles?.map((f) => f.path).join(" "),
    });
  }

  // Every route, not a selection: the palette is how a reader checks whether a
  // path exists at all, which a curated index could not answer.
  for (const route of analysis.apiSurface?.routes ?? []) {
    items.push({
      group: "API Surface",
      label: routeLabel(route),
      hint: route.actor,
      href: `${base}/api?route=${routeAnchor(route)}`,
      keywords: route.file,
    });
  }

  for (const risk of analysis.contributorGuide?.knownRisks ?? []) {
    items.push({
      group: "Contributor Guide",
      label: risk.title,
      hint: `${risk.severity} risk`,
      href: `${base}/guide#risk-${slugify(risk.title)}`,
      keywords: risk.files.join(" "),
    });
  }
  for (const route of analysis.contributorGuide?.changeRoutes ?? []) {
    items.push({
      group: "Contributor Guide",
      label: route.changeType,
      hint: route.primaryPath,
      href: `${base}/guide#route-${slugify(route.changeType)}`,
      keywords: [route.primaryPath, ...route.relatedPaths].join(" "),
    });
  }

  const tour = [...analysis.tour].sort((a, b) => a.order - b.order);
  for (const step of tour) {
    items.push({
      group: "Guided Tour",
      label: step.title,
      hint: `Step ${step.order}`,
      href: `${base}/tour?step=${step.order}`,
      keywords: step.files.map((f) => f.path).join(" "),
    });
  }

  for (const entry of analysis.learningResources ?? []) {
    items.push({
      group: "Learn",
      label: entry.tech,
      hint: entry.official ? "docs + repo pointers" : "repo pointers",
      href: `${base}/learn?tech=${slugify(entry.tech)}`,
      keywords: [
        ...entry.resources.map((r) => r.title),
        ...entry.inRepo.files.map((f) => f.path),
      ].join(" "),
    });
  }

  const hotspots = [...analysis.hotspots.entries].sort(
    (a, b) => b.commits - a.commits,
  );
  for (const h of hotspots) {
    items.push({
      group: "Hotspots",
      label: h.path,
      hint: `${h.commits} commits`,
      href: `${base}/hotspots?file=${slugify(h.path)}`,
      keywords: h.recentActivity,
    });
  }

  return items;
}
