/**
 * Shared test helpers. `runCli` spawns the real bin script with the current
 * Node binary (no shell / PATH assumptions) and resolves to the exit code and
 * captured output. It is async on purpose: the upload tests run an in-process
 * HTTP server on the same event loop, so a *synchronous* spawn would deadlock.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export const PKG_ROOT = resolve(HERE, "..");
export const REPO_ROOT = resolve(HERE, "..", "..");
export const BIN = resolve(PKG_ROOT, "bin", "repo-onboarding.mjs");
export const SAMPLE = resolve(REPO_ROOT, "data", "sample", "analysis.json");

/**
 * Run the CLI as a child process.
 * @param {string[]} args
 * @param {{ env?: Record<string,string>, unset?: string[], cwd?: string }} [opts]
 * @returns {Promise<{ status: number|null, stdout: string, stderr: string }>}
 */
export function runCli(args, opts = {}) {
  return new Promise((resolvePromise) => {
    const env = { ...process.env, ...(opts.env || {}) };
    for (const key of opts.unset || []) delete env[key];

    const child = spawn(process.execPath, [BIN, ...args], {
      env,
      cwd: opts.cwd,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolvePromise({ status: code, stdout, stderr }));
  });
}
