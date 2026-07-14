/**
 * Unit tests for the per-section chat starter questions.
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
import {
  buildSuggestedQuestions,
  DEFAULT_QUESTIONS,
} from "../suggested-questions";
import { ANALYSIS_SECTIONS } from "../sections";

const fixture: Analysis = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "..", "data", "sample", "analysis.json"),
    "utf8",
  ),
);

test("every section slug maps to exactly three non-empty questions", () => {
  const questions = buildSuggestedQuestions(fixture);
  for (const s of ANALYSIS_SECTIONS) {
    const qs = questions[s.slug];
    assert.ok(Array.isArray(qs), `missing slug "${s.slug}"`);
    assert.equal(qs.length, 3, `slug "${s.slug}" has ${qs.length} questions`);
    for (const q of qs) {
      assert.ok(typeof q === "string" && q.trim().length > 0);
    }
    assert.equal(new Set(qs).size, 3, `slug "${s.slug}" has duplicates`);
  }
});

test("hotspots lead question asks why the top-churn path churns", () => {
  const questions = buildSuggestedQuestions(fixture);
  const top = [...fixture.hotspots.entries].sort(
    (a, b) => b.commits - a.commits,
  )[0];
  const lead = questions["hotspots"][0];
  // The path is shortened to its last two segments for display.
  const shortened = top.path.split("/").filter(Boolean).slice(-2).join("/");
  assert.ok(
    lead.includes(shortened) || lead.includes(top.path),
    `"${lead}" does not mention ${shortened}`,
  );
  assert.match(lead, /churn/i);
});

test("setup lead question drops the prerequisite's parenthetical note", () => {
  const withNote: Analysis = {
    ...fixture,
    setup: {
      ...fixture.setup,
      prerequisites: ["Node.js >= 18 (package.json engines; CI matrix)"],
    },
  };
  const lead = buildSuggestedQuestions(withNote)["setup"][0];
  assert.equal(lead, "Why do I need Node.js >= 18?");
});

test("questions stay short enough for a one-line pill", () => {
  const questions = buildSuggestedQuestions(fixture);
  for (const qs of Object.values(questions)) {
    for (const q of qs) {
      assert.ok(q.length <= 90, `too long (${q.length}): "${q}"`);
    }
  }
});

test("sparse analysis pads every section from the defaults", () => {
  const sparse: Analysis = {
    ...fixture,
    pitch: { ...fixture.pitch, techStack: [] },
    architecture: [],
    dependencyGraph: { nodes: [], edges: [] },
    codebaseMap: [],
    tour: [],
    hotspots: { entries: [], interpretation: "" },
    setup: { prerequisites: [], setup: [], run: [], test: [] },
    firstTasks: [],
  };
  const questions = buildSuggestedQuestions(sparse);
  for (const s of ANALYSIS_SECTIONS) {
    const qs = questions[s.slug];
    assert.equal(qs.length, 3, `slug "${s.slug}"`);
    // With no derivable data, every question must come from the defaults or
    // the section's static generics — and padding must never duplicate.
    assert.equal(new Set(qs).size, 3);
  }
  // Versions has no derivation at all: it is exactly the defaults.
  assert.deepEqual(questions["versions"], DEFAULT_QUESTIONS);
});
