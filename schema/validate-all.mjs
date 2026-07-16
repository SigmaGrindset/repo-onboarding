#!/usr/bin/env node
/** Validate every data/<id>/analysis.json fixture with the canonical schema. */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { formatIssueHuman, validateAnalysisDocument } from "./validate-core.mjs";

const dataDir = path.resolve(process.cwd(), "data");

async function main() {
  const entries = await readdir(dataDir, { withFileTypes: true });
  const fixtureDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (fixtureDirs.length === 0) {
    throw new Error(`No fixture directories found in ${dataDir}`);
  }

  let failures = 0;
  for (const id of fixtureDirs) {
    const file = path.join(dataDir, id, "analysis.json");
    let document;
    try {
      document = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      failures += 1;
      console.error(`INVALID: ${file}: ${error.message}`);
      continue;
    }

    const result = validateAnalysisDocument(document);
    if (result.valid) {
      console.log(`VALID: ${file}`);
      continue;
    }

    failures += 1;
    console.error(`INVALID: ${file} has ${result.issues.length} error(s):`);
    for (const issue of result.issues) {
      console.error(`  ${formatIssueHuman(issue)}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} analysis fixture(s) failed validation.`);
    process.exit(1);
  }

  console.log(`\nValidated ${fixtureDirs.length} analysis fixture(s).`);
}

main().catch((error) => {
  console.error(`Schema validation failed: ${error.stack || error}`);
  process.exit(2);
});
