/**
 * Reusable validation core for Repo Onboarding analysis documents.
 *
 * This is the single source of truth for HOW a document is checked and, more
 * importantly, for the SHAPE of the errors it produces. Every downstream
 * surface consumes the {@link ValidationIssue} contract defined here:
 *   - `schema/validate.mjs` (the CLI, including its `--json` output)
 *   - the future BYO-model CLI (which will vendor this file verbatim)
 *   - the token API
 * The Next.js app keeps a hand-maintained mirror of this logic and the
 * TS `ValidationIssue` type in `web/src/lib/validateAnalysis.ts`, because it
 * cannot cleanly import this ESM module from outside `web/`. If you change the
 * issue shape or its derivation, update `schema/analysis.ts` and
 * `web/src/lib/validateAnalysis.ts` in lockstep.
 *
 * Dependency-light on purpose: ajv + ajv-formats only, so it can be vendored.
 *
 * @typedef {Object} ValidationIssue
 * @property {string}  path      JSON Pointer to the offending location; the
 *   root (empty instancePath) is normalized to the literal string `"(root)"`.
 * @property {string}  message   Human-readable problem (Ajv `message`).
 * @property {string}  keyword   Failing rule: an Ajv keyword or one of the
 *   cross-reference keywords (`"edge-integrity"`, `"resource-coverage"`,
 *   `"resource-origin"`, `"actor-coverage"`).
 * @property {string} [expected] Short rendering of what was expected, derived
 *   from `keyword` + Ajv `params`. Omitted when not meaningful.
 * @property {string} [got]      Short (<=80 char) rendering of the offending
 *   value at `path`; `"undefined"` when absent.
 *
 * @typedef {Object} ValidationResult
 * @property {boolean}           valid  True when there are zero issues.
 * @property {ValidationIssue[]} issues Empty when `valid`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "analysis.schema.json");

/** @type {import("ajv").ValidateFunction | null} */
let _validate = null;

/**
 * Compile (once) and return the schema validator. The Ajv configuration MUST
 * stay identical to `web/src/lib/validateAnalysis.ts`.
 * @returns {import("ajv").ValidateFunction}
 */
function getValidator() {
  if (!_validate) {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    _validate = ajv.compile(schema);
  }
  return _validate;
}

// ---------------------------------------------------------------------------
// Value rendering helpers (shared by both `got` and edge-integrity issues)
// ---------------------------------------------------------------------------

const MAX_VALUE_LEN = 80;

/** Truncate a display string to `max` chars with a trailing ellipsis. */
function truncate(text, max = MAX_VALUE_LEN) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Render an arbitrary JSON value as a short, quoted, truncated string. */
function renderValue(value) {
  if (value === undefined) return "undefined";
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return truncate(text);
}

/**
 * Resolve a JSON Pointer (Ajv `instancePath`) against the document.
 * Returns `undefined` if any segment is missing.
 */
function valueAtPointer(doc, pointer) {
  if (!pointer) return doc;
  const parts = pointer.split("/").slice(1);
  let cur = doc;
  for (const raw of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    cur = cur[key];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Ajv error -> ValidationIssue
// ---------------------------------------------------------------------------

/**
 * Derive the human-useful `expected` string from an Ajv keyword + params.
 * Returns `undefined` when the keyword carries no succinct expectation.
 */
function describeExpected(keyword, params) {
  const p = params ?? {};
  switch (keyword) {
    case "required":
      return `property "${p.missingProperty}"`;
    case "additionalProperties":
      return `no additional property "${p.additionalProperty}"`;
    case "enum": {
      const vals = Array.isArray(p.allowedValues) ? p.allowedValues : [];
      return `one of: ${vals.map((v) => JSON.stringify(v)).join(", ")}`;
    }
    case "type": {
      const t = Array.isArray(p.type) ? p.type.join(" or ") : String(p.type);
      return `type ${t}`;
    }
    case "minItems":
      return `at least ${p.limit} item(s)`;
    case "maxItems":
      return `at most ${p.limit} item(s)`;
    case "minLength":
      return `at least ${p.limit} character(s)`;
    case "maxLength":
      return `at most ${p.limit} character(s)`;
    case "minimum":
    case "maximum":
    case "exclusiveMinimum":
    case "exclusiveMaximum":
      return `${p.comparison} ${p.limit}`;
    case "multipleOf":
      return `a multiple of ${p.multipleOf}`;
    case "pattern":
      return `to match pattern /${p.pattern}/`;
    case "format":
      return `a valid ${p.format}`;
    case "const":
      return renderValue(p.allowedValue);
    case "contains":
      return `at least ${p.minContains ?? 1} matching item(s)`;
    default:
      return undefined;
  }
}

/** Render the offending value for an Ajv error. */
function deriveGot(err, doc) {
  if (err.keyword === "required") return "undefined";
  if (err.keyword === "additionalProperties") {
    const parent = valueAtPointer(doc, err.instancePath);
    const key = err.params?.additionalProperty;
    const value =
      parent !== null && typeof parent === "object" ? parent[key] : undefined;
    return renderValue(value);
  }
  return renderValue(valueAtPointer(doc, err.instancePath));
}

/**
 * Convert one Ajv error object into a {@link ValidationIssue}.
 * @returns {ValidationIssue}
 */
function toIssue(err, doc) {
  /** @type {ValidationIssue} */
  const issue = {
    path: err.instancePath || "(root)",
    message: err.message ?? "is invalid",
    keyword: err.keyword ?? "unknown",
  };
  const expected = describeExpected(err.keyword, err.params);
  if (expected !== undefined) issue.expected = expected;
  const got = deriveGot(err, doc);
  if (got !== undefined) issue.got = got;
  return issue;
}

// ---------------------------------------------------------------------------
// Edge-integrity checks (optional; mirrors edges-check.mjs as ValidationIssues)
// ---------------------------------------------------------------------------

/**
 * The JSON Schema validates structure but intentionally does NOT enforce that
 * every `dependencyGraph` edge references an existing node id, nor that node
 * ids are unique. This reproduces `.claude/skills/onboard/edges-check.mjs` as
 * {@link ValidationIssue}s with keyword `"edge-integrity"`. Structural problems
 * (nodes/edges missing or not arrays) are left to the schema and skipped here.
 * @returns {ValidationIssue[]}
 */
function edgeIntegrityIssues(doc) {
  /** @type {ValidationIssue[]} */
  const issues = [];
  const nodes = doc?.dependencyGraph?.nodes;
  const edges = doc?.dependencyGraph?.edges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return issues;

  const ids = new Set();
  nodes.forEach((n, i) => {
    const id = n?.id;
    if (ids.has(id)) {
      issues.push({
        path: `/dependencyGraph/nodes/${i}/id`,
        message: `duplicate node id ${renderValue(id)}`,
        keyword: "edge-integrity",
        expected: "a unique node id",
        got: renderValue(id),
      });
    }
    ids.add(id);
  });

  edges.forEach((e, i) => {
    for (const end of ["from", "to"]) {
      const ref = e?.[end];
      if (!ids.has(ref)) {
        issues.push({
          path: `/dependencyGraph/edges/${i}/${end}`,
          message: "edge references a node id that does not exist",
          keyword: "edge-integrity",
          expected: "an existing dependencyGraph.nodes[].id",
          got: renderValue(ref),
        });
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Learning-resource checks (optional; same spirit as the edge-integrity checks)
// ---------------------------------------------------------------------------

/**
 * Lowercase a URL host and drop a leading `www.`.
 * @param {string} host
 * @returns {string}
 */
function normalizeHost(host) {
  const h = host.toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

/**
 * The last two labels of a host, as an approximation of the registrable domain:
 * `docs.python.org` -> `python.org`. Deliberately not public-suffix-aware — the
 * rule exists to stop a generator wandering off a technology's documentation
 * site onto an invented blog, not to be a security boundary. Erring permissive
 * beats rejecting `docs.python.org` under `python.org`.
 * @param {string} host
 * @returns {string}
 */
function documentationDomain(host) {
  const labels = normalizeHost(host).split(".");
  return labels.length <= 2 ? labels.join(".") : labels.slice(-2).join(".");
}

/**
 * Parse an http(s) URL, returning null for anything unparseable or non-web.
 * @param {unknown} value
 * @returns {URL | null}
 */
function parseWebUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * The JSON Schema validates each learning-resource entry in isolation. It cannot
 * express the two rules that make the section trustworthy, both of which are
 * cross-references:
 *
 *   - `"resource-coverage"` — exactly one entry per `pitch.techStack[]` entry,
 *     joined by name. No gaps, no orphans, no duplicates.
 *   - `"resource-origin"` — every `resources[].url` sits on the same
 *     documentation domain as that entry's `official` URL, so a generator cannot
 *     invent links to pages that were never part of the technology's own docs.
 *
 * `learningResources` is optional (documents before schema 1.2.0 omit it), so an
 * absent key produces no issues. Structural problems are left to the schema.
 * @returns {ValidationIssue[]}
 */
function learningResourceIssues(doc) {
  /** @type {ValidationIssue[]} */
  const issues = [];
  const entries = doc?.learningResources;
  if (!Array.isArray(entries)) return issues;

  const stack = doc?.pitch?.techStack;
  const stackNames = Array.isArray(stack)
    ? stack.map((t) => t?.name).filter((n) => typeof n === "string")
    : [];

  // --- Coverage: the join between techStack and learningResources ----------
  const seen = new Map();
  entries.forEach((entry, i) => {
    const tech = entry?.tech;
    if (typeof tech !== "string") return;
    if (seen.has(tech)) {
      issues.push({
        path: `/learningResources/${i}/tech`,
        message: `duplicate learning-resource entry for ${renderValue(tech)}`,
        keyword: "resource-coverage",
        expected: "exactly one entry per techStack entry",
        got: renderValue(tech),
      });
      return;
    }
    seen.set(tech, i);
    if (!stackNames.includes(tech)) {
      issues.push({
        path: `/learningResources/${i}/tech`,
        message: "learning resources for a technology that is not in the tech stack",
        keyword: "resource-coverage",
        expected: "an existing pitch.techStack[].name",
        got: renderValue(tech),
      });
    }
  });

  for (const name of stackNames) {
    if (!seen.has(name)) {
      issues.push({
        path: "/learningResources",
        message: `no learning resources for tech stack entry ${renderValue(name)}`,
        keyword: "resource-coverage",
        expected: "one entry per techStack entry",
        got: "undefined",
      });
    }
  }

  // --- Origin: resources must stay on the official documentation domain ----
  entries.forEach((entry, i) => {
    if (entry?.official === null || entry?.official === undefined) return;
    const official = parseWebUrl(entry.official);
    if (!official) {
      issues.push({
        path: `/learningResources/${i}/official`,
        message: "official entry point is not a usable http(s) URL",
        keyword: "resource-origin",
        expected: "an absolute http(s) URL, or null",
        got: renderValue(entry.official),
      });
      return;
    }

    const domain = documentationDomain(official.host);
    const resources = Array.isArray(entry?.resources) ? entry.resources : [];
    resources.forEach((resource, j) => {
      const url = parseWebUrl(resource?.url);
      if (!url) {
        issues.push({
          path: `/learningResources/${i}/resources/${j}/url`,
          message: "resource is not a usable http(s) URL",
          keyword: "resource-origin",
          expected: "an absolute http(s) URL",
          got: renderValue(resource?.url),
        });
        return;
      }
      if (documentationDomain(url.host) !== domain) {
        issues.push({
          path: `/learningResources/${i}/resources/${j}/url`,
          message: "resource is not on the technology's own documentation domain",
          keyword: "resource-origin",
          expected: `a URL on ${domain}`,
          got: renderValue(url.host),
        });
      }
    });
  });

  return issues;
}

// ---------------------------------------------------------------------------
// API-surface checks (optional; the actor join the schema cannot express)
// ---------------------------------------------------------------------------

/**
 * `apiSurface.actors` is optional — a repository that only distinguishes public
 * callers from authenticated ones expresses that in the route entries alone —
 * but a document that carries the list is making a claim about its own routes.
 * The schema can shape each entry and cannot check that claim, because it is a
 * cross-reference:
 *
 *   - `"actor-coverage"` — every actor described is required by at least one
 *     route, every actor a route requires is described, and no actor is
 *     described twice.
 *
 * The same shape as `resource-coverage` above, and for the reason recorded in
 * ADR 0001: a join by name drifts unless something checks it. String comparison
 * only — no network, no clock — per ADR 0002. An absent list produces no
 * issues; structural problems are left to the schema.
 * @returns {ValidationIssue[]}
 */
function apiSurfaceIssues(doc) {
  /** @type {ValidationIssue[]} */
  const issues = [];
  const actors = doc?.apiSurface?.actors;
  if (!Array.isArray(actors)) return issues;

  const routes = Array.isArray(doc?.apiSurface?.routes)
    ? doc.apiSurface.routes
    : [];

  // Each required actor mapped to the FIRST route requiring it, in document
  // order, so a gap can be reported with somewhere to go and look at it.
  const requiredBy = new Map();
  for (const route of routes) {
    const actor = route?.actor;
    if (typeof actor !== "string" || requiredBy.has(actor)) continue;
    requiredBy.set(actor, `${route?.method ?? "?"} ${route?.path ?? "?"}`);
  }

  const described = new Set();
  actors.forEach((actor, i) => {
    const name = actor?.name;
    if (typeof name !== "string") return;
    if (described.has(name)) {
      issues.push({
        path: `/apiSurface/actors/${i}/name`,
        message: `duplicate actor entry for ${renderValue(name)}`,
        keyword: "actor-coverage",
        expected: "exactly one entry per actor",
        got: renderValue(name),
      });
      return;
    }
    described.add(name);
    if (!requiredBy.has(name)) {
      issues.push({
        path: `/apiSurface/actors/${i}/name`,
        message: "an actor described here that no route requires",
        keyword: "actor-coverage",
        expected: "an actor named by at least one apiSurface.routes[].actor",
        got: renderValue(name),
      });
    }
  });

  for (const [name, route] of requiredBy) {
    if (described.has(name)) continue;
    issues.push({
      path: "/apiSurface/actors",
      message: `no actor entry for ${renderValue(name)}, required by ${route}`,
      keyword: "actor-coverage",
      expected: "one entry per actor a route requires",
      got: "undefined",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an already-parsed analysis document against the schema.
 *
 * @param {unknown} doc  The parsed JSON value to validate.
 * @param {{ crossRefs?: boolean, checkEdges?: boolean }} [opts]  When
 *   `crossRefs` is true, also run every cross-reference check the schema cannot
 *   express — dependency-graph edge integrity, learning-resource coverage and
 *   origin, and the API surface's actor coverage — and fold them into `issues`.
 *   `checkEdges` is the original name for the same switch, still honoured so
 *   vendored copies keep working.
 * @returns {ValidationResult}
 */
export function validateAnalysisDocument(doc, opts = {}) {
  const validate = getValidator();
  const ok = validate(doc);
  const issues = ok ? [] : (validate.errors ?? []).map((err) => toIssue(err, doc));
  if (opts.crossRefs ?? opts.checkEdges) {
    for (const extra of edgeIntegrityIssues(doc)) issues.push(extra);
    for (const extra of learningResourceIssues(doc)) issues.push(extra);
    for (const extra of apiSurfaceIssues(doc)) issues.push(extra);
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Render a single issue as human-readable lines for a terminal. Returns one or
 * two lines: the `• path message` headline, and an indented `expected … · got …`
 * detail line when either is present.
 * @param {ValidationIssue} issue
 * @returns {string}
 */
export function formatIssueHuman(issue) {
  let out = `  • ${issue.path} ${issue.message}`;
  const bits = [];
  if (issue.expected !== undefined) bits.push(`expected ${issue.expected}`);
  if (issue.got !== undefined) bits.push(`got ${issue.got}`);
  if (bits.length) out += `\n      ${bits.join(" · ")}`;
  return out;
}
