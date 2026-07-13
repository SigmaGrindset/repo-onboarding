/**
 * `repo-onboarding init [path]` (also the default command)
 *
 * Prepares a target repo for BYO-model analysis. It runs the vendored
 * deterministic pre-pass and writes three artifacts into `<target>/.repo-onboarding/`:
 *   - prepass.json  the hard, verifiable facts (files, LOC, languages, churn)
 *   - PROMPT.md     the agent-agnostic analysis protocol (rendered from a template)
 *   - schema.json   the analysis schema the agent must target
 * Then it prints a friendly next-steps block.
 *
 * Exit codes: 0 success · 2 usage / IO error.
 */

import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";

import {
  VENDOR_DIR,
  TEMPLATES_DIR,
  WORK_DIR_NAME,
  SUPPORTED_SCHEMA_VERSION,
  ANALYZER_VERSION,
  SITE_URL,
  TOKEN_ENV,
} from "./constants.mjs";
import { CliError } from "./util.mjs";

const USAGE =
  "Usage: repo-onboarding init [path]\n" +
  "Prepare a repo for analysis (default path: current directory).";

/** Fill {{TOKENS}} in a template string from a values map. */
function render(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

/**
 * @param {string[]} args raw args after the `init` command
 * @returns {number} exit code
 */
export function runInit(args) {
  let parsed;
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: {} });
  } catch (err) {
    throw new CliError(`${err.message}\n\n${USAGE}`, 2);
  }

  const target = resolve(process.cwd(), parsed.positionals[0] ?? ".");

  let st;
  try {
    st = statSync(target);
  } catch (err) {
    throw new CliError(`Cannot access target path ${target}: ${err.message}`, 2);
  }
  if (!st.isDirectory()) {
    throw new CliError(`Target path is not a directory: ${target}`, 2);
  }

  const workDir = join(target, WORK_DIR_NAME);
  try {
    mkdirSync(workDir, { recursive: true });
  } catch (err) {
    throw new CliError(`Could not create ${workDir}: ${err.message}`, 2);
  }

  const prepassOut = join(workDir, "prepass.json");
  const promptOut = join(workDir, "PROMPT.md");
  const schemaOut = join(workDir, "schema.json");

  // ---- Run the vendored pre-pass, writing pretty JSON to prepass.json. ------
  const prepassScript = resolve(VENDOR_DIR, "prepass.mjs");
  try {
    execFileSync(
      process.execPath,
      [prepassScript, target, "--out", prepassOut, "--pretty"],
      { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
    );
  } catch (err) {
    const detail = err.stderr ? String(err.stderr).trim() : err.message;
    throw new CliError(`Pre-pass failed: ${detail}`, 2);
  }

  // ---- Read the facts back for rendering + the friendly summary. ------------
  let prepass;
  try {
    prepass = JSON.parse(readFileSync(prepassOut, "utf8"));
  } catch (err) {
    throw new CliError(`Could not read pre-pass output ${prepassOut}: ${err.message}`, 2);
  }

  const repoName = prepass.repoName || basename(target) || "this-repo";
  const isRepo = Boolean(prepass?.git?.isRepo);

  // ---- Copy the schema so the agent can read it without the npm cache path. -
  try {
    copyFileSync(resolve(VENDOR_DIR, "analysis.schema.json"), schemaOut);
  } catch (err) {
    throw new CliError(`Could not write ${schemaOut}: ${err.message}`, 2);
  }

  // ---- Render PROMPT.md from the template. ----------------------------------
  let template;
  try {
    template = readFileSync(resolve(TEMPLATES_DIR, "PROMPT.md"), "utf8");
  } catch (err) {
    throw new CliError(`Could not read PROMPT template: ${err.message}`, 2);
  }
  const prompt = render(template, {
    REPO_NAME: repoName,
    REPO_PATH: target,
    PREPASS_PATH: `${WORK_DIR_NAME}/prepass.json`,
    SCHEMA_PATH: `${WORK_DIR_NAME}/schema.json`,
    VALIDATE_COMMAND: "npx repo-onboarding validate analysis.json",
    UPLOAD_COMMAND: "npx repo-onboarding upload analysis.json",
    SCHEMA_VERSION: SUPPORTED_SCHEMA_VERSION,
    ANALYZER_VERSION,
    SITE_URL,
  });
  try {
    writeFileSync(promptOut, prompt, "utf8");
  } catch (err) {
    throw new CliError(`Could not write ${promptOut}: ${err.message}`, 2);
  }

  // ---- Friendly report. -----------------------------------------------------
  const s = prepass.stats ?? {};
  const langs = Array.isArray(s.languages)
    ? s.languages.slice(0, 3).map((l) => l.language).join(", ")
    : "";

  const out = [];
  out.push("");
  out.push(`Prepared ${repoName} for analysis.`);
  out.push("");
  out.push(`  Facts:   ${s.totalFiles ?? "?"} files, ${s.totalLoc ?? "?"} LOC${langs ? ` (${langs})` : ""}`);
  out.push(`  Wrote:   ${WORK_DIR_NAME}/prepass.json   deterministic repo facts`);
  out.push(`           ${WORK_DIR_NAME}/PROMPT.md      the analysis protocol for your agent`);
  out.push(`           ${WORK_DIR_NAME}/schema.json    the analysis.json schema to target`);
  out.push("");
  if (!isRepo) {
    out.push("  Note: this directory is not a git repository, so churn / hotspot data");
    out.push("        is unavailable. Analysis still works; hotspots will be inferred");
    out.push("        from structure instead.");
    out.push("");
  }
  out.push("Next steps:");
  out.push("");
  out.push("  1. Point your AI coding agent (Claude Code, Cursor, Codex, ...) at this");
  out.push(`     repo and tell it: "Follow ${WORK_DIR_NAME}/PROMPT.md to produce analysis.json."`);
  out.push("");
  out.push("  2. Validate what it produced:");
  out.push("       npx repo-onboarding validate analysis.json");
  out.push("");
  out.push(`  3. Get an upload token at ${SITE_URL}/account, then publish:`);
  out.push(`       # set ${TOKEN_ENV} to your roa_... token, then:`);
  out.push("       npx repo-onboarding upload analysis.json");
  out.push("");
  out.push(`  Tip: add "${WORK_DIR_NAME}/" to your .gitignore — it's local scratch.`);
  out.push("");
  console.log(out.join("\n"));

  return 0;
}
