/**
 * Unit tests for the derived section list.
 *
 * Loads the real analysis fixtures (cwd is `web/` when `npm test` runs, so they
 * sit one level up under `../data/...`). Plain `node:test` + `node:assert/strict`.
 *
 * `visibleSections` is the seam where presence-driven visibility, the
 * core/specialized split and the section order all live, so it is asserted
 * directly rather than through the nav, the search index or the export.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Analysis } from "@schema/analysis";
import {
  ANALYSIS_SECTIONS,
  isSectionVisible,
  visibleSections,
  type AnalysisSection,
} from "../sections";

function fixture(name: string): Analysis {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "..", "data", name, "analysis.json"),
      "utf8",
    ),
  ) as Analysis;
}

/** Every document in the repository today: 1.2.0, no specialized keys. */
const FIXTURE_NAMES = ["sample", "express", "fer-mentor"] as const;

/** The sections every document showed before the list became derived. */
const TODAYS_SECTIONS = [
  "",
  "architecture",
  "graph",
  "map",
  "guide",
  "tour",
  "hotspots",
  "setup",
  "learn",
  "tasks",
  "versions",
];

test("today's registry is entirely core sections", () => {
  for (const s of ANALYSIS_SECTIONS) {
    assert.equal(s.class, "core", `"${s.slug}" is not core`);
  }
});

test("a document with no specialized keys yields every core section, in order", () => {
  for (const name of FIXTURE_NAMES) {
    assert.deepEqual(
      visibleSections(fixture(name)).map((s) => s.slug),
      TODAYS_SECTIONS,
      `${name} does not render today's sections`,
    );
  }
});

test("a document predating a core section still shows that section", () => {
  // `express` is a real 1.2.0 document written before the contributor guide.
  const doc = fixture("express");
  assert.equal(doc.contributorGuide, undefined);
  assert.ok(visibleSections(doc).some((s) => s.slug === "guide"));

  // And so is a document stripped of a core key that today's fixtures carry.
  const withoutLearn: Analysis = { ...fixture("sample") };
  delete withoutLearn.learningResources;
  assert.ok(visibleSections(withoutLearn).some((s) => s.slug === "learn"));
});

// No specialized section ships yet, so the presence rule is asserted against a
// section of that class built here — keyed on a document key one fixture
// carries and another does not.
const SPECIALIZED: AnalysisSection = {
  slug: "guide",
  label: "Contributor Guide",
  class: "specialized",
  key: "contributorGuide",
};

test("a specialized section is visible exactly when its key is present", () => {
  assert.equal(isSectionVisible(SPECIALIZED, fixture("sample")), true);
  assert.equal(isSectionVisible(SPECIALIZED, fixture("express")), false);
});

test("a core section is visible whether or not its key is present", () => {
  const core: AnalysisSection = { slug: "guide", label: "Contributor Guide", class: "core" };
  assert.equal(isSectionVisible(core, fixture("sample")), true);
  assert.equal(isSectionVisible(core, fixture("express")), true);
});

test("an explicitly null key counts as absent", () => {
  const withNull = {
    ...fixture("sample"),
    contributorGuide: null,
  } as unknown as Analysis;
  assert.equal(isSectionVisible(SPECIALIZED, withNull), false);
});
