import type { Analysis, Difficulty } from "@schema/analysis";
import { ANALYSIS_SECTIONS } from "./sections";

/**
 * Fallback starter prompts, shown when a section has no derivable data (and
 * used to pad sections that yield fewer than three). Also the safety net the
 * chat client uses if a slug is somehow missing from the map.
 */
export const DEFAULT_QUESTIONS = [
  "What does this repo do?",
  "Where should I start reading?",
  "How do I run the tests?",
];

/** Exactly this many starter pills per section. */
const QUESTIONS_PER_SECTION = 3;

/** Interpolated titles/paths are clipped so a pill stays one short line. */
const MAX_FRAGMENT_LENGTH = 40;

/**
 * Per-section starter prompts for the "Ask this repo" chat empty state, keyed
 * by `ANALYSIS_SECTIONS` slug ("" = overview). Built server-side from the
 * analysis and passed to the client as plain data — same doctrine as
 * `buildSearchIndex`. Every slug maps to exactly three questions; sections
 * with sparse data are padded from `DEFAULT_QUESTIONS`.
 */
export function buildSuggestedQuestions(
  analysis: Analysis,
): Record<string, string[]> {
  const bySlug: Record<string, string[]> = {
    "": overviewQuestions(analysis),
    architecture: architectureQuestions(analysis),
    graph: graphQuestions(analysis),
    map: mapQuestions(analysis),
    guide: guideQuestions(analysis),
    tour: tourQuestions(analysis),
    hotspots: hotspotsQuestions(analysis),
    setup: setupQuestions(analysis),
    tasks: tasksQuestions(analysis),
    versions: [],
  };

  const out: Record<string, string[]> = {};
  for (const s of ANALYSIS_SECTIONS) {
    out[s.slug] = padQuestions(bySlug[s.slug] ?? []);
  }
  return out;
}

function guideQuestions(a: Analysis): string[] {
  const risk = a.contributorGuide?.knownRisks[0];
  const route = a.contributorGuide?.changeRoutes[0];
  return [
    risk ? `How do I avoid "${clip(risk.title)}"?` : "What are the sharp edges?",
    route ? `Where should I make a ${clip(route.changeType)} change?` : "Where should a new change go?",
    "What should I verify before opening a PR?",
  ];
}

function overviewQuestions(a: Analysis): string[] {
  const stack = a.pitch.techStack;
  const tech = stack.find((t) => t.category === "framework") ?? stack[0];
  return [
    "What does this repo do?",
    tech ? `How is ${clip(tech.name)} used here?` : "",
    "Where should I start reading?",
  ];
}

function architectureQuestions(a: Analysis): string[] {
  const [first, second] = a.architecture;
  return [
    first ? `How does "${clip(first.title)}" work?` : "",
    second ? `What does "${clip(second.title)}" cover?` : "",
    "How do the main pieces fit together?",
  ];
}

function graphQuestions(a: Analysis): string[] {
  const internal = a.dependencyGraph.nodes.filter(
    (n) => n.kind === "internal-module" || n.kind === "entrypoint" || n.kind === "service",
  );
  const [first, second] = internal;
  return [
    first ? `What depends on ${clip(first.label)}?` : "",
    second ? `What role does ${clip(second.label)} play?` : "",
    "Which external packages matter most?",
  ];
}

function mapQuestions(a: Analysis): string[] {
  const [first, second] = a.codebaseMap;
  return [
    first ? `What lives in ${shortPath(first.path)}?` : "",
    second ? `Which files in ${shortPath(second.path)} matter most?` : "",
    "Where does the main entry point live?",
  ];
}

function tourQuestions(a: Analysis): string[] {
  const steps = [...a.tour].sort((x, y) => x.order - y.order);
  const [first, second] = steps;
  const firstFile = first?.files[0]?.path;
  return [
    first ? `Why is "${clip(first.title)}" the first stop?` : "",
    firstFile ? `What should I notice in ${shortPath(firstFile)}?` : "",
    second ? `Why read "${clip(second.title)}" next?` : "",
  ];
}

function hotspotsQuestions(a: Analysis): string[] {
  const entries = [...a.hotspots.entries].sort((x, y) => y.commits - x.commits);
  const [top, second] = entries;
  return [
    top ? `Why does ${shortPath(top.path)} churn so much?` : "",
    second ? `Is it risky to change ${shortPath(second.path)}?` : "",
    top ? "Which hotspot should I read before contributing?" : "",
  ];
}

function setupQuestions(a: Analysis): string[] {
  // Prerequisites are prose and often carry a parenthetical ("Node.js >= 18
  // (package.json engines)"); keep only the lead term so the question reads
  // naturally.
  const prereq = a.setup.prerequisites[0]?.split(" (")[0].trim();
  return [
    prereq ? `Why do I need ${clip(prereq)}?` : "",
    "How do I run this locally?",
    "How do I run the tests?",
  ];
}

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

function tasksQuestions(a: Analysis): string[] {
  const easiest = [...a.firstTasks].sort(
    (x, y) => DIFFICULTY_RANK[x.difficulty] - DIFFICULTY_RANK[y.difficulty],
  )[0];
  return [
    easiest ? `What files would I touch for "${clip(easiest.title)}"?` : "",
    easiest ? "Which first task is the easiest?" : "",
    "What should I know before opening a PR?",
  ];
}

/** Drop blanks and duplicates, then pad from the defaults to exactly three. */
function padQuestions(derived: string[]): string[] {
  const out: string[] = [];
  for (const q of [...derived, ...DEFAULT_QUESTIONS]) {
    if (q && !out.includes(q)) out.push(q);
    if (out.length === QUESTIONS_PER_SECTION) break;
  }
  return out;
}

/**
 * Shorten a repo-relative path to its last two segments so pills stay one
 * line. The model still resolves it: the full analysis is in its context.
 */
function shortPath(p: string): string {
  const segments = p.split("/").filter(Boolean);
  return clip(segments.slice(-2).join("/"));
}

function clip(s: string): string {
  return s.length > MAX_FRAGMENT_LENGTH
    ? `${s.slice(0, MAX_FRAGMENT_LENGTH - 1)}…`
    : s;
}
