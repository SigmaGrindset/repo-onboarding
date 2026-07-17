/**
 * Repo Onboarding — Markdown export (web-side mirror).
 *
 * Renders a validated analysis document into a single, committable
 * `ONBOARDING.md` (GitHub-flavored Markdown).
 *
 * MIRROR NOTICE: this file is a hand-maintained TypeScript copy of the canonical
 * generator at `schema/export-markdown.mjs`. Next/Turbopack cannot import a
 * module outside `web/` at build time (turbopack.root is pinned to `web/`), so
 * the logic is duplicated here — the same doctrine as `validateAnalysis.ts`.
 * UNLIKE the validator mirror, drift here is machine-checked: the parity test
 * `src/lib/__tests__/export-markdown.test.ts` asserts this module's output is
 * byte-identical to the canonical `.mjs` for every fixture. If you change one,
 * change both and keep the output identical.
 *
 * Hard constraints (a drift test and a determinism test depend on them):
 *   - Self-contained, pure, deterministic.
 *   - No Date.now(), Math.random(), or locale-dependent APIs. Number and date
 *     formatting are hand-rolled so output never varies by host locale.
 *   - LF (`\n`) line endings only. Output is normalized to LF as a final safety
 *     net.
 *
 * Section order mirrors `web/src/lib/sections.ts` (minus the viewer-only
 * "Versions" tab, which is not part of an analysis document).
 */

import type {
  Analysis,
  FileRef,
  SetupStep,
} from "@schema/analysis";

const DEFAULT_SITE_URL = "https://repo-onboarding-tau.vercel.app";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Rendered sections, in order — drives both the body and the Contents TOC. */
const SECTIONS = [
  "Overview",
  "Architecture",
  "Dependency Graph",
  "Codebase Map",
  "Contributor Guide",
  "Guided Tour",
  "Hotspots",
  "Setup",
  "First Tasks",
];

// ---------------------------------------------------------------------------
// Small, testable helpers
// ---------------------------------------------------------------------------

/**
 * Escape and flatten a value for use inside a Markdown table cell: collapse all
 * whitespace (including newlines) to single spaces and escape the `|` delimiter.
 */
function cell(text: unknown): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\|/g, "\\|");
}

/**
 * Format an integer with en-US comma thousands separators (e.g. 18740 →
 * "18,740"). Non-finite input degrades gracefully to a plain string.
 */
function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value == null ? "" : String(value);
  }
  const negative = value < 0;
  const digits = Math.abs(Math.trunc(value)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

/**
 * Format a percentage share to one decimal place (e.g. 81.8 → "81.8%").
 */
function formatShare(value: unknown): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${n.toFixed(1)}%`;
}

/**
 * Format an ISO-8601 date-time as "Jul 11, 2026" using a fixed month table.
 * Locale-independent and deterministic; falls back to the raw string when the
 * input does not start with a YYYY-MM-DD date.
 */
function formatDate(iso: unknown): string {
  const s = String(iso ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  const month = MONTHS[monthIndex] ?? m[2];
  return `${month} ${day}, ${year}`;
}

/** First 7 characters of a commit SHA (git short form). */
function shortSha(sha: unknown): string {
  return String(sha ?? "").slice(0, 7);
}

/**
 * GitHub-style heading anchor slug: lowercase, drop characters that are not
 * alphanumeric / space / hyphen, then convert spaces to hyphens.
 */
function slugify(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Escape a value for use inside a mermaid `"..."` label. */
function mermaidLabel(text: unknown): string {
  return String(text ?? "").replace(/"/g, "&quot;");
}

/** Escape a value for use inside a mermaid `|...|` edge label. */
function mermaidEdgeLabel(text: unknown): string {
  return String(text ?? "")
    .replace(/"/g, "&quot;")
    .replace(/\|/g, "&#124;");
}

/** Wrap a path/identifier in an inline code span, pipe-escaped for tables. */
function code(text: unknown): string {
  return `\`${String(text ?? "").replace(/\|/g, "\\|")}\``;
}

// ---------------------------------------------------------------------------
// Section renderers — each returns an array of lines (no leading/trailing blanks)
// ---------------------------------------------------------------------------

function renderHeader(analysis: Analysis, siteUrl: string): string[] {
  const meta = analysis.metadata ?? {};
  const lines = [`# ${meta.repoName ?? "Repository"} — Onboarding Guide`, ""];

  const parts = [
    `Generated by [Repo Onboarding](${siteUrl})`,
    `analyzed ${formatDate(meta.analyzedAt)}`,
    `${meta.analyzerVersion ?? ""}`,
  ];
  if (meta.commitSha) parts.push(`commit \`${shortSha(meta.commitSha)}\``);
  lines.push(`> ${parts.join(" · ")}`);
  return lines;
}

function renderPitch(analysis: Analysis): string[] {
  const pitch = analysis.pitch ?? {};
  return [
    String(pitch.summary ?? ""),
    "",
    `**Who this is for:** ${pitch.audience ?? ""}`,
  ];
}

function renderContents(): string[] {
  const lines = ["## Contents", ""];
  for (const label of SECTIONS) {
    lines.push(`- [${label}](#${slugify(label)})`);
  }
  return lines;
}

function renderOverview(analysis: Analysis): string[] {
  const meta = analysis.metadata ?? {};
  const stats = meta.stats ?? {};
  const pitch = analysis.pitch ?? {};

  const lines = ["## Overview", ""];
  lines.push(
    `**${formatNumber(stats.totalFiles)} files · ${formatNumber(stats.totalLoc)} lines · primary language ${meta.primaryLanguage ?? "unknown"}**`,
  );

  const techStack = Array.isArray(pitch.techStack) ? pitch.techStack : [];
  if (techStack.length) {
    lines.push("", "### Tech stack", "");
    lines.push("| Name | Category | Role |");
    lines.push("| --- | --- | --- |");
    for (const t of techStack) {
      lines.push(`| ${cell(t.name)} | ${cell(t.category)} | ${cell(t.role)} |`);
    }
  }

  const languages = Array.isArray(stats.languages) ? stats.languages : [];
  if (languages.length) {
    lines.push("", "### Languages", "");
    lines.push("| Language | Files | LOC | Share |");
    lines.push("| --- | --- | --- | --- |");
    for (const l of languages) {
      lines.push(
        `| ${cell(l.language)} | ${formatNumber(l.files)} | ${formatNumber(l.loc)} | ${formatShare(l.percentage)} |`,
      );
    }
  }
  return lines;
}

function renderArchitecture(analysis: Analysis): string[] {
  const sections = Array.isArray(analysis.architecture)
    ? analysis.architecture
    : [];
  const lines = ["## Architecture"];
  for (const section of sections) {
    lines.push("", `### ${section.title ?? ""}`, "");
    lines.push(String(section.body ?? ""));
    const diagram = section.diagram;
    if (diagram && diagram.source) {
      if (diagram.title) lines.push("", `**${diagram.title}**`);
      lines.push("", "```mermaid", String(diagram.source), "```");
    }
  }
  return lines;
}

function renderDependencyGraph(analysis: Analysis): string[] {
  const graph = analysis.dependencyGraph ?? {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  const idMap = new Map<string, string>();
  nodes.forEach((node, i) => idMap.set(node.id, `n${i}`));

  const lines = ["## Dependency Graph", "", "```mermaid", "flowchart LR"];
  for (const node of nodes) {
    const safeId = idMap.get(node.id);
    lines.push(`  ${safeId}["${mermaidLabel(node.label)}"]`);
  }
  for (const edge of edges) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to) continue;
    const label = edge.relationship
      ? `|${mermaidEdgeLabel(edge.relationship)}|`
      : "";
    lines.push(`  ${from} -->${label} ${to}`);
  }
  lines.push("```");

  if (nodes.length) {
    lines.push("", "| Node | Kind | Path | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const node of nodes) {
      const path = node.path ? code(cell(node.path)) : "—";
      const description = node.description ? cell(node.description) : "—";
      lines.push(
        `| ${cell(node.label)} | ${cell(node.kind)} | ${path} | ${description} |`,
      );
    }
  }
  return lines;
}

function renderCodebaseMap(analysis: Analysis): string[] {
  const entries = Array.isArray(analysis.codebaseMap)
    ? analysis.codebaseMap
    : [];
  const lines = ["## Codebase Map"];
  for (const entry of entries) {
    lines.push("", `### \`${entry.path ?? ""}\` — ${entry.role ?? ""}`, "");
    lines.push(String(entry.purpose ?? ""));
    const keyFiles = Array.isArray(entry.keyFiles) ? entry.keyFiles : [];
    if (keyFiles.length) {
      lines.push("", "Key files:", "");
      for (const kf of keyFiles) {
        lines.push(`- \`${kf.path ?? ""}\` — ${String(kf.note ?? "")}`);
      }
    }
  }
  return lines;
}

/**
 * Render a single tour FileRef, linking to the remote host when repoUrl and
 * commitSha are both present, otherwise emitting a plain code span.
 */
function renderFileRef(
  ref: FileRef,
  repoUrl: string | null,
  commitSha: string | null,
): string {
  const path = ref.path ?? "";
  const hasStart = typeof ref.startLine === "number";
  const hasEnd = typeof ref.endLine === "number";
  const linkable = repoUrl && commitSha;

  if (linkable) {
    const base = `${repoUrl}/blob/${commitSha}/${path}`;
    if (hasStart && hasEnd) {
      return `[\`${path}\` (L${ref.startLine}–L${ref.endLine})](${base}#L${ref.startLine}-L${ref.endLine})`;
    }
    if (hasStart) {
      return `[\`${path}\` (L${ref.startLine})](${base}#L${ref.startLine})`;
    }
    return `[\`${path}\`](${base})`;
  }

  if (hasStart && hasEnd) {
    return `\`${path}\` (lines ${ref.startLine}–${ref.endLine})`;
  }
  if (hasStart) {
    return `\`${path}\` (line ${ref.startLine})`;
  }
  return `\`${path}\``;
}

function renderTour(analysis: Analysis): string[] {
  const steps = Array.isArray(analysis.tour) ? [...analysis.tour] : [];
  steps.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const meta = analysis.metadata ?? {};
  const repoUrl = meta.repoUrl;
  const commitSha = meta.commitSha;

  const lines = ["## Guided Tour"];
  for (const step of steps) {
    lines.push("", `### ${step.order}. ${step.title ?? ""}`, "");
    const files = Array.isArray(step.files) ? step.files : [];
    const rendered = files.map((f) => renderFileRef(f, repoUrl, commitSha));
    lines.push(`Files: ${rendered.join(", ")}`);
    lines.push("", `**Why:** ${step.why ?? ""}`);
    lines.push("", `**Notice:** ${step.notice ?? ""}`);
  }
  return lines;
}

function renderHotspots(analysis: Analysis): string[] {
  const hotspots = analysis.hotspots ?? {};
  const entries = Array.isArray(hotspots.entries) ? hotspots.entries : [];

  const lines = ["## Hotspots", ""];
  lines.push("| File | Commits | Churn | Activity | Insight |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const h of entries) {
    const churn =
      typeof h.churnScore === "number" ? formatNumber(h.churnScore) : "—";
    lines.push(
      `| ${code(cell(h.path))} | ${formatNumber(h.commits)} | ${churn} | ${cell(h.recentActivity)} | ${cell(h.insight)} |`,
    );
  }
  if (hotspots.interpretation) {
    lines.push("", String(hotspots.interpretation));
  }
  return lines;
}

/** Render one titled setup phase (Prerequisites/Setup/Run/Test share layout). */
function renderSetupSteps(steps: SetupStep[]): string[] {
  const lines: string[] = [];
  for (const step of Array.isArray(steps) ? steps : []) {
    lines.push("", `**${step.title ?? ""}**`);
    if (step.notes) lines.push("", String(step.notes));
    const commands = Array.isArray(step.commands) ? step.commands : [];
    lines.push("", "```sh", commands.join("\n"), "```");
  }
  return lines;
}

function renderSetup(analysis: Analysis): string[] {
  const setup = analysis.setup ?? {};
  const lines = ["## Setup"];

  const prerequisites = Array.isArray(setup.prerequisites)
    ? setup.prerequisites
    : [];
  if (prerequisites.length) {
    lines.push("", "### Prerequisites", "");
    for (const p of prerequisites) lines.push(`- ${String(p)}`);
  }

  const phases: Array<[string, SetupStep[]]> = [
    ["Setup", setup.setup],
    ["Run", setup.run],
    ["Test", setup.test],
  ];
  for (const [label, steps] of phases) {
    if (Array.isArray(steps) && steps.length) {
      lines.push("", `### ${label}`);
      lines.push(...renderSetupSteps(steps));
    }
  }
  return lines;
}

function renderFirstTasks(analysis: Analysis): string[] {
  const tasks = Array.isArray(analysis.firstTasks) ? analysis.firstTasks : [];
  const lines = ["## First Tasks", ""];
  for (const task of tasks) {
    lines.push(`- [ ] **${task.title ?? ""}** — ${task.difficulty ?? ""}`);
    lines.push(`  ${String(task.description ?? "").replace(/\s*\n\s*/g, " ")}`);
    const files = Array.isArray(task.files) ? task.files : [];
    const fileList = files.map((f) => `\`${f}\``).join(", ");
    const rationale = String(task.rationale ?? "").replace(/\s*\n\s*/g, " ");
    lines.push(`  Files: ${fileList} · _${rationale}_`);
  }
  return lines;
}

function renderContributorGuide(analysis: Analysis): string[] {
  const guide = analysis.contributorGuide;
  const lines = ["## Contributor Guide"];
  if (!guide) {
    lines.push("", "This analysis predates the contributor guide.");
    return lines;
  }

  lines.push("", "### Known risks and sharp edges");
  for (const risk of guide.knownRisks ?? []) {
    lines.push("", `#### ${risk.title ?? ""} (${risk.severity ?? ""})`, "");
    lines.push(String(risk.impact ?? ""));
    lines.push("", `**Mitigation:** ${String(risk.mitigation ?? "")}`);
    const files = Array.isArray(risk.files) ? risk.files : [];
    lines.push("", `Files: ${files.map((f) => `\`${f}\``).join(", ")}`);
  }

  lines.push("", "### Where should this kind of change go?");
  for (const route of guide.changeRoutes ?? []) {
    lines.push("", `#### ${route.changeType ?? ""}`, "");
    lines.push(`Start in \`${route.primaryPath ?? ""}\`.`);
    const related = Array.isArray(route.relatedPaths) ? route.relatedPaths : [];
    if (related.length) {
      lines.push("", `Related: ${related.map((p) => `\`${p}\``).join(", ")}`);
    }
    lines.push("", String(route.rationale ?? ""));
    const checks = Array.isArray(route.verification) ? route.verification : [];
    if (checks.length) {
      lines.push("", "Verify:", "");
      for (const check of checks) lines.push(`- ${String(check)}`);
    }
  }
  return lines;
}

function renderFooter(
  analysis: Analysis,
  siteUrl: string,
  generatorVersion: string | undefined,
): string[] {
  const version =
    generatorVersion || analysis.metadata?.analyzerVersion || "0.0.0";
  return [
    "---",
    "",
    `_Generated by [repo-onboarding](${siteUrl}) v${version}. Regenerate with \`npx repo-onboarding export\`._`,
  ];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render a validated analysis document as an ONBOARDING.md Markdown string.
 * @returns Markdown with LF line endings and a single trailing newline
 */
export function renderOnboardingMarkdown(
  analysis: Analysis,
  options: { siteUrl?: string; generatorVersion?: string } = {},
): string {
  const siteUrl = options.siteUrl || DEFAULT_SITE_URL;
  const generatorVersion = options.generatorVersion;

  const blocks = [
    renderHeader(analysis, siteUrl),
    renderPitch(analysis),
    renderContents(),
    renderOverview(analysis),
    renderArchitecture(analysis),
    renderDependencyGraph(analysis),
    renderCodebaseMap(analysis),
    renderContributorGuide(analysis),
    renderTour(analysis),
    renderHotspots(analysis),
    renderSetup(analysis),
    renderFirstTasks(analysis),
    renderFooter(analysis, siteUrl, generatorVersion),
  ];

  const doc = blocks.map((lines) => lines.join("\n")).join("\n\n") + "\n";
  // Safety net: guarantee LF-only output regardless of embedded prose endings.
  return doc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export default renderOnboardingMarkdown;
