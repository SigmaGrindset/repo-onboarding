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
 * @property {string}  keyword   Failing rule: an Ajv keyword or
 *   `"edge-integrity"`.
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an already-parsed analysis document against the schema.
 *
 * @param {unknown} doc  The parsed JSON value to validate.
 * @param {{ checkEdges?: boolean }} [opts]  When `checkEdges` is true, also run
 *   the dependency-graph cross-reference checks and fold them into `issues`.
 * @returns {ValidationResult}
 */
export function validateAnalysisDocument(doc, opts = {}) {
  const validate = getValidator();
  const ok = validate(doc);
  const issues = ok ? [] : (validate.errors ?? []).map((err) => toIssue(err, doc));
  if (opts.checkEdges) {
    for (const extra of edgeIntegrityIssues(doc)) issues.push(extra);
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
