/**
 * Unit tests for the pure GitHub file helpers (path sanitize + URL builder).
 *
 * `fetchRepoFileAtSha` hits the network and is intentionally not exercised
 * here. Plain `node:test` + `node:assert/strict`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeRepoPath, rawFileUrl } from "../chat/github-file";

test("sanitizeRepoPath accepts plain repo-relative paths", () => {
  assert.equal(sanitizeRepoPath("src/a/b.ts"), "src/a/b.ts");
  assert.equal(sanitizeRepoPath("README.md"), "README.md");
});

test("sanitizeRepoPath strips a single leading ./", () => {
  assert.equal(sanitizeRepoPath("./x/y.md"), "x/y.md");
});

test("sanitizeRepoPath trims surrounding whitespace", () => {
  assert.equal(sanitizeRepoPath("  src/index.ts  "), "src/index.ts");
});

test("sanitizeRepoPath rejects traversal and absolute paths", () => {
  assert.equal(sanitizeRepoPath("../x"), null);
  assert.equal(sanitizeRepoPath("a/../b"), null);
  assert.equal(sanitizeRepoPath("/etc/passwd"), null);
  assert.equal(sanitizeRepoPath("a/./b"), null);
});

test("sanitizeRepoPath rejects backslashes and percent-encoding", () => {
  assert.equal(sanitizeRepoPath("a\\b"), null);
  assert.equal(sanitizeRepoPath("a%2e%2e/b"), null);
});

test("sanitizeRepoPath rejects empty, over-long, and control-char paths", () => {
  assert.equal(sanitizeRepoPath(""), null);
  assert.equal(sanitizeRepoPath("   "), null);
  assert.equal(sanitizeRepoPath("a".repeat(600)), null);
  assert.equal(sanitizeRepoPath("a/\x00/b"), null);
});

test("rawFileUrl builds the raw.githubusercontent.com URL shape", () => {
  assert.equal(
    rawFileUrl("acme", "demo", "abc123", "src/index.ts"),
    "https://raw.githubusercontent.com/acme/demo/abc123/src/index.ts",
  );
});

test("rawFileUrl encodes special chars within a segment but keeps / separators", () => {
  assert.equal(
    rawFileUrl("acme", "demo", "abc123", "docs/my file#1.md"),
    "https://raw.githubusercontent.com/acme/demo/abc123/docs/my%20file%231.md",
  );
});
