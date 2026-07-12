/**
 * Unit tests for the GitHub URL helpers.
 *
 * Run with `npm test` (which invokes `tsx --test`). Plain `node:test` +
 * `node:assert/strict` — `github.ts` is a pure module with zero imports.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { githubBlobUrl, parseGitHubRepo } from "../github";

const URL_ = "https://github.com/acme/demo";
const SHA = "9f3c1ab7d0e4562b8c1f0a9d7e6b4c2a1f8e0d3c";

test("parseGitHubRepo extracts owner/repo from canonical URLs", () => {
  assert.deepEqual(parseGitHubRepo(URL_), { owner: "acme", repo: "demo" });
  assert.deepEqual(parseGitHubRepo("http://www.github.com/a/b.git/"), {
    owner: "a",
    repo: "b",
  });
});

test("parseGitHubRepo rejects null and non-GitHub hosts", () => {
  assert.equal(parseGitHubRepo(null), null);
  assert.equal(parseGitHubRepo("https://gitlab.com/acme/demo"), null);
  assert.equal(parseGitHubRepo("https://github.com/acme"), null);
});

test("githubBlobUrl returns null without a GitHub URL or a sha", () => {
  assert.equal(githubBlobUrl(null, SHA, "src/index.ts"), null);
  assert.equal(githubBlobUrl(URL_, null, "src/index.ts"), null);
  assert.equal(
    githubBlobUrl("https://gitlab.com/acme/demo", SHA, "src/index.ts"),
    null,
  );
});

test("githubBlobUrl links a plain file at the analyzed commit", () => {
  assert.equal(
    githubBlobUrl(URL_, SHA, "src/index.ts"),
    `https://github.com/acme/demo/blob/${SHA}/src/index.ts`,
  );
});

test("githubBlobUrl strips .git and trailing slash from the repo URL", () => {
  assert.equal(
    githubBlobUrl(`${URL_}.git/`, SHA, "src/index.ts"),
    `https://github.com/acme/demo/blob/${SHA}/src/index.ts`,
  );
});

test("githubBlobUrl anchors a single line", () => {
  assert.equal(
    githubBlobUrl(URL_, SHA, "src/index.ts", 10),
    `https://github.com/acme/demo/blob/${SHA}/src/index.ts#L10`,
  );
});

test("githubBlobUrl anchors a line range", () => {
  assert.equal(
    githubBlobUrl(URL_, SHA, "src/index.ts", 10, 20),
    `https://github.com/acme/demo/blob/${SHA}/src/index.ts#L10-L20`,
  );
});

test("githubBlobUrl collapses an equal start/end to a single line", () => {
  assert.equal(
    githubBlobUrl(URL_, SHA, "src/index.ts", 10, 10),
    `https://github.com/acme/demo/blob/${SHA}/src/index.ts#L10`,
  );
});

test("githubBlobUrl ignores endLine without startLine", () => {
  assert.equal(
    githubBlobUrl(URL_, SHA, "src/index.ts", undefined, 20),
    `https://github.com/acme/demo/blob/${SHA}/src/index.ts`,
  );
});

test("githubBlobUrl percent-encodes path segments but not slashes", () => {
  assert.equal(
    githubBlobUrl(URL_, SHA, "docs/my file#1.md"),
    `https://github.com/acme/demo/blob/${SHA}/docs/my%20file%231.md`,
  );
});
