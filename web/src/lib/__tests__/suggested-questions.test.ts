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

// --- API Surface -----------------------------------------------------------

test("the api section asks about a real route and the commonest actor", () => {
  const doc: Analysis = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "..", "data", "repo-onboarding", "analysis.json"),
      "utf8",
    ),
  );
  const questions = buildSuggestedQuestions(doc)["api"];
  assert.equal(questions.length, 3);

  const routes = doc.apiSurface?.routes ?? [];
  const explained = routes.find((r) => r.note);
  assert.ok(explained, "the fixture explains at least one route");
  assert.ok(
    questions[0].includes(`${explained.method} ${explained.path}`),
    `"${questions[0]}" does not name the explained route`,
  );

  const counts = new Map<string, number>();
  for (const route of routes) counts.set(route.actor, (counts.get(route.actor) ?? 0) + 1);
  const commonest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  assert.ok(
    questions[1].includes(commonest),
    `"${questions[1]}" does not name the commonest actor`,
  );
});

test("a document with no API surface still gets three api starter questions", () => {
  const questions = buildSuggestedQuestions(fixture)["api"];
  assert.equal(questions.length, 3);
  assert.equal(new Set(questions).size, 3);
});

// --- Design System ---------------------------------------------------------

test("the design section asks about a real primitive and a real token group", () => {
  const doc: Analysis = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "..", "data", "repo-onboarding", "analysis.json"),
      "utf8",
    ),
  );
  const questions = buildSuggestedQuestions(doc)["design"];
  assert.equal(questions.length, 3);

  const primitive = doc.designSystem?.primitives[0];
  const group = doc.designSystem?.tokens[0];
  assert.ok(primitive && group, "the fixture carries a design system");
  assert.ok(
    questions[0].includes(primitive.name),
    `"${questions[0]}" does not name a primitive`,
  );
  assert.ok(
    questions[1].includes(group.name.toLowerCase()),
    `"${questions[1]}" does not name a token group`,
  );
  // The reuse rule is what the section is for, so it gets a pill of its own
  // whatever the document happens to contain.
  assert.match(questions[2], /new primitive/);
});

test("a document with no design system still gets three design starter questions", () => {
  const questions = buildSuggestedQuestions(fixture)["design"];
  assert.equal(questions.length, 3);
  assert.equal(new Set(questions).size, 3);
});

// --- Delivery --------------------------------------------------------------

test("the delivery section asks about a real gate and about migration application", () => {
  const doc: Analysis = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "..", "data", "repo-onboarding", "analysis.json"),
      "utf8",
    ),
  );
  const questions = buildSuggestedQuestions(doc)["delivery"];
  assert.equal(questions.length, 3);

  // The gate a reader can pre-empt: the question then leads somewhere they can
  // act on before pushing rather than after a red check.
  const gate = doc.delivery?.gates.find((g) => g.runLocally);
  assert.ok(gate, "the fixture has a gate a reader can run locally");
  assert.ok(
    questions[0].includes(gate.name),
    `"${questions[0]}" does not name a gate`,
  );
  assert.match(questions[1], /pull request/);
  // "Nothing applies them" is the answer an engine is most tempted to improve
  // upon, so the pill asks for it directly rather than hoping it comes up.
  assert.ok(doc.delivery?.migrations, "the fixture has real migrations");
  assert.match(questions[2], /migrations/);
});

test("a document with no delivery section still gets three delivery starter questions", () => {
  const questions = buildSuggestedQuestions(fixture)["delivery"];
  assert.equal(questions.length, 3);
  assert.equal(new Set(questions).size, 3);
});
