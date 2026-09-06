/**
 * Centralised colour semantics for badges, node kinds, difficulty and churn.
 *
 * Tailwind v4 scans source for *literal* class strings, so every className here
 * is written out in full (no runtime string building of colour names).
 */
import type {
  Difficulty,
  GraphNodeKind,
  HttpMethod,
  RecentActivity,
  TechStackCategory,
} from "@schema/analysis";

export interface BadgeStyle {
  label: string;
  className: string;
}

const CATEGORY_STYLES: Record<TechStackCategory, BadgeStyle> = {
  language: {
    label: "Language",
    className:
      "bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/25",
  },
  framework: {
    label: "Framework",
    className:
      "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25",
  },
  library: {
    label: "Library",
    className:
      "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  database: {
    label: "Database",
    className:
      "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/25",
  },
  infra: {
    label: "Infra",
    className:
      "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  },
  tooling: {
    label: "Tooling",
    className:
      "bg-cyan-500/12 text-cyan-800 dark:text-cyan-300 border-cyan-500/25",
  },
  platform: {
    label: "Platform",
    className:
      "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25",
  },
  protocol: {
    label: "Protocol",
    className:
      "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25",
  },
  other: {
    label: "Other",
    className:
      "bg-stone-500/12 text-stone-700 dark:text-stone-300 border-stone-500/25",
  },
};

export function categoryStyle(c: TechStackCategory): BadgeStyle {
  return CATEGORY_STYLES[c] ?? CATEGORY_STYLES.other;
}

/** Ordered category list for grouping the tech stack. */
export const CATEGORY_ORDER: TechStackCategory[] = [
  "language",
  "platform",
  "framework",
  "library",
  "database",
  "infra",
  "tooling",
  "protocol",
  "other",
];

const DIFFICULTY_STYLES: Record<Difficulty, BadgeStyle> = {
  easy: {
    label: "Easy",
    className:
      "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/25",
  },
  medium: {
    label: "Medium",
    className:
      "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  },
  hard: {
    label: "Hard",
    className:
      "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25",
  },
};

export function difficultyStyle(d: Difficulty): BadgeStyle {
  return DIFFICULTY_STYLES[d] ?? DIFFICULTY_STYLES.medium;
}

const ACTIVITY_STYLES: Record<RecentActivity, BadgeStyle> = {
  active: {
    label: "Active",
    className:
      "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25",
  },
  moderate: {
    label: "Moderate",
    className:
      "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  },
  dormant: {
    label: "Dormant",
    className:
      "bg-stone-500/12 text-stone-700 dark:text-stone-300 border-stone-500/25",
  },
};

export function activityStyle(a: RecentActivity): BadgeStyle {
  return ACTIVITY_STYLES[a] ?? ACTIVITY_STYLES.moderate;
}

/**
 * Bar fill (hex) for the churn chart, keyed by recent activity. Hot-to-cold,
 * pitched to the warm neutral palette rather than the default neon ramp.
 */
export const ACTIVITY_BAR_COLOR: Record<RecentActivity, string> = {
  active: "#c2452f",
  moderate: "#c08a2c",
  dormant: "#8d8479",
};

/** Graph node kind: label, badge class, and an SVG-fill hex readable on both themes. */
export interface KindStyle extends BadgeStyle {
  color: string;
}

const KIND_STYLES: Record<GraphNodeKind, KindStyle> = {
  entrypoint: {
    label: "Entry point",
    color: "#c9902f",
    className:
      "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  },
  "internal-module": {
    label: "Internal module",
    color: "#7d8cba",
    className:
      "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  "external-package": {
    label: "External package",
    color: "#5f9c72",
    // green-800, not -700: at this badge's 11.5px the lighter tint measures
    // 4.42:1 on the /12 wash and misses AA. Matches emerald/amber/cyan, which
    // are bumped for the same reason.
    className:
      "bg-green-500/12 text-green-800 dark:text-green-300 border-green-500/25",
  },
  service: {
    label: "Service",
    color: "#4f93a3",
    className:
      "bg-cyan-500/12 text-cyan-800 dark:text-cyan-300 border-cyan-500/25",
  },
  datastore: {
    label: "Datastore",
    color: "#9079b5",
    className:
      "bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/25",
  },
  "external-service": {
    label: "External service",
    color: "#b56a8c",
    className:
      "bg-pink-500/12 text-pink-700 dark:text-pink-300 border-pink-500/25",
  },
  other: {
    label: "Other",
    color: "#9a9186",
    className:
      "bg-stone-500/12 text-stone-700 dark:text-stone-300 border-stone-500/25",
  },
};

export function kindStyle(k: GraphNodeKind): KindStyle {
  return KIND_STYLES[k] ?? KIND_STYLES.other;
}

/**
 * Diff delta semantics — emerald = added, amber = changed, rose = removed.
 * Literal class strings (light + dark aware), matching the other style helpers
 * so Tailwind v4 can scan them.
 */
export type DiffKind = "added" | "changed" | "removed";

const DIFF_KIND_STYLES: Record<DiffKind, BadgeStyle> = {
  added: {
    label: "Added",
    className:
      "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/25",
  },
  changed: {
    label: "Changed",
    className:
      "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  },
  removed: {
    label: "Removed",
    className:
      "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25",
  },
};

export function diffKindStyle(kind: DiffKind): BadgeStyle {
  return DIFF_KIND_STYLES[kind] ?? DIFF_KIND_STYLES.changed;
}

/**
 * HTTP methods, tinted by what a call does to the server rather than by
 * protocol trivia: reads are cool, writes are warm, deletes are hot. ANY and WS
 * stay neutral because neither says whether the call changes anything.
 */
const METHOD_STYLES: Record<HttpMethod, BadgeStyle> = {
  GET: {
    label: "GET",
    className: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  HEAD: {
    label: "HEAD",
    className: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  POST: {
    label: "POST",
    className:
      "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/25",
  },
  PUT: {
    label: "PUT",
    className:
      "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  },
  PATCH: {
    label: "PATCH",
    className:
      "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  },
  DELETE: {
    label: "DELETE",
    className:
      "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25",
  },
  OPTIONS: {
    label: "OPTIONS",
    className:
      "bg-stone-500/12 text-stone-700 dark:text-stone-300 border-stone-500/25",
  },
  ANY: {
    label: "ANY",
    className:
      "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25",
  },
  WS: {
    label: "WS",
    className:
      "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25",
  },
};

export function methodStyle(m: HttpMethod): BadgeStyle {
  return METHOD_STYLES[m] ?? METHOD_STYLES.ANY;
}

/**
 * Free-form codebase-map roles get a stable tint chosen by hashing the label,
 * so "core domain" is always the same colour across renders.
 */
const ROLE_TINTS: string[] = [
  "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
  "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/25",
  "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  "bg-cyan-500/12 text-cyan-800 dark:text-cyan-300 border-cyan-500/25",
  "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25",
  "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25",
  "bg-pink-500/12 text-pink-700 dark:text-pink-300 border-pink-500/25",
  "bg-stone-500/12 text-stone-700 dark:text-stone-300 border-stone-500/25",
];

export function roleTint(role: string): string {
  let h = 0;
  for (let i = 0; i < role.length; i++) {
    h = (h * 31 + role.charCodeAt(i)) >>> 0;
  }
  return ROLE_TINTS[h % ROLE_TINTS.length];
}

/** Distinct language colours for the stats breakdown bar (cycled if exhausted). */
export const LANGUAGE_PALETTE = [
  "#c2612b",
  "#5b8c7b",
  "#c0942e",
  "#7382ac",
  "#a2607c",
  "#6f8f52",
  "#a9714b",
  "#867ca6",
];
