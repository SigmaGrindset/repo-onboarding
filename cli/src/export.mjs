/**
 * `repo-onboarding export [file] [--out <file>] [--force]`
 *
 * Renders a validated analysis document into a committable `ONBOARDING.md`
 * (GitHub-flavored Markdown) via pure templating — no network, no AI. The
 * document is validated first (schema + dependency-graph edge integrity) and,
 * unless `--force` is given, an invalid document is refused just like `upload`.
 *
 * Input defaults to `analysis.json`; output defaults to `ONBOARDING.md` beside
 * the input. `--out -` streams the Markdown to stdout (all other messages go to
 * stderr) so the command composes in a pipeline.
 *
 * Exit codes: 0 success · 1 invalid document · 2 usage / IO / parse error.
 */

import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";

import {
  validateAnalysisDocument,
  formatIssueHuman,
} from "../vendor/validate-core.mjs";
import { renderOnboardingMarkdown } from "../vendor/export-markdown.mjs";
import { warnIfNewerSchema } from "./validate.mjs";
import { PKG_VERSION, SITE_URL } from "./constants.mjs";
import {
  CliError,
  readTextFileOrThrow,
  parseJsonOrThrow,
} from "./util.mjs";

const USAGE =
  "Usage: repo-onboarding export [file] [--out <file>] [--force]\n" +
  "Render a committable ONBOARDING.md from an analysis.json (default: analysis.json).\n" +
  "Use --out - to write the Markdown to stdout.";

/**
 * @param {string[]} rest raw args after the `export` command
 * @returns {number} exit code
 */
export async function runExport(rest) {
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        out: { type: "string" },
        force: { type: "boolean", default: false },
      },
    });
  } catch (err) {
    throw new CliError(`${err.message}\n\n${USAGE}`, 2);
  }

  const input = parsed.positionals[0] || "analysis.json";
  const force = parsed.values.force;
  const outFlag = parsed.values.out;
  const toStdout = outFlag === "-";

  // ---- Load + parse the document. -------------------------------------------
  const inputPath = resolve(process.cwd(), input);
  const text = readTextFileOrThrow(inputPath, "input document");
  const doc = parseJsonOrThrow(text, `input document at ${inputPath}`);

  warnIfNewerSchema(doc);

  // ---- Validate (schema + edge integrity). ----------------------------------
  const result = validateAnalysisDocument(doc, { checkEdges: true });
  if (!result.valid) {
    if (force) {
      console.error(
        `Warning: ${inputPath} is INVALID (${result.issues.length} error(s)), ` +
          "but --force was given — exporting anyway. The output may be incomplete.",
      );
    } else {
      console.error(
        `INVALID: ${inputPath} has ${result.issues.length} error(s):\n`,
      );
      for (const issue of result.issues) console.error(formatIssueHuman(issue));
      console.error(
        "\nFix these (or re-run with --force to export anyway), then try again.",
      );
      return 1;
    }
  }

  // ---- Render. --------------------------------------------------------------
  const markdown = renderOnboardingMarkdown(doc, {
    generatorVersion: PKG_VERSION,
  });

  // ---- Emit. ----------------------------------------------------------------
  if (toStdout) {
    process.stdout.write(markdown);
    return 0;
  }

  const outputPath = outFlag
    ? resolve(process.cwd(), outFlag)
    : join(dirname(inputPath), "ONBOARDING.md");

  try {
    writeFileSync(outputPath, markdown, "utf8");
  } catch (err) {
    throw new CliError(`Could not write ${outputPath}: ${err.message}`, 2);
  }

  const shown = outFlag || relative(process.cwd(), outputPath) || outputPath;
  console.log(`Wrote ${shown}.`);
  console.log("");
  console.log("Want the interactive version (graph, guided tour, chat)?");
  console.log(`  npx repo-onboarding upload ${input}    → ${SITE_URL}`);

  return 0;
}
