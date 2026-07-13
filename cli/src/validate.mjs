/**
 * `repo-onboarding validate <file> [--json]`
 *
 * Validates an analysis document against the vendored schema AND the
 * dependency-graph edge-integrity rules (folded in via checkEdges). Human
 * output mirrors schema/validate.mjs; `--json` emits `{ valid, issues }`.
 *
 * Exit codes: 0 valid · 1 invalid · 2 usage / IO / parse error.
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";

import {
  validateAnalysisDocument,
  formatIssueHuman,
} from "../vendor/validate-core.mjs";
import { SUPPORTED_SCHEMA_VERSION } from "./constants.mjs";
import {
  CliError,
  readTextFileOrThrow,
  parseJsonOrThrow,
  compareVersions,
} from "./util.mjs";

const USAGE =
  "Usage: repo-onboarding validate <file> [--json]\n" +
  "Validate an analysis.json against the schema and edge integrity.";

/**
 * Warn (without failing) when a document targets a newer contract than this CLI
 * understands, so the operator knows their tooling may be behind.
 * @param {unknown} doc
 */
function warnIfNewerSchema(doc) {
  const version = doc && typeof doc === "object" ? doc.schemaVersion : undefined;
  if (
    typeof version === "string" &&
    /^\d+\.\d+\.\d+$/.test(version) &&
    compareVersions(version, SUPPORTED_SCHEMA_VERSION) > 0
  ) {
    console.error(
      `Warning: document schemaVersion ${version} is newer than this CLI's ` +
        `supported ${SUPPORTED_SCHEMA_VERSION}. Validation still ran, but ` +
        "consider upgrading: npm install -g repo-onboarding@latest",
    );
  }
}

/**
 * @param {string[]} args raw args after the `validate` command
 * @returns {number} exit code
 */
export function runValidate(args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: { json: { type: "boolean", default: false } },
    });
  } catch (err) {
    throw new CliError(`${err.message}\n\n${USAGE}`, 2);
  }

  const target = parsed.positionals[0];
  if (!target) throw new CliError(USAGE, 2);
  const asJson = parsed.values.json;

  const targetPath = resolve(process.cwd(), target);
  const text = readTextFileOrThrow(targetPath, "input document");
  const doc = parseJsonOrThrow(text, `input document at ${targetPath}`);

  warnIfNewerSchema(doc);

  const result = validateAnalysisDocument(doc, { checkEdges: true });

  if (asJson) {
    // Machine-readable: only JSON on stdout; exit code still signals validity.
    console.log(
      JSON.stringify({ valid: result.valid, issues: result.issues }, null, 2),
    );
    return result.valid ? 0 : 1;
  }

  if (result.valid) {
    console.log(`VALID: ${targetPath} conforms to the analysis schema.`);
    return 0;
  }

  console.error(
    `INVALID: ${targetPath} has ${result.issues.length} error(s):\n`,
  );
  for (const issue of result.issues) console.error(formatIssueHuman(issue));
  console.error("");
  return 1;
}
