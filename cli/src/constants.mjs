/**
 * Shared constants and resolved paths for the repo-onboarding CLI.
 *
 * The package version is the single source of truth for `analyzerVersion`
 * stamped into the PROMPT and for `--version`; it is read from the package's
 * own package.json so the two can never drift.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url)); // <pkg>/src

/** Absolute path to the package root (one level above src/). */
export const PKG_ROOT = resolve(HERE, "..");

/** Directory holding the byte-exact vendored copies of the canonical scripts. */
export const VENDOR_DIR = resolve(PKG_ROOT, "vendor");

/** Directory holding the rendered-at-init templates. */
export const TEMPLATES_DIR = resolve(PKG_ROOT, "templates");

const pkg = JSON.parse(readFileSync(resolve(PKG_ROOT, "package.json"), "utf8"));

/** This package's version, e.g. "0.1.0". */
export const PKG_VERSION = pkg.version;

/** The analysis contract version this CLI is built against. */
export const SUPPORTED_SCHEMA_VERSION = "1.0.0";

/** Value written to metadata.analyzerVersion by the generated PROMPT. */
export const ANALYZER_VERSION = `repo-onboarding/${PKG_VERSION}`;

/** Default hosted viewer / API base. Overridable with `--api`. */
export const DEFAULT_API_BASE = "https://repo-onboarding-tau.vercel.app";

/** Public site (same host as the API base). */
export const SITE_URL = DEFAULT_API_BASE;

/** Environment variable the upload command reads a token from. */
export const TOKEN_ENV = "REPO_ONBOARDING_TOKEN";

/** Upload-token syntax: roa_ followed by 40 lowercase hex chars. */
export const TOKEN_PATTERN = /^roa_[0-9a-f]{40}$/;

/** Directory (relative to a target repo) where init writes its artifacts. */
export const WORK_DIR_NAME = ".repo-onboarding";
