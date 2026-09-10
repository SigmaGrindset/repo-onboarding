/**
 * Repo Onboarding — analysis document types.
 *
 * These types are the hand-maintained TypeScript mirror of
 * `schema/analysis.schema.json`. They MUST agree with the JSON Schema exactly.
 * The schema is the source of truth for validation; these types are the source
 * of truth for compile-time safety in the skill and the web viewer.
 *
 * Contract version: schemaVersion "1.3.0".
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
  /**
   * How a reader comes up to speed on each technology. Exactly one entry per
   * `pitch.techStack` entry, joined by name. Absent in documents produced
   * before schema 1.2.0.
   */
  learningResources?: LearningResourceEntry[];
  /**
   * Everything this repository exposes to callers over the network. Introduced
   * in schema 1.3.0. A SPECIALIZED section: present exactly when the repository
   * has a real API, absent entirely otherwise — the viewer shows no tab and no
   * empty state. See `docs/adr/0004-sections-are-declared-by-presence.md`.
   */
  apiSurface?: ApiSurface;
  /**
   * How this repository's interface is built. Introduced in schema 1.3.0. A
   * SPECIALIZED section: present exactly when the repository has a design
   * system of its own, absent entirely otherwise — the viewer shows no tab and
   * no empty state. See `docs/adr/0005-design-system-judgement-not-inventory.md`.
   */
  designSystem?: DesignSystem;
  /**
   * How committed code reaches a running environment. Introduced in schema
   * 1.3.0. A SPECIALIZED section: present exactly when the repository commits
   * something about its own pipeline, absent entirely otherwise — the viewer
   * shows no tab and no empty state. It stops at what is committed, which is a
   * boundary rather than an omission.
   * See `docs/adr/0006-delivery-stops-at-what-is-committed.md`.
   */
  delivery?: Delivery;
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
// Learning resources
// ---------------------------------------------------------------------------

/** tutorial = build step by step · guide = read through · reference = look up. */
export type LearningResourceKind = "tutorial" | "guide" | "reference";

export interface LearningResource {
  title: string;
  /** Shares a host with the entry's `official` URL. */
  url: string;
  kind: LearningResourceKind;
  /** Why THIS repo's reader should open this page. */
  why: string;
}

/** Grounds a technology in this repository. */
export interface InRepoPointer {
  /** What to notice about how THIS repo uses the technology. */
  note: string;
  files: FileRef[];
}

export interface LearningResourceEntry {
  /** Exactly matches a `pitch.techStack[].name`. */
  tech: string;
  /**
   * Canonical documentation entry point, or `null` when the technology has no
   * public documentation (internal / proprietary). `resources` is then empty.
   */
  official: string | null;
  /** 1-4 pages beneath `official` on the same host; empty when `official` is null. */
  resources: LearningResource[];
  inRepo: InRepoPointer;
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

/**
 * HTTP method. `ANY` covers a handler registered for every method (an Express
 * `app.all`, a catch-all middleware); `WS` covers a WebSocket upgrade route.
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "ANY"
  | "WS";

/** One route the repository exposes to callers. */
export interface ApiRoute {
  method: HttpMethod;
  /**
   * The route as a caller addresses it, with parameter placeholders in the
   * repository's own notation (`/api/analyses/[id]`, `/users/:id`,
   * `/items/{item_id}`).
   */
  path: string;
  /** Repo-relative file implementing this route — where a reader goes to change it. */
  file: string;
  /**
   * The class of caller permitted to call this route, named with what it can do
   * in this repository. Machine callers are actors too.
   */
  actor: string;
  /**
   * Optional prose on what this route does and why a newcomer should care.
   * Only for the routes that are genuinely instructive; most carry none.
   */
  note?: string;
}

/**
 * One class of caller the API surface distinguishes between, joined by name to
 * the routes that require it.
 */
export interface ApiActor {
  /** Matches the `actor` of every route requiring it, character for character. */
  name: string;
  /**
   * What this actor can do in THIS repository, in a line. Machine callers get
   * one too — a service account, a scheduled job or a webhook sender is an
   * actor.
   */
  summary: string;
}

/**
 * What this repository exposes over the network. `routes` is exhaustive rather
 * than curated on purpose: a reader must be able to conclude that a route not
 * listed does not exist. Curation applies to `ApiRoute.note`, where attention
 * is scarce.
 *
 * `actors` is optional — a repository that only separates public callers from
 * authenticated ones says so in the routes alone. When present it is a claim
 * about the routes, and the two must agree exactly: the `actor-coverage` rule
 * fails a document where an actor is described but required by no route, or
 * required by a route and described nowhere.
 */
export interface ApiSurface {
  routes: ApiRoute[];
  actors?: ApiActor[];
}

// ---------------------------------------------------------------------------
// Design system
// ---------------------------------------------------------------------------

/**
 * One kind of design decision that has been given names — colour, spacing,
 * typography, elevation, layering. SAMPLED, never enumerated: the `file` is the
 * inventory and stays correct as the repository repaints, and this entry is the
 * way into it.
 */
export interface DesignTokenGroup {
  /** What this group is called here ("Colour", "Spacing", "Elevation"). */
  name: string;
  /** Repo-relative file the group is defined in — the real inventory. */
  file: string;
  /**
   * How a value from this group is referenced in code, in this repository's own
   * notation (`text-muted`, `var(--surface-2)`, `theme.space[3]`).
   */
  usage: string;
  /**
   * A representative handful of token NAMES — never values, which rot faster
   * than anything else in an analysis document and rot invisibly. Two to eight,
   * capped so that "sample" is a contract rather than a hope.
   */
  examples: string[];
}

/**
 * One component the interface is built FROM rather than one built for a screen.
 * `use` sits on every entry rather than a curated few, because a primitive's
 * name says nothing about when to reach for it.
 */
export interface DesignPrimitive {
  name: string;
  /** Repo-relative file implementing it. */
  file: string;
  /** What a reader reaches for it for, in this repository's terms. */
  use: string;
}

/**
 * The judgement a newcomer would otherwise get wrong. Two halves rather than
 * one, because an engine asked for a single rule writes the platitude half and
 * drops the test for when creating is right.
 */
export interface ReuseRule {
  /** When to reach for an existing primitive, and how to find the one that exists. */
  reuseWhen: string;
  /** The test for when writing a new primitive is the right call instead. */
  createWhen: string;
  /** Repo-relative file or directory a genuinely new primitive belongs in. */
  newPrimitiveHome: string;
}

/**
 * How this repository's interface is built. A SPECIALIZED section: present
 * exactly when the repository has a design system of its own, absent entirely
 * otherwise — the viewer shows no tab and no empty state.
 *
 * The two lists carry different promises and the section must not blur them: if
 * a primitive is not listed it does not exist, while a token not listed very
 * likely does exist and this is not where you would find it. See
 * `docs/adr/0005-design-system-judgement-not-inventory.md`.
 */
export interface DesignSystem {
  /** The one way styles are written here, and the second way not to introduce. */
  approach: string;
  /** Sampled by group; the files they name are the inventory. */
  tokens: DesignTokenGroup[];
  /** Exhaustive within the boundary the analysis engine draws. */
  primitives: DesignPrimitive[];
  reuseRule: ReuseRule;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * What a deploy actually runs, and the committed file that defines producing
 * it. Required rather than optional: every repository that delivers produces
 * something, and "nothing is compiled, the source is the artefact" is an
 * answer rather than an absence.
 */
export interface DeliveryBuild {
  /** What a deploy runs, in this repository's terms — not just its file type. */
  produces: string;
  /** Repo-relative file defining how it is produced. */
  file: string;
  /** The command that produces it, where the file names one. */
  command?: string;
}

/**
 * One automated check a change must pass, at the grain a reader could run it
 * at — usually a job, sometimes a single step where a job runs several
 * distinct checks. "Must pass" is what keeps the stale-bot workflow out.
 */
export interface DeliveryGate {
  /** The job or step name a reader sees reported against their pull request. */
  name: string;
  /** Repo-relative workflow or configuration file defining it. */
  file: string;
  /** What it checks and what makes it fail — a job called `web` says nothing. */
  checks: string;
  /** The command that pre-empts it locally, where there is one. */
  runLocally?: string;
}

/**
 * One place committed configuration deploys to. The `file` is the boundary in
 * its operative form: a branch-to-environment mapping that lives only in a
 * hosting dashboard cannot be read, so it is not written down.
 */
export interface DeliveryEnvironment {
  name: string;
  /** The branch, tag pattern or event that reaches it. */
  deployedFrom: string;
  /** Repo-relative file that maps that branch, tag or event to this place. */
  file: string;
}

/**
 * What applies this repository's migrations, and when. Its own key because its
 * most useful answer is frequently "nothing does — a person runs the command by
 * hand", which no gate row and no environment row can carry.
 */
export interface DeliveryMigrations {
  /** Repo-relative directory the migration files live in. */
  directory: string;
  /** What applies them and when, including "nothing in the pipeline does". */
  appliedBy: string;
  /** The command that applies them, where there is one. */
  command?: string;
}

/**
 * One name a deploy must have a value for. NEVER a value: an analysis document
 * is shared, exported and fed to a chat model, and a value beside a database
 * URL is a leak rather than a stale fact. See
 * `docs/adr/0006-delivery-stops-at-what-is-committed.md`.
 */
export interface DeployVariable {
  name: string;
  /** What a deploy needs it for — what fails to boot without it. */
  purpose: string;
  /** Repo-relative file that declares it. */
  file: string;
}

/**
 * How committed code reaches a running environment. A SPECIALIZED section:
 * present exactly when the repository commits something about its own
 * pipeline, absent entirely otherwise — the viewer shows no tab and no empty
 * state.
 *
 * The section stops at what is committed, and this shape is what stops it:
 * every entry is anchored to a committed file or directory, and there is
 * nowhere to hold a dashboard, a log query, a rollback procedure or an on-call
 * rota. Anything rendering this must not invent that half back — the fixed
 * sentence the viewer states about the boundary is the viewer's, and the
 * document never carries it. See
 * `docs/adr/0006-delivery-stops-at-what-is-committed.md`.
 */
export interface Delivery {
  /** Push to running, as one narrative — the only place the whole shape is stated. */
  pipeline: string;
  build: DeliveryBuild;
  /** Exhaustive: a check not listed is one that does not run. */
  gates: DeliveryGate[];
  /** Optional — a mapping with no committed file cannot be cited. */
  environments?: DeliveryEnvironment[];
  migrations?: DeliveryMigrations;
  /** Exhaustive when present, and names only — never values. */
  deployVariables?: DeployVariable[];
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
   * `pattern`, `format`, `contains`, …) or one of the optional cross-reference
   * keywords: `"edge-integrity"` (dependency-graph nodes/edges),
   * `"resource-coverage"` and `"resource-origin"` (learning resources), and
   * `"actor-coverage"` (the API surface's actor-to-route join).
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
