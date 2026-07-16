/**
 * Centralised colour semantics for badges, node kinds, difficulty and churn.
 *
 * Tailwind v4 scans source for *literal* class strings, so every className here
 * is written out in full (no runtime string building of colour names).
 */
import type {
  Difficulty,
  GraphNodeKind,
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
      "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
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
      "bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/25",
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
      "bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/25",
  },
};

export function activityStyle(a: RecentActivity): BadgeStyle {
  return ACTIVITY_STYLES[a] ?? ACTIVITY_STYLES.moderate;
}

/** Bar fill (hex) for the churn chart, keyed by recent activity. */
export const ACTIVITY_BAR_COLOR: Record<RecentActivity, string> = {
  active: "#f43f5e",
  moderate: "#f59e0b",
  dormant: "#64748b",
};

/** Graph node kind: label, badge class, and an SVG-fill hex readable on both themes. */
export interface KindStyle extends BadgeStyle {
  color: string;
}

const KIND_STYLES: Record<GraphNodeKind, KindStyle> = {
  entrypoint: {
    label: "Entry point",
    color: "#f59e0b",
    className:
      "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  },
  "internal-module": {
    label: "Internal module",
    color: "#7b8cff",
    className:
      "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
  },
  "external-package": {
    label: "External package",
    color: "#22c55e",
    className:
      "bg-green-500/12 text-green-700 dark:text-green-300 border-green-500/25",
  },
  service: {
    label: "Service",
    color: "#06b6d4",
    className:
      "bg-cyan-500/12 text-cyan-800 dark:text-cyan-300 border-cyan-500/25",
  },
  datastore: {
    label: "Datastore",
    color: "#a855f7",
    className:
      "bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/25",
  },
  "external-service": {
    label: "External service",
    color: "#ec4899",
    className:
      "bg-pink-500/12 text-pink-700 dark:text-pink-300 border-pink-500/25",
  },
  other: {
    label: "Other",
    color: "#94a3b8",
    className:
      "bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/25",
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
 * Free-form codebase-map roles get a stable tint chosen by hashing the label,
 * so "core domain" is always the same colour across renders.
 */
const ROLE_TINTS: string[] = [
  "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
  "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/25",
  "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
  "bg-cyan-500/12 text-cyan-800 dark:text-cyan-300 border-cyan-500/25",
  "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25",
  "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25",
  "bg-pink-500/12 text-pink-700 dark:text-pink-300 border-pink-500/25",
  "bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/25",
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
  "#7b8cff",
  "#22c55e",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#a855f7",
  "#14b8a6",
  "#f43f5e",
];
