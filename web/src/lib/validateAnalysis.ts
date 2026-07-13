/**
 * Server-side validation of uploaded analysis documents against
 * `schema/analysis.schema.json` (the same schema the /onboard skill targets).
 *
 * Uses Ajv 2020 with the exact configuration of the repo-root
 * `schema/validate.mjs` / `schema/validate-core.mjs` (`allErrors: true,
 * strict: true` + ajv-formats) so the upload endpoint accepts precisely what
 * the schema defines. The compiled validator is cached for the process
 * lifetime.
 *
 * MIRROR NOTICE: `ValidationIssue` and the error-derivation helpers below are a
 * hand-maintained copy of `schema/validate-core.mjs` (and the canonical
 * `ValidationIssue` type in `schema/analysis.ts`). Next.js cannot cleanly
 * import that ESM module or the sibling `.ts` runtime from outside `web/`, so
 * the logic is duplicated here — the same doctrine as the duplicated Ajv config
 * above. Keep all three in lockstep. This file deliberately does NOT run the
 * edge-integrity checks: the upload path is schema-only.
 *
 * Server-only: reads the schema via `node:fs`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { Analysis } from "@schema/analysis";

/**
 * Schema lives at the repo root, one level above `web/` (which is `cwd` in dev,
 * build and start). Matches how the fs data source locates `../data`.
 */
const SCHEMA_PATH = path.join(
  process.cwd(),
  "..",
  "schema",
  "analysis.schema.json",
);

let validatorPromise: Promise<ValidateFunction> | null = null;

async function getValidator(): Promise<ValidateFunction> {
  if (!validatorPromise) {
    validatorPromise = (async () => {
      const raw = await fs.readFile(SCHEMA_PATH, "utf8");
      const schema = JSON.parse(raw);
      const ajv = new Ajv2020({ allErrors: true, strict: true });
      addFormats(ajv);
      return ajv.compile(schema);
    })();
  }
  return validatorPromise;
}

/**
 * A single, structured schema-validation problem. MIRROR of `ValidationIssue`
 * in `schema/analysis.ts` and the JSDoc typedef in `schema/validate-core.mjs`.
 */
export interface ValidationIssue {
  /** JSON Pointer to the offending location; the root is `"(root)"`. */
  path: string;
  /** Human-readable problem (Ajv `message`). */
  message: string;
  /** Failing Ajv keyword (`required`, `enum`, `type`, …). */
  keyword: string;
  /** Short rendering of what was expected, or omitted. */
  expected?: string;
  /** Short (<=80 char) rendering of the offending value; `"undefined"` if absent. */
  got?: string;
}

export type ValidationResult =
  | { valid: true; data: Analysis }
  | { valid: false; issues: ValidationIssue[] };

// --- Issue derivation (mirror of schema/validate-core.mjs) ------------------

const MAX_VALUE_LEN = 80;

function truncate(text: string, max = MAX_VALUE_LEN): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderValue(value: unknown): string {
  if (value === undefined) return "undefined";
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return truncate(text);
}

function valueAtPointer(doc: unknown, pointer: string): unknown {
  if (!pointer) return doc;
  const parts = pointer.split("/").slice(1);
  let cur: unknown = doc;
  for (const raw of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function describeExpected(
  keyword: string,
  params: Record<string, unknown>,
): string | undefined {
  const p = params ?? {};
  switch (keyword) {
    case "required":
      return `property "${String(p.missingProperty)}"`;
    case "additionalProperties":
      return `no additional property "${String(p.additionalProperty)}"`;
    case "enum": {
      const vals = Array.isArray(p.allowedValues) ? p.allowedValues : [];
      return `one of: ${vals.map((v) => JSON.stringify(v)).join(", ")}`;
    }
    case "type": {
      const t = Array.isArray(p.type) ? p.type.join(" or ") : String(p.type);
      return `type ${t}`;
    }
    case "minItems":
      return `at least ${String(p.limit)} item(s)`;
    case "maxItems":
      return `at most ${String(p.limit)} item(s)`;
    case "minLength":
      return `at least ${String(p.limit)} character(s)`;
    case "maxLength":
      return `at most ${String(p.limit)} character(s)`;
    case "minimum":
    case "maximum":
    case "exclusiveMinimum":
    case "exclusiveMaximum":
      return `${String(p.comparison)} ${String(p.limit)}`;
    case "multipleOf":
      return `a multiple of ${String(p.multipleOf)}`;
    case "pattern":
      return `to match pattern /${String(p.pattern)}/`;
    case "format":
      return `a valid ${String(p.format)}`;
    case "const":
      return renderValue(p.allowedValue);
    case "contains":
      return `at least ${String(p.minContains ?? 1)} matching item(s)`;
    default:
      return undefined;
  }
}

function deriveGot(err: ErrorObject, doc: unknown): string {
  if (err.keyword === "required") return "undefined";
  if (err.keyword === "additionalProperties") {
    const parent = valueAtPointer(doc, err.instancePath);
    const key = (err.params as { additionalProperty?: string })
      ?.additionalProperty;
    const value =
      parent !== null && typeof parent === "object" && key !== undefined
        ? (parent as Record<string, unknown>)[key]
        : undefined;
    return renderValue(value);
  }
  return renderValue(valueAtPointer(doc, err.instancePath));
}

function toIssue(err: ErrorObject, doc: unknown): ValidationIssue {
  const issue: ValidationIssue = {
    path: err.instancePath || "(root)",
    message: err.message ?? "is invalid",
    keyword: err.keyword ?? "unknown",
  };
  const expected = describeExpected(
    err.keyword,
    err.params as Record<string, unknown>,
  );
  if (expected !== undefined) issue.expected = expected;
  issue.got = deriveGot(err, doc);
  return issue;
}

/** Validate an already-parsed JSON value against the analysis schema. */
export async function validateAnalysis(
  data: unknown,
): Promise<ValidationResult> {
  const validate = await getValidator();
  if (validate(data)) {
    return { valid: true, data: data as Analysis };
  }
  const issues = (validate.errors ?? []).map((err) => toIssue(err, data));
  return {
    valid: false,
    issues: issues.length
      ? issues
      : [
          {
            path: "(root)",
            message: "Document does not match the schema.",
            keyword: "unknown",
          },
        ],
  };
}
