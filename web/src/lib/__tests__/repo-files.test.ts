/**
 * Unit tests for the repository file index.
 *
 * The diagram canvas is handed this index as a prop, so its component tests can
 * never see whether the index was gathered from the whole analysis document or
 * from half of it. A section quietly left out of the walk would cost readers
 * links with nothing to notice — which is what these cover. Plain `node:test` +
 * `node:assert/strict`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Analysis } from "../../../../schema/analysis";
import { repoFileIndex } from "../repo-files";

/** A real analysis document, so the walk is checked against a real shape. */
const express = JSON.parse(
  readFileSync(new URL("../../../../data/express/analysis.json", import.meta.url), "utf8"),
) as Analysis;

test("gathers paths from every section that names one", () => {
  const { paths } = repoFileIndex(express);

  // codebaseMap, dependencyGraph nodes, tour steps, hotspots.
  assert.ok(paths.includes("lib"));
  assert.ok(paths.includes("lib/view.js"));
  assert.ok(paths.includes("index.js"));
  assert.ok(paths.includes("test/support/env.js"));
  for (const hotspot of express.hotspots.entries) {
    assert.ok(paths.includes(hotspot.path), `missing hotspot ${hotspot.path}`);
  }
  for (const task of express.firstTasks) {
    for (const file of task.files) {
      assert.ok(paths.includes(file), `missing first-task file ${file}`);
    }
  }
});

test("names each path once, however many sections mention it", () => {
  const { paths } = repoFileIndex(express);

  assert.equal(new Set(paths).size, paths.length);
});

test("carries what it takes to build a link to one of them", () => {
  const index = repoFileIndex(express);

  assert.equal(index.repoUrl, express.metadata.repoUrl);
  assert.equal(index.commitSha, express.metadata.commitSha);
});

test("writes a path the way the rest of the document writes it", () => {
  const index = repoFileIndex({
    ...express,
    codebaseMap: [
      { path: "./src/app/", purpose: "p", role: "r" },
      { path: "  lib/utils.js  ", purpose: "p", role: "r" },
      { path: "   ", purpose: "p", role: "r" },
    ],
  });

  assert.ok(index.paths.includes("src/app"));
  assert.ok(index.paths.includes("lib/utils.js"));
  assert.ok(!index.paths.some((path) => path.trim() === ""));
});

test("survives a document written before the optional sections existed", () => {
  const index = repoFileIndex({
    ...express,
    contributorGuide: undefined,
    learningResources: undefined,
  });

  assert.ok(index.paths.includes("index.js"));
});
