#!/usr/bin/env node
/**
 * Validate a JSON document against the Repo Onboarding analysis schema.
 *
 * Usage:
 *   node schema/validate.mjs <path-to-json>
 *
 * Exit codes:
 *   0  valid
 *   1  invalid (schema violations printed)
 *   2  usage / IO / schema-compile error
 *
 * This script is intentionally dependency-light (ajv + ajv-formats only) so
 * that WP2's /onboard skill and WP4's upload endpoint can reuse it verbatim.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "analysis.schema.json");

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
  const target = process.argv[2];
  if (!target) {
    fail(
      "Usage: node schema/validate.mjs <path-to-json>\n" +
        "Validates the given JSON file against schema/analysis.schema.json."
    );
  }

  const targetPath = resolve(process.cwd(), target);
  const schema = await loadJson(SCHEMA_PATH, "schema");
  const data = await loadJson(targetPath, "input document");

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    fail(`Failed to compile schema: ${err.message}`);
  }

  const valid = validate(data);
  if (valid) {
    console.log(`VALID: ${targetPath} conforms to analysis.schema.json`);
    process.exit(0);
  }

  console.error(`INVALID: ${targetPath} has ${validate.errors.length} error(s):\n`);
  for (const err of validate.errors) {
    const where = err.instancePath || "(root)";
    let msg = `  • ${where} ${err.message}`;
    if (err.keyword === "additionalProperties" && err.params?.additionalProperty) {
      msg += ` -> "${err.params.additionalProperty}"`;
    } else if (err.keyword === "enum" && err.params?.allowedValues) {
      msg += ` -> allowed: ${JSON.stringify(err.params.allowedValues)}`;
    } else if (err.keyword === "required" && err.params?.missingProperty) {
      msg += ` -> "${err.params.missingProperty}"`;
    }
    console.error(msg);
  }
  console.error("");
  process.exit(1);
}

main().catch((err) => fail(`Unexpected error: ${err.stack || err}`));
