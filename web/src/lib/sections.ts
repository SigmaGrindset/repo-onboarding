/**
 * The canonical list of analysis sections. Single source of truth for the
 * sidebar nav (which adds icons) and the command-palette search index.
 * `slug` is the path segment under /analysis/[id]; "" is the overview.
 */
export interface AnalysisSection {
  slug: string;
  label: string;
}

export const ANALYSIS_SECTIONS: AnalysisSection[] = [
  { slug: "", label: "Overview" },
  { slug: "architecture", label: "Architecture" },
  { slug: "graph", label: "Dependency Graph" },
  { slug: "map", label: "Codebase Map" },
  { slug: "tour", label: "Guided Tour" },
  { slug: "hotspots", label: "Hotspots" },
  { slug: "setup", label: "Setup" },
  { slug: "tasks", label: "First Tasks" },
  { slug: "versions", label: "Versions" },
];
