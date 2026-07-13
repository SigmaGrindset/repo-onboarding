/**
 * Unit tests for the analysis schema validator's structured error contract.
 *
 * Run with `npm test` (which invokes `tsx --test`, cwd = `web/`). Plain
 * `node:test` + `node:assert/strict`.
 *
 * These exercise `validateAnalysis` — the shape upload consumers actually see —
 * which mirrors `schema/validate-core.mjs`. Each case starts from the real
 * `data/sample/analysis.json` (a known-valid document) and mutates a copy so
 * exactly one rule fails, then asserts the derived path/keyword/expected/got.
 *
 * `validateAnalysis` reads the schema from `<cwd>/../schema` and `import type`
 * lines are erased at transpile time, so nothing here needs the `@schema` alias
 * resolved at runtime.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateAnalysis, type ValidationIssue } from "../validateAnalysis";

const SAMPLE_PATH = fileURLToPath(
  new URL("../../../../data/sample/analysis.json", import.meta.url),
);

/** Fresh deep clone of the known-valid sample on every call. */
function sample(): Record<string, unknown> {
  return JSON.parse(readFileSync(SAMPLE_PATH, "utf8"));
}

/** Validate a doc, assert it failed, and return the issues. */
async function issuesFor(doc: unknown): Promise<ValidationIssue[]> {
  const result = await validateAnalysis(doc);
  assert.equal(result.valid, false, "expected the document to be invalid");
  assert.ok(!("data" in result));
  return result.issues;
}

const find = (issues: ValidationIssue[], path: string, keyword: string) =>
  issues.find((i) => i.path === path && i.keyword === keyword);

// --------------------------------------------------------------------------

test("the sample document is valid", async () => {
  const result = await validateAnalysis(sample());
  assert.equal(result.valid, true);
  assert.ok(result.valid && result.data);
});

test("missing required property", async () => {
  const doc = sample();
  delete (doc.metadata as Record<string, unknown>).repoName;

  const issues = await issuesFor(doc);
  const issue = find(issues, "/metadata", "required");
  assert.ok(issue, "expected a required-property issue at /metadata");
  assert.equal(issue.message, "must have required property 'repoName'");
  assert.equal(issue.expected, 'property "repoName"');
  assert.equal(issue.got, "undefined");
});

test("missing top-level property normalizes root path to (root)", async () => {
  const doc = sample();
  delete doc.pitch;

  const issues = await issuesFor(doc);
  const issue = find(issues, "(root)", "required");
  assert.ok(issue, "expected a required-property issue at (root)");
  assert.equal(issue.expected, 'property "pitch"');
  assert.equal(issue.got, "undefined");
});

test("enum violation", async () => {
  const doc = sample();
  (
    (doc.pitch as { techStack: Record<string, unknown>[] }).techStack[0]
  ).category = "banana";

  const issues = await issuesFor(doc);
  const issue = find(issues, "/pitch/techStack/0/category", "enum");
  assert.ok(issue, "expected an enum issue");
  assert.ok(issue.expected?.startsWith("one of: "));
  assert.ok(issue.expected?.includes('"language"'));
  assert.ok(issue.expected?.includes('"other"'));
  assert.equal(issue.got, '"banana"');
});

test("wrong type", async () => {
  const doc = sample();
  (
    (doc.metadata as { stats: Record<string, unknown> }).stats
  ).totalFiles = "lots";

  const issues = await issuesFor(doc);
  const issue = find(issues, "/metadata/stats/totalFiles", "type");
  assert.ok(issue, "expected a type issue");
  assert.equal(issue.message, "must be integer");
  assert.equal(issue.expected, "type integer");
  assert.equal(issue.got, '"lots"');
});

test("union type (string or null) renders both members", async () => {
  const doc = sample();
  (doc.metadata as Record<string, unknown>).repoUrl = 123;

  const issues = await issuesFor(doc);
  const issue = find(issues, "/metadata/repoUrl", "type");
  assert.ok(issue, "expected a type issue");
  assert.equal(issue.expected, "type string or null");
  assert.equal(issue.got, "123");
});

test("additionalProperties reports the offending key and its value", async () => {
  const doc = sample();
  (doc.metadata as Record<string, unknown>).surprise = "nope";

  const issues = await issuesFor(doc);
  const issue = find(issues, "/metadata", "additionalProperties");
  assert.ok(issue, "expected an additionalProperties issue");
  assert.equal(issue.expected, 'no additional property "surprise"');
  assert.equal(issue.got, '"nope"');
});

test("minItems", async () => {
  const doc = sample();
  (doc.pitch as Record<string, unknown>).techStack = [];

  const issues = await issuesFor(doc);
  const issue = find(issues, "/pitch/techStack", "minItems");
  assert.ok(issue, "expected a minItems issue");
  assert.equal(issue.message, "must NOT have fewer than 3 items");
  assert.equal(issue.expected, "at least 3 item(s)");
  assert.equal(issue.got, "[]");
});

test("minLength truncation-safe rendering of the offending value", async () => {
  const doc = sample();
  (doc.metadata as Record<string, unknown>).repoName = "";

  const issues = await issuesFor(doc);
  const issue = find(issues, "/metadata/repoName", "minLength");
  assert.ok(issue, "expected a minLength issue");
  assert.equal(issue.expected, "at least 1 character(s)");
  assert.equal(issue.got, '""');
});

test("numeric minimum", async () => {
  const doc = sample();
  (
    (doc.metadata as { stats: Record<string, unknown> }).stats
  ).totalLoc = -5;

  const issues = await issuesFor(doc);
  const issue = find(issues, "/metadata/stats/totalLoc", "minimum");
  assert.ok(issue, "expected a minimum issue");
  assert.equal(issue.expected, ">= 0");
  assert.equal(issue.got, "-5");
});

test("long string values in `got` are truncated to 80 chars", async () => {
  const doc = sample();
  // summary requires minLength 80; a 3-char value fails minLength and the
  // offending value is short. Instead force a long value into a wrong-type slot
  // to exercise truncation: analyzerVersion must be a string; make it a long
  // object rendered via JSON.stringify.
  const longValue = "x".repeat(500);
  (doc.metadata as Record<string, unknown>).analyzerVersion = { note: longValue };

  const issues = await issuesFor(doc);
  const issue = find(issues, "/metadata/analyzerVersion", "type");
  assert.ok(issue, "expected a type issue");
  assert.ok(issue.got, "expected a rendered value");
  assert.ok(issue.got!.length <= 80, `got was ${issue.got!.length} chars`);
  assert.ok(issue.got!.endsWith("…"));
});
