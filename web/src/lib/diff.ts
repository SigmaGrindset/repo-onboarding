/**
 * Analysis diff engine — a pure, structural comparison of two analysis
 * documents produced by successive `/onboard` runs on the same repo.
 *
 * `diffAnalyses(base, head)` takes the OLDER run as `base` and the NEWER run as
 * `head` and returns an {@link AnalysisDiff}: a stable, presentation-ready set
 * of deltas that a server-component diff page renders. The engine is
 * deliberately dumb about semantics and honest about structure — it reports
 * what the data says changed, and leaves interpretation to the reader.
 *
 * Design rules that make this trustworthy (encoded throughout as comments):
 *
 *  1. Narrative fields are NEVER compared. `insight`, `interpretation`,
 *     `description`, and section titles-as-prose are regenerated from scratch on
 *     every run, so comparing them would mark essentially everything "changed"
 *     and drown the signal. We compare only the structural facts (paths, counts,
 *     scores, kinds, relationships, bodies, diagrams).
 *
 *  2. Every collection is joined by a stable identity key (path / id / (from,to)
 *     / normalized title). Within a single document, if a key appears more than
 *     once the FIRST occurrence wins and later duplicates are ignored — the
 *     analysis schema treats these keys as unique, so a duplicate is malformed
 *     input we tolerate rather than crash on.
 *
 *  3. Output ordering is fully deterministic (see the sort comparators) so the
 *     diff renders identically every time and can be snapshot-tested: within
 *     each delta array, added → changed → removed, then by magnitude descending,
 *     ties broken by ascending Unicode code-unit order of the identity key.
 *
 * This module is PURE and has ZERO runtime imports — only `import type` — so it
 * runs unchanged in a Next.js server component and in a plain `node --test`
 * process. Do not add runtime imports here.
 */

import type {
  Analysis,
  ArchitectureSection,
  GraphEdge,
  GraphNode,
  Hotspot,
  KnownRisk,
  ChangeRoute,
  RecentActivity,
} from "@schema/analysis";

// ---------------------------------------------------------------------------
// Public shapes — FROZEN contract (the diff UI is built against these names).
// ---------------------------------------------------------------------------

/** One end of the comparison: the identifying facts of a single run. */
export interface DiffEndpoint {
  analyzedAt: string;
  commitSha: string | null;
  analyzerVersion: string;
  totalFiles: number;
  totalLoc: number;
}

/** A single hotspot that appeared, disappeared, or changed between runs. */
export interface HotspotDelta {
  path: string;
  kind: "added" | "removed" | "changed";
  /** The base-side hotspot; absent for `added`. */
  before?: Hotspot;
  /** The head-side hotspot; absent for `removed`. */
  after?: Hotspot;
  /** `changed` only: `after.commits - before.commits` (may be 0). */
  commitsDelta?: number;
  /** `changed` only, and only when BOTH sides define `churnScore`. */
  churnScoreDelta?: number;
  /** `changed` only, and only when the recent-activity band actually moved. */
  activityChange?: { from: RecentActivity; to: RecentActivity };
}

/** A dependency-graph node that appeared, disappeared, or changed. */
export interface GraphNodeDelta {
  id: string;
  /** `changed` = kind, label, or path differ (`description` is narrative). */
  kind: "added" | "removed" | "changed";
  before?: GraphNode;
  after?: GraphNode;
}

/** A dependency-graph edge that appeared, disappeared, or changed. */
export interface GraphEdgeDelta {
  from: string;
  to: string;
  /** `changed` = the relationship label differs (incl. undefined ↔ a string). */
  kind: "added" | "removed" | "changed";
  relationshipBefore?: string;
  relationshipAfter?: string;
}

/** An architecture section that appeared, disappeared, or changed. */
export interface ArchitectureDelta {
  /** The head-side title for `added`/`changed`, the base-side for `removed`. */
  title: string;
  kind: "added" | "removed" | "changed";
  /** In-place body change (whitespace-normalized). False for added/removed. */
  bodyChanged: boolean;
  /** In-place diagram change (presence/type/source). False for added/removed. */
  diagramChanged: boolean;
  before?: ArchitectureSection;
  after?: ArchitectureSection;
}

/** A language whose line count moved between runs. */
export interface LanguageDelta {
  language: string;
  /** LOC in the base run; 0 means the language is new in `head`. */
  locBefore: number;
  /** LOC in the head run; 0 means the language was dropped. */
  locAfter: number;
}

/** Repo-level size deltas plus the per-language LOC movements. */
export interface StatsDiff {
  filesDelta: number;
  locDelta: number;
  /** Only languages whose LOC changed (including appear/disappear). */
  languages: LanguageDelta[];
}

export interface ContributorGuideDelta {
  key: string;
  category: "risk" | "route";
  kind: "added" | "removed" | "changed";
  before?: KnownRisk | ChangeRoute;
  after?: KnownRisk | ChangeRoute;
}

/** The complete comparison of two analysis documents. */
export interface AnalysisDiff {
  /** The older run. */
  base: DiffEndpoint;
  /** The newer run. */
  head: DiffEndpoint;
  stats: StatsDiff;
  hotspots: { deltas: HotspotDelta[]; unchangedCount: number };
  graph: {
    nodes: { deltas: GraphNodeDelta[]; unchangedCount: number };
    edges: { deltas: GraphEdgeDelta[]; unchangedCount: number };
  };
  architecture: { deltas: ArchitectureDelta[]; unchangedCount: number };
  contributorGuide: { deltas: ContributorGuideDelta[]; unchangedCount: number };
  /** True iff any delta array is non-empty or a stats delta is non-zero. */
  hasChanges: boolean;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Index a list by a string identity key, keeping the FIRST occurrence of each
 * key (see design rule 2). Returned in first-seen insertion order, though the
 * final diff is re-sorted so callers should not rely on that.
 */
function indexByFirst<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, item); // first wins; later duplicates ignored
  }
  return map;
}

/**
 * Collapse every run of whitespace to a single space and trim. Used to compare
 * prose/markdown bodies so cosmetic reflow (rewrapping, indentation churn,
 * blank-line shuffling) is not mistaken for a meaningful edit.
 */
function normalizeProse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Deterministic ascending comparison by UTF-16 code unit. Used for every
 * "alphabetical" tiebreak so ordering never depends on the host locale/ICU
 * (unlike `String.prototype.localeCompare`), keeping the diff snapshot-stable.
 */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Rank for the added → changed → removed grouping within each delta array. */
const KIND_RANK: Record<"added" | "changed" | "removed", number> = {
  added: 0,
  changed: 1,
  removed: 2,
};

/** Composite identity key for an edge — the ordered (from, to) pair. JSON-
 *  encoding the pair is collision-proof and text-safe (no sentinel char that
 *  a node id might itself contain). */
function edgeKey(e: GraphEdge): string {
  return JSON.stringify([e.from, e.to]);
}

/** Case- and whitespace-insensitive join key for an architecture section. */
function archKey(s: ArchitectureSection): string {
  return s.title.trim().toLowerCase();
}

/**
 * Whether the structural facts of a hotspot moved. `insight` (narrative) is
 * intentionally excluded (design rule 1). A `churnScore` that appears or
 * disappears (undefined ↔ number) counts as a difference here even though the
 * numeric delta is only reported when both sides define it.
 */
function hotspotChanged(before: Hotspot, after: Hotspot): boolean {
  return (
    before.commits !== after.commits ||
    before.churnScore !== after.churnScore ||
    before.recentActivity !== after.recentActivity
  );
}

/** Whether a node's structural facts moved. `description` is narrative — excluded. */
function nodeChanged(before: GraphNode, after: GraphNode): boolean {
  return (
    before.kind !== after.kind ||
    before.label !== after.label ||
    before.path !== after.path
  );
}

/**
 * Whether a section's diagram changed in place: presence differs, the Mermaid
 * type differs, or the source differs. Source is compared after `trim()` only —
 * it is code, so interior indentation can be meaningful and we do NOT normalize
 * whitespace the way we do for prose bodies; we only ignore leading/trailing
 * blank lines around the block.
 */
function diagramDiffers(
  before: ArchitectureSection["diagram"],
  after: ArchitectureSection["diagram"],
): boolean {
  if (!before && !after) return false; // neither section has a diagram
  if (!before || !after) return true; // a diagram was added or removed
  if (before.type !== after.type) return true;
  return before.source.trim() !== after.source.trim();
}

/** Magnitude used to order hotspot deltas within their kind group (desc). */
function hotspotMagnitude(d: HotspotDelta): number {
  if (d.kind === "changed") return Math.abs(d.commitsDelta ?? 0);
  if (d.kind === "added") return d.after?.commits ?? 0;
  return d.before?.commits ?? 0; // removed
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function diffEndpoint(a: Analysis): DiffEndpoint {
  const m = a.metadata;
  return {
    analyzedAt: m.analyzedAt,
    commitSha: m.commitSha,
    analyzerVersion: m.analyzerVersion,
    totalFiles: m.stats.totalFiles,
    totalLoc: m.stats.totalLoc,
  };
}

function diffStats(base: Analysis, head: Analysis): StatsDiff {
  const b = base.metadata.stats;
  const h = head.metadata.stats;

  // Join languages by name (first occurrence wins) and emit a delta only when
  // the LOC moved — appear (locBefore 0), disappear (locAfter 0), or change.
  const baseLang = indexByFirst(b.languages, (l) => l.language);
  const headLang = indexByFirst(h.languages, (l) => l.language);
  const languages: LanguageDelta[] = [];
  const seen = new Set<string>();
  for (const language of [...baseLang.keys(), ...headLang.keys()]) {
    if (seen.has(language)) continue;
    seen.add(language);
    const locBefore = baseLang.get(language)?.loc ?? 0;
    const locAfter = headLang.get(language)?.loc ?? 0;
    if (locBefore !== locAfter) languages.push({ language, locBefore, locAfter });
  }

  // Largest LOC swings first; ties alphabetically by language name.
  languages.sort((x, y) => {
    const mag =
      Math.abs(y.locAfter - y.locBefore) - Math.abs(x.locAfter - x.locBefore);
    return mag !== 0 ? mag : compareStrings(x.language, y.language);
  });

  return {
    filesDelta: h.totalFiles - b.totalFiles,
    locDelta: h.totalLoc - b.totalLoc,
    languages,
  };
}

function diffHotspots(base: Analysis, head: Analysis): {
  deltas: HotspotDelta[];
  unchangedCount: number;
} {
  const baseMap = indexByFirst(base.hotspots.entries, (h) => h.path);
  const headMap = indexByFirst(head.hotspots.entries, (h) => h.path);
  const deltas: HotspotDelta[] = [];
  let unchangedCount = 0;

  for (const [path, after] of headMap) {
    const before = baseMap.get(path);
    if (!before) {
      deltas.push({ path, kind: "added", after });
      continue;
    }
    if (!hotspotChanged(before, after)) {
      unchangedCount++;
      continue;
    }
    const delta: HotspotDelta = {
      path,
      kind: "changed",
      before,
      after,
      commitsDelta: after.commits - before.commits,
    };
    if (before.churnScore !== undefined && after.churnScore !== undefined) {
      delta.churnScoreDelta = after.churnScore - before.churnScore;
    }
    if (before.recentActivity !== after.recentActivity) {
      delta.activityChange = {
        from: before.recentActivity,
        to: after.recentActivity,
      };
    }
    deltas.push(delta);
  }
  for (const [path, before] of baseMap) {
    if (!headMap.has(path)) deltas.push({ path, kind: "removed", before });
  }

  deltas.sort((a, b) => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;
    const byMag = hotspotMagnitude(b) - hotspotMagnitude(a); // desc
    return byMag !== 0 ? byMag : compareStrings(a.path, b.path);
  });

  return { deltas, unchangedCount };
}

function diffNodes(base: Analysis, head: Analysis): {
  deltas: GraphNodeDelta[];
  unchangedCount: number;
} {
  const baseMap = indexByFirst(base.dependencyGraph.nodes, (n) => n.id);
  const headMap = indexByFirst(head.dependencyGraph.nodes, (n) => n.id);
  const deltas: GraphNodeDelta[] = [];
  let unchangedCount = 0;

  for (const [id, after] of headMap) {
    const before = baseMap.get(id);
    if (!before) {
      deltas.push({ id, kind: "added", after });
    } else if (nodeChanged(before, after)) {
      deltas.push({ id, kind: "changed", before, after });
    } else {
      unchangedCount++;
    }
  }
  for (const [id, before] of baseMap) {
    if (!headMap.has(id)) deltas.push({ id, kind: "removed", before });
  }

  // Nodes have no natural magnitude; order alphabetically by id within group.
  deltas.sort((a, b) => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    return byKind !== 0 ? byKind : compareStrings(a.id, b.id);
  });

  return { deltas, unchangedCount };
}

function diffEdges(base: Analysis, head: Analysis): {
  deltas: GraphEdgeDelta[];
  unchangedCount: number;
} {
  const baseMap = indexByFirst(base.dependencyGraph.edges, edgeKey);
  const headMap = indexByFirst(head.dependencyGraph.edges, edgeKey);
  const deltas: GraphEdgeDelta[] = [];
  let unchangedCount = 0;

  // Build a delta and attach whichever relationship labels exist, so the UI can
  // render an added/removed edge's label without a separate lookup.
  const build = (
    kind: GraphEdgeDelta["kind"],
    before: GraphEdge | undefined,
    after: GraphEdge | undefined,
  ): GraphEdgeDelta => {
    const edge = (after ?? before) as GraphEdge;
    const d: GraphEdgeDelta = { from: edge.from, to: edge.to, kind };
    if (before?.relationship !== undefined) d.relationshipBefore = before.relationship;
    if (after?.relationship !== undefined) d.relationshipAfter = after.relationship;
    return d;
  };

  for (const [key, after] of headMap) {
    const before = baseMap.get(key);
    if (!before) {
      deltas.push(build("added", undefined, after));
    } else if (before.relationship !== after.relationship) {
      deltas.push(build("changed", before, after));
    } else {
      unchangedCount++;
    }
  }
  for (const [key, before] of baseMap) {
    if (!headMap.has(key)) deltas.push(build("removed", before, undefined));
  }

  // Order alphabetically by the (from, to) pair within each kind group.
  deltas.sort((a, b) => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;
    const byFrom = compareStrings(a.from, b.from);
    return byFrom !== 0 ? byFrom : compareStrings(a.to, b.to);
  });

  return { deltas, unchangedCount };
}

function diffArchitecture(base: Analysis, head: Analysis): {
  deltas: ArchitectureDelta[];
  unchangedCount: number;
} {
  // Join by trimmed, case-insensitive title. There is deliberately no fuzzy
  // retitle detection: renaming a section reads as one removed + one added.
  const baseMap = indexByFirst(base.architecture, archKey);
  const headMap = indexByFirst(head.architecture, archKey);
  const deltas: ArchitectureDelta[] = [];
  let unchangedCount = 0;

  for (const [key, after] of headMap) {
    const before = baseMap.get(key);
    if (!before) {
      // Added wholesale: the flags describe in-place field edits, so they are
      // false — the section's presence is the change.
      deltas.push({
        title: after.title,
        kind: "added",
        bodyChanged: false,
        diagramChanged: false,
        after,
      });
      continue;
    }
    const bodyChanged = normalizeProse(before.body) !== normalizeProse(after.body);
    const diagramChanged = diagramDiffers(before.diagram, after.diagram);
    if (bodyChanged || diagramChanged) {
      deltas.push({
        title: after.title,
        kind: "changed",
        bodyChanged,
        diagramChanged,
        before,
        after,
      });
    } else {
      unchangedCount++;
    }
  }
  for (const [key, before] of baseMap) {
    if (!headMap.has(key)) {
      deltas.push({
        title: before.title,
        kind: "removed",
        bodyChanged: false,
        diagramChanged: false,
        before,
      });
    }
  }

  // Sections have no natural magnitude; order alphabetically by title in group.
  deltas.sort((a, b) => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    return byKind !== 0 ? byKind : compareStrings(a.title, b.title);
  });

  return { deltas, unchangedCount };
}

function diffContributorGuide(base: Analysis, head: Analysis): {
  deltas: ContributorGuideDelta[];
  unchangedCount: number;
} {
  const baseItems: Array<{ key: string; category: "risk" | "route"; value: KnownRisk | ChangeRoute }> = [
    ...(base.contributorGuide?.knownRisks ?? []).map((value) => ({ key: value.title, category: "risk" as const, value })),
    ...(base.contributorGuide?.changeRoutes ?? []).map((value) => ({ key: value.changeType, category: "route" as const, value })),
  ];
  const headItems: typeof baseItems = [
    ...(head.contributorGuide?.knownRisks ?? []).map((value) => ({ key: value.title, category: "risk" as const, value })),
    ...(head.contributorGuide?.changeRoutes ?? []).map((value) => ({ key: value.changeType, category: "route" as const, value })),
  ];
  const identity = (item: (typeof baseItems)[number]) => `${item.category}:${item.key.trim().toLowerCase()}`;
  const baseMap = indexByFirst(baseItems, identity);
  const headMap = indexByFirst(headItems, identity);
  const deltas: ContributorGuideDelta[] = [];
  let unchangedCount = 0;

  for (const [id, after] of headMap) {
    const before = baseMap.get(id);
    if (!before) {
      deltas.push({ key: after.key, category: after.category, kind: "added", after: after.value });
    } else if (JSON.stringify(before.value) !== JSON.stringify(after.value)) {
      deltas.push({ key: after.key, category: after.category, kind: "changed", before: before.value, after: after.value });
    } else {
      unchangedCount++;
    }
  }
  for (const [id, before] of baseMap) {
    if (!headMap.has(id)) {
      deltas.push({ key: before.key, category: before.category, kind: "removed", before: before.value });
    }
  }
  deltas.sort((a, b) => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    return byKind !== 0 ? byKind : compareStrings(a.key, b.key);
  });
  return { deltas, unchangedCount };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Compare two analysis documents of the same repo. `base` is the OLDER run and
 * `head` is the NEWER run; every delta is expressed as base → head.
 *
 * The result is deterministic and side-effect free, so it is safe to compute in
 * a server component and safe to snapshot in tests.
 */
export function diffAnalyses(base: Analysis, head: Analysis): AnalysisDiff {
  const stats = diffStats(base, head);
  const hotspots = diffHotspots(base, head);
  const nodes = diffNodes(base, head);
  const edges = diffEdges(base, head);
  const architecture = diffArchitecture(base, head);
  const contributorGuide = diffContributorGuide(base, head);

  const hasChanges =
    hotspots.deltas.length > 0 ||
    nodes.deltas.length > 0 ||
    edges.deltas.length > 0 ||
    architecture.deltas.length > 0 ||
    contributorGuide.deltas.length > 0 ||
    stats.filesDelta !== 0 ||
    stats.locDelta !== 0 ||
    stats.languages.length > 0;

  return {
    base: diffEndpoint(base),
    head: diffEndpoint(head),
    stats,
    hotspots,
    graph: { nodes, edges },
    architecture,
    contributorGuide,
    hasChanges,
  };
}
