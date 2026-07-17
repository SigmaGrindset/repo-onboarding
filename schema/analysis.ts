/**
 * Repo Onboarding — analysis document types.
 *
 * These types are the hand-maintained TypeScript mirror of
 * `schema/analysis.schema.json`. They MUST agree with the JSON Schema exactly.
 * The schema is the source of truth for validation; these types are the source
 * of truth for compile-time safety in the skill and the web viewer.
 *
 * Contract version: schemaVersion "1.0.0".
 */

/** Semantic version string, e.g. "1.0.0". */
export type SchemaVersion = string;

/** The full analysis document — the top-level contract. */
export interface Analysis {
  /** Semantic version of this contract, e.g. "1.0.0". */
  schemaVersion: SchemaVersion;
  metadata: Metadata;
  pitch: ElevatorPitch;
  /**
   * Ordered architecture narrative. At least one section must carry a
   * Mermaid `diagram` (enforced by the schema's `contains` constraint).
   */
  architecture: ArchitectureSection[];
  dependencyGraph: DependencyGraph;
  /** Annotated directory tree. */
  codebaseMap: CodebaseMapEntry[];
  /** Guided reading tour — the ordered heart of onboarding. */
  tour: TourStep[];
  hotspots: Hotspots;
  setup: SetupGuide;
  /** Contributor-specific risks and guidance for locating common changes. */
  contributorGuide?: ContributorGuide;
  /** Suggested first tasks for a new contributor. */
  firstTasks: FirstTask[];
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export interface Metadata {
  repoName: string;
  /** Canonical remote URL, or null for a local-only path. */
  repoUrl: string | null;
  /** When the analysis was produced (RFC 3339 / ISO 8601 date-time). */
  analyzedAt: string;
  /** Version of the /onboard engine that produced this document. */
  analyzerVersion: string;
  /** Commit SHA analyzed, or null if unknown / not a git checkout. */
  commitSha: string | null;
  primaryLanguage: string;
  stats: RepoStats;
}

export interface RepoStats {
  totalFiles: number;
  totalLoc: number;
  languages: LanguageStat[];
}

export interface LanguageStat {
  language: string;
  files: number;
  loc: number;
  /** Share of code by LOC, 0-100. */
  percentage: number;
}

// ---------------------------------------------------------------------------
// Elevator pitch + tech stack
// ---------------------------------------------------------------------------

export interface ElevatorPitch {
  /** A few sentences describing what the repo is and does. */
  summary: string;
  /** Who this repo is for / who would work in it. */
  audience: string;
  techStack: TechStackEntry[];
}

export type TechStackCategory =
  | "language"
  | "framework"
  | "library"
  | "database"
  | "infra"
  | "tooling"
  | "platform"
  | "protocol"
  | "other";

export interface TechStackEntry {
  name: string;
  category: TechStackCategory;
  /** What this technology does specifically in THIS repo. */
  role: string;
}

// ---------------------------------------------------------------------------
// Architecture narrative
// ---------------------------------------------------------------------------

export interface ArchitectureSection {
  title: string;
  /** Markdown prose explaining this architectural aspect. */
  body: string;
  /** Optional Mermaid diagram for this section. */
  diagram?: MermaidDiagram;
}

export type MermaidDiagramType =
  | "flowchart"
  | "sequence"
  | "class"
  | "state"
  | "er"
  | "graph"
  | "c4"
  | "gantt"
  | "mindmap"
  | "journey"
  | "other";

export interface MermaidDiagram {
  /** Mermaid diagram family, used by the UI to pick rendering hints. */
  type: MermaidDiagramType;
  title?: string;
  /** Raw Mermaid source (the text between the ```mermaid fences). */
  source: string;
}

// ---------------------------------------------------------------------------
// Module / dependency graph
// ---------------------------------------------------------------------------

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type GraphNodeKind =
  | "internal-module"
  | "external-package"
  | "entrypoint"
  | "service"
  | "datastore"
  | "external-service"
  | "other";

export interface GraphNode {
  /** Stable unique node id, referenced by edges. */
  id: string;
  label: string;
  kind: GraphNodeKind;
  description?: string;
  /** Repo-relative path for internal nodes (omit for external packages). */
  path?: string;
}

export interface GraphEdge {
  /** Source node id (must match a GraphNode.id). */
  from: string;
  /** Target node id (must match a GraphNode.id). */
  to: string;
  /** Optional edge label, e.g. "imports", "calls", "reads from". */
  relationship?: string;
}

// ---------------------------------------------------------------------------
// Codebase map
// ---------------------------------------------------------------------------

export interface CodebaseMapEntry {
  /** Repo-relative directory or path this entry annotates. */
  path: string;
  /** What lives here and why it exists. */
  purpose: string;
  /** Importance / role of this path for a newcomer. */
  role: string;
  keyFiles?: KeyFile[];
}

export interface KeyFile {
  path: string;
  /** One-line note about what this file is/does. */
  note: string;
}

// ---------------------------------------------------------------------------
// Guided reading tour
// ---------------------------------------------------------------------------

export interface TourStep {
  /** 1-based position in the tour. */
  order: number;
  title: string;
  /** One or more files (with optional line ranges) this step points to. */
  files: FileRef[];
  /** Why read THIS file at THIS point in the tour — the ordering rationale. */
  why: string;
  /** What the reader should specifically notice / take away here. */
  notice: string;
}

export interface FileRef {
  path: string;
  startLine?: number;
  endLine?: number;
}

// ---------------------------------------------------------------------------
// Git churn hotspots
// ---------------------------------------------------------------------------

export interface Hotspots {
  entries: Hotspot[];
  /** Short overall reading of what the hotspots tell a newcomer. */
  interpretation: string;
}

export type RecentActivity = "active" | "moderate" | "dormant";

export interface Hotspot {
  path: string;
  /** Number of commits touching this path in the analyzed window. */
  commits: number;
  /** Optional composite churn score (lines added+removed, or normalized). */
  churnScore?: number;
  recentActivity: RecentActivity;
  /** Why this path is hot and what that tells a newcomer. */
  insight: string;
}

// ---------------------------------------------------------------------------
// Setup / run / test
// ---------------------------------------------------------------------------

export interface SetupGuide {
  prerequisites: string[];
  setup: SetupStep[];
  run: SetupStep[];
  test: SetupStep[];
}

export interface SetupStep {
  title: string;
  /** Shell commands for this step, one per array element. */
  commands: string[];
  /** Optional caveats, gotchas, or context for this step. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Contributor guide
// ---------------------------------------------------------------------------

export type RiskSeverity = "low" | "medium" | "high";

export interface KnownRisk {
  title: string;
  severity: RiskSeverity;
  /** What can go wrong and why a contributor should care. */
  impact: string;
  /** Practical guardrail or recovery approach. */
  mitigation: string;
  /** Repo-relative files or directories where the risk is concentrated. */
  files: string[];
}

export interface ChangeRoute {
  /** A recognizable category of change, phrased in contributor language. */
  changeType: string;
  /** The first repo-relative file or directory to inspect. */
  primaryPath: string;
  /** Other repo-relative locations commonly involved in the change. */
  relatedPaths: string[];
  /** Why this is the correct ownership boundary for this kind of change. */
  rationale: string;
  /** Checks to run or evidence to gather before considering the change done. */
  verification: string[];
}

export interface ContributorGuide {
  knownRisks: KnownRisk[];
  changeRoutes: ChangeRoute[];
}

// ---------------------------------------------------------------------------
// Suggested first tasks
// ---------------------------------------------------------------------------

export type Difficulty = "easy" | "medium" | "hard";

export interface FirstTask {
  title: string;
  description: string;
  difficulty: Difficulty;
  /** Repo-relative files most relevant to this task. */
  files: string[];
  /** Why this is a good first task for a newcomer. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Validation issue contract
// ---------------------------------------------------------------------------

/**
 * A single, structured schema-validation problem — the canonical error shape
 * every validation surface emits: the `schema/validate.mjs --json` CLI output,
 * the web upload API (`POST /api/analyses`), the future BYO-model CLI, and the
 * token API. It is deliberately flat (short strings, no nested objects) so it
 * reads cleanly in a terminal, an HTTP response, and a UI row alike, and so an
 * agent can paste it straight back to regenerate a failing `analysis.json`.
 *
 * The runtime that derives these lives in `schema/validate-core.mjs`
 * (`validateAnalysisDocument`). The Next.js app can neither cleanly import that
 * ESM module nor this file's runtime from outside `web/`, so it keeps a mirror
 * of BOTH this type and the derivation logic in
 * `web/src/lib/validateAnalysis.ts`. This is the same mirroring doctrine the
 * Ajv config already follows. If you change this shape, change all three
 * (`schema/analysis.ts`, `schema/validate-core.mjs`, `validateAnalysis.ts`) in
 * lockstep.
 */
export interface ValidationIssue {
  /**
   * JSON Pointer (Ajv `instancePath`) to the offending location, e.g.
   * `/metadata/repoName` or `/pitch/techStack/0/category`. The document root
   * (an empty instancePath) is normalized to the literal string `"(root)"`.
   * For `additionalProperties` this points at the containing object; the
   * offending property name appears in `expected`.
   */
  path: string;
  /** Human-readable problem, taken verbatim from Ajv `message` (e.g. "must be integer"). */
  message: string;
  /**
   * The failing rule: an Ajv keyword (`required`, `enum`, `type`,
   * `additionalProperties`, `minItems`, `minLength`, `minimum`, `maximum`,
   * `pattern`, `format`, `contains`, …) or `"edge-integrity"` for the optional
   * dependency-graph cross-reference checks.
   */
  keyword: string;
  /**
   * Short, terminal-friendly rendering of what the schema expected, derived
   * from `keyword` + Ajv `params` — e.g. `property "repoName"`,
   * `one of: "easy", "medium", "hard"`, `type integer`, `at least 3 item(s)`,
   * `>= 0`. Omitted when the keyword carries no useful expectation.
   */
  expected?: string;
  /**
   * Short rendering of the offending value found at `path` (JSON-encoded,
   * truncated to 80 chars). `"undefined"` when the value is absent (e.g. a
   * missing `required` property).
   */
  got?: string;
}

/** Result of validating a document against the analysis schema. */
export type AnalysisValidationResult =
  | { valid: true; issues: [] }
  | { valid: false; issues: ValidationIssue[] };
