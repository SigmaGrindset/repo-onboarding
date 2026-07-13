/**
 * `repo-onboarding upload <file> [--api <base>] [--token <token>]`
 *
 * Validates the document locally first (schema + edge integrity) and refuses to
 * upload anything invalid, then POSTs the raw file text to the hosted API with a
 * bearer token. The token comes from --token or REPO_ONBOARDING_TOKEN and is
 * syntax-checked before any network call is made.
 *
 * Exit codes: 0 success · 1 rejected / failed · 2 usage / IO / config error.
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";

import {
  validateAnalysisDocument,
  formatIssueHuman,
} from "../vendor/validate-core.mjs";
import {
  DEFAULT_API_BASE,
  TOKEN_ENV,
  TOKEN_PATTERN,
  SITE_URL,
} from "./constants.mjs";
import {
  CliError,
  readTextFileOrThrow,
  parseJsonOrThrow,
} from "./util.mjs";

const USAGE =
  "Usage: repo-onboarding upload <file> [--api <base>] [--token <token>]\n" +
  "Validate locally, then publish an analysis.json to the hosted viewer.";

function tokenHelp() {
  return (
    `No upload token found. Create one at ${SITE_URL}/account, then either:\n` +
    `  - set the ${TOKEN_ENV} environment variable, or\n` +
    "  - pass --token roa_...\n" +
    "\nPowerShell:  $env:" +
    TOKEN_ENV +
    '="roa_..."\n' +
    "bash / zsh:  export " +
    TOKEN_ENV +
    "=roa_..."
  );
}

/**
 * @param {string[]} args raw args after the `upload` command
 * @param {{ fetchImpl?: typeof fetch }} [deps] injectable fetch for testing
 * @returns {Promise<number>} exit code
 */
export async function runUpload(args, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        api: { type: "string" },
        token: { type: "string" },
      },
    });
  } catch (err) {
    throw new CliError(`${err.message}\n\n${USAGE}`, 2);
  }

  const target = parsed.positionals[0];
  if (!target) throw new CliError(USAGE, 2);

  // ---- Token: resolve and validate syntax BEFORE any I/O or network. --------
  const token = parsed.values.token || process.env[TOKEN_ENV];
  if (!token) throw new CliError(tokenHelp(), 2);
  if (!TOKEN_PATTERN.test(token)) {
    throw new CliError(
      `The token does not look valid (expected roa_ followed by 40 hex ` +
        `characters). Create a fresh one at ${SITE_URL}/account.`,
      2,
    );
  }

  // ---- Load + validate locally; refuse to upload an invalid document. -------
  const targetPath = resolve(process.cwd(), target);
  const text = readTextFileOrThrow(targetPath, "analysis document");
  const doc = parseJsonOrThrow(text, `analysis document at ${targetPath}`);

  const result = validateAnalysisDocument(doc, { checkEdges: true });
  if (!result.valid) {
    console.error(
      `Refusing to upload: ${targetPath} is INVALID (${result.issues.length} ` +
        "error(s)). Fix these and try again:\n",
    );
    for (const issue of result.issues) console.error(formatIssueHuman(issue));
    console.error(
      "\nRun `repo-onboarding validate <file>` to re-check after fixing.",
    );
    return 1;
  }

  // ---- POST to the API. -----------------------------------------------------
  const base = (parsed.values.api || DEFAULT_API_BASE).replace(/\/+$/, "");
  const endpoint = `${base}/api/v1/analyses`;

  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: text,
    });
  } catch (err) {
    console.error(
      `Network error contacting ${endpoint}: ${err.message}\n` +
        "Check your connection and the --api base URL, then try again.",
    );
    return 1;
  }

  const raw = await res.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }

  if (res.status === 201) {
    const repoName = body?.repoName ?? doc?.metadata?.repoName ?? "your repo";
    const version = body?.version;
    const url = body?.url;
    console.log(`Published ${repoName}${version ? ` (version ${version})` : ""}.`);
    if (url) {
      console.log("");
      console.log(`  Live at: ${url}`);
      console.log("");
    }
    return 0;
  }

  if (res.status === 401 || res.status === 403) {
    console.error(
      `Authentication failed (HTTP ${res.status}): ${body?.error ?? (raw || "unauthorized")}.\n` +
        `Your token may be wrong, revoked, or expired. Create a new one at ${SITE_URL}/account ` +
        `and set ${TOKEN_ENV} (or pass --token).`,
    );
    return 1;
  }

  if (res.status === 400) {
    console.error(`Server rejected the document (HTTP 400): ${body?.error ?? "bad request"}.`);
    if (Array.isArray(body?.issues) && body.issues.length) {
      console.error("");
      for (const issue of body.issues) console.error(formatIssueHuman(issue));
    }
    console.error("");
    return 1;
  }

  if (res.status === 413) {
    console.error(
      `The document is too large to upload (HTTP 413): ${body?.error ?? (raw || "payload too large")}.`,
    );
    return 1;
  }

  console.error(
    `Upload failed (HTTP ${res.status}): ${body?.error ?? (raw || res.statusText || "unknown error")}.`,
  );
  return 1;
}
