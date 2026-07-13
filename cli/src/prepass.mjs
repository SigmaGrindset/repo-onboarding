/**
 * `repo-onboarding prepass` — a thin pass-through to the vendored deterministic
 * pre-pass. All arguments are forwarded verbatim and stdio is inherited so the
 * JSON lands on stdout (or --out) exactly as the standalone script produces it.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { VENDOR_DIR } from "./constants.mjs";

/**
 * @param {string[]} args raw args after the `prepass` command
 * @returns {number} exit code
 */
export function runPrepass(args) {
  const prepassPath = resolve(VENDOR_DIR, "prepass.mjs");
  const result = spawnSync(process.execPath, [prepassPath, ...args], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Failed to run prepass: ${result.error.message}`);
    return 2;
  }
  return result.status ?? 2;
}
