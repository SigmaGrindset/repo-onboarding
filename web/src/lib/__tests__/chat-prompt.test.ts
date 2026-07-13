/**
 * Unit tests for the chat system-prompt builder.
 *
 * Loads the real `data/sample/analysis.json` fixture (cwd is `web/` when
 * `npm test` runs, so it sits one level up under `../data/...`). Plain
 * `node:test` + `node:assert/strict`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Analysis } from "@schema/analysis";
import { buildSystemPrompt, capMessages, MAX_HISTORY_MESSAGES } from "../chat/prompt";

const fixture: Analysis = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "..", "data", "sample", "analysis.json"),
    "utf8",
  ),
);

test("buildSystemPrompt embeds repo name, a nested fixture value, and the don't-invent rule", () => {
  const prompt = buildSystemPrompt(fixture);
  assert.ok(prompt.includes(fixture.metadata.repoName));
  // A known nested value survives into the embedded JSON document.
  assert.ok(prompt.includes(fixture.tour[0].title));
  assert.ok(/never invent/i.test(prompt));
});

test("buildSystemPrompt offers the fetchFile tool when GitHub source is available", () => {
  // The fixture has a GitHub repoUrl + commitSha.
  assert.ok(parseableGitHub(fixture));
  const prompt = buildSystemPrompt(fixture);
  assert.ok(prompt.includes("`fetchFile`"));
  assert.ok(!prompt.includes("Source files are not available"));
});

test("buildSystemPrompt withholds the tool when source is unavailable", () => {
  const noSource = {
    ...fixture,
    metadata: { ...fixture.metadata, repoUrl: "", commitSha: "" },
  } as Analysis;
  const prompt = buildSystemPrompt(noSource);
  assert.ok(prompt.includes("Source files are not available"));
  assert.ok(!prompt.includes("`fetchFile`"));
});

test("capMessages keeps only the last N and passes short arrays through", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => i);
  const capped = capMessages(twenty);
  assert.equal(capped.length, MAX_HISTORY_MESSAGES);
  assert.deepEqual(capped, twenty.slice(8)); // last 12 → 8..19

  const three = [1, 2, 3];
  assert.deepEqual(capMessages(three), three);

  assert.deepEqual(capMessages(twenty, 5), twenty.slice(15));
});

/** Local mirror of the prompt builder's source-availability guard. */
function parseableGitHub(a: Analysis): boolean {
  return (
    typeof a.metadata.repoUrl === "string" &&
    /github\.com/.test(a.metadata.repoUrl) &&
    !!a.metadata.commitSha &&
    a.metadata.commitSha.trim().length > 0
  );
}
