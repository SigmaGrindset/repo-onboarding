import type { Analysis } from "@schema/analysis";
import { slugify } from "./format";
import { ANALYSIS_SECTIONS } from "./sections";

/**
 * One jumpable target in the Cmd+K palette. Built server-side from the
 * analysis document and passed to the client as plain serializable data —
 * the palette never needs the full document.
 */
export interface SearchItem {
  /** Display group, also used for ordering. */
  group: "Sections" | "Architecture" | "Codebase Map" | "Guided Tour" | "Hotspots";
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

  for (const s of ANALYSIS_SECTIONS) {
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
