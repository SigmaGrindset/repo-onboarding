#!/usr/bin/env node
/**
 * Validate a JSON document against the Repo Onboarding analysis schema.
 *
 * Usage:
 *   node schema/validate.mjs <path-to-json> [--json]
 *
 * Options:
 *   --json   Print `{ valid, issues }` as JSON to stdout (machine-readable for
 *            agents). Exit codes are unchanged; nothing is written to stderr on
 *            a validation failure in this mode.
 *
 * Exit codes:
 *   0  valid
 *   1  invalid (schema violations printed)
 *   2  usage / IO / schema-compile error
 *
 * This is a thin CLI over `schema/validate-core.mjs`, which owns the Ajv setup
 * and the canonical {@link ValidationIssue} error contract. The /onboard skill
 * and the web upload endpoint reuse that same core, so error shapes stay
 * identical everywhere. `schema/edges-check.mjs` remains a separate standalone
 * script (the skill invokes it directly).
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { validateAnalysisDocument, formatIssueHuman } from "./validate-core.mjs";

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

async function loadJson(path, label) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    fail(`Could not read ${label} at ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`${label} at ${path} is not valid JSON: ${err.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    fail(
      "Usage: node schema/validate.mjs <path-to-json> [--json]\n" +
        "Validates the given JSON file against schema/analysis.schema.json.",
    );
  }

  const targetPath = resolve(process.cwd(), target);
  const data = await loadJson(targetPath, "input document");

  let result;
  try {
    result = validateAnalysisDocument(data);
  } catch (err) {
    fail(`Failed to compile/load schema: ${err.message}`);
  }

  if (json) {
    // Machine-readable: only JSON on stdout, exit code still signals validity.
    console.log(JSON.stringify({ valid: result.valid, issues: result.issues }, null, 2));
    process.exit(result.valid ? 0 : 1);
  }

  if (result.valid) {
    console.log(`VALID: ${targetPath} conforms to analysis.schema.json`);
    process.exit(0);
  }

  console.error(`INVALID: ${targetPath} has ${result.issues.length} error(s):\n`);
  for (const issue of result.issues) {
    console.error(formatIssueHuman(issue));
  }
  console.error("");
  process.exit(1);
}

main().catch((err) => fail(`Unexpected error: ${err.stack || err}`));
