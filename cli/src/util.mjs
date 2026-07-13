/**
 * Small shared helpers for the CLI commands: a typed error for controlled
 * exit codes, JSON/file loading with friendly messages, and semver compare.
 */

import { readFileSync } from "node:fs";

/**
 * An error that carries the process exit code the CLI should use. Thrown for
 * usage / IO / parse problems (code 2 by default) and caught by the dispatcher,
 * which prints `message` to stderr and exits with `code`.
 */
export class CliError extends Error {
  /**
   * @param {string} message
   * @param {number} [code] process exit code (default 2)
   */
  constructor(message, code = 2) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

/**
 * Read a UTF-8 text file, throwing a {@link CliError} (exit 2) on failure.
 * @param {string} path absolute path
 * @param {string} label human label used in the error message
 * @returns {string}
 */
export function readTextFileOrThrow(path, label = "file") {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new CliError(`Could not read ${label} at ${path}: ${err.message}`, 2);
  }
}

/**
 * Parse JSON text, throwing a {@link CliError} (exit 2) on malformed input.
 * @param {string} text
 * @param {string} label
 * @returns {unknown}
 */
export function parseJsonOrThrow(text, label = "input") {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new CliError(`${label} is not valid JSON: ${err.message}`, 2);
  }
}

/**
 * Compare two dotted numeric versions. Non-numeric / short versions are treated
 * leniently (missing segments count as 0; unparsable segments as 0).
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1} sign of (a - b)
 */
export function compareVersions(a, b) {
  const pa = String(a).split(".");
  const pb = String(b).split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number.parseInt(pa[i] ?? "0", 10) || 0;
    const nb = Number.parseInt(pb[i] ?? "0", 10) || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
