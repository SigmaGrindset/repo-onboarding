#!/usr/bin/env node
/**
 * repo-onboarding — command dispatcher.
 *
 * Commands: init (default) · prepass · validate · upload.
 * Global: --help / -h, --version / -v.
 */

import process from "node:process";

import { PKG_VERSION, SITE_URL } from "../src/constants.mjs";
import { CliError } from "../src/util.mjs";
import { runInit } from "../src/init.mjs";
import { runPrepass } from "../src/prepass.mjs";
import { runValidate } from "../src/validate.mjs";
import { runUpload } from "../src/upload.mjs";

const USAGE = `repo-onboarding <command> [options]

Turn a codebase into an interactive onboarding site. Your own AI coding agent
does the deep reading; the hosted viewer renders the result.

Commands:
  init [path]                 Prepare a repo for analysis (default path: .).
                              Writes .repo-onboarding/ with the pre-pass facts,
                              a PROMPT for your agent, and the analysis schema.
  prepass <path> [options]    Run only the deterministic facts pre-pass.
                              [--out <file>] [--commits <n>] [--pretty]
  validate <file> [--json]    Validate an analysis.json against the schema and
                              dependency-graph edge integrity.
  upload <file> [options]     Publish a validated analysis.json to the viewer.
                              [--api <base>] [--token <token>]

Options:
  -h, --help                  Show this help.
  -v, --version               Show the version.

Token: create one at ${SITE_URL}/account and set REPO_ONBOARDING_TOKEN
(or pass --token) before uploading.

Docs: https://github.com/SigmaGrindset/repo-onboarding`;

async function dispatch(argv) {
  const [command, ...rest] = argv;

  switch (command) {
    case undefined:
      // No command → default to init on the current directory.
      return runInit([]);
    case "init":
      return runInit(rest);
    case "prepass":
      return runPrepass(rest);
    case "validate":
      return runValidate(rest);
    case "upload":
      return runUpload(rest);
    case "-v":
    case "--version":
      console.log(PKG_VERSION);
      return 0;
    case "-h":
    case "--help":
    case "help":
      console.log(USAGE);
      return 0;
    default:
      throw new CliError(
        `Unknown command: ${command}\n\n${USAGE}`,
        2,
      );
  }
}

dispatch(process.argv.slice(2))
  .then((code) => process.exit(typeof code === "number" ? code : 0))
  .catch((err) => {
    if (err instanceof CliError) {
      console.error(err.message);
      process.exit(err.code);
    }
    console.error(`Unexpected error: ${err?.stack || err}`);
    process.exit(2);
  });
