/**
 * Server-side validation of uploaded analysis documents against
 * `schema/analysis.schema.json` (the same schema the /onboard skill targets).
 *
 * Uses Ajv 2020 with the exact configuration of the repo-root
 * `schema/validate.mjs` (`allErrors: true, strict: true` + ajv-formats) so the
 * upload endpoint accepts precisely what the schema defines. The compiled
 * validator is cached for the process lifetime.
 *
 * Server-only: reads the schema via `node:fs`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
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

export type ValidationResult =
  | { valid: true; data: Analysis }
  | { valid: false; errors: string[] };

/** Format a single Ajv error the way `schema/validate.mjs` does. */
function formatError(err: {
  instancePath?: string;
  message?: string;
  keyword?: string;
  params?: Record<string, unknown>;
}): string {
  const where = err.instancePath || "(root)";
  let msg = `${where} ${err.message ?? "is invalid"}`;
  const p = err.params ?? {};
  if (err.keyword === "additionalProperties" && p.additionalProperty) {
    msg += ` -> "${String(p.additionalProperty)}"`;
  } else if (err.keyword === "enum" && p.allowedValues) {
    msg += ` -> allowed: ${JSON.stringify(p.allowedValues)}`;
  } else if (err.keyword === "required" && p.missingProperty) {
    msg += ` -> "${String(p.missingProperty)}"`;
  }
  return msg;
}

/** Validate an already-parsed JSON value against the analysis schema. */
export async function validateAnalysis(
  data: unknown,
): Promise<ValidationResult> {
  const validate = await getValidator();
  if (validate(data)) {
    return { valid: true, data: data as Analysis };
  }
  const errors = (validate.errors ?? []).map(formatError);
  return {
    valid: false,
    errors: errors.length ? errors : ["Document does not match the schema."],
  };
}
