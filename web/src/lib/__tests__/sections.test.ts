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

/** Every specialized section that ships, and the key each is declared by. */
const SPECIALIZED_SECTIONS: Record<string, keyof Analysis> = {
  api: "apiSurface",
};

test("a section is specialized exactly when it is one of the known few", () => {
  for (const s of ANALYSIS_SECTIONS) {
    const specialized = s.slug in SPECIALIZED_SECTIONS;
    assert.equal(
      s.class,
      specialized ? "specialized" : "core",
      `"${s.slug}" has the wrong class`,
    );
    if (s.class === "specialized") {
      assert.equal(s.key, SPECIALIZED_SECTIONS[s.slug]);
    }
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

// The presence rule wants a document key one fixture carries and another does
// not, which no shipped specialized section has while `api` is the only one and
// the fixtures predate it. Built here rather than reached for in the registry.
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

// --- API Surface ----------------------------------------------------------

/** The routes floor is three; anything shorter is not an API surface. */
function withApiSurface(base: Analysis): Analysis {
  return {
    ...base,
    apiSurface: {
      routes: [
        { method: "GET", path: "/health", file: "src/health.ts", actor: "public" },
        { method: "POST", path: "/items", file: "src/items.ts", actor: "signed-in reader" },
        { method: "DELETE", path: "/items/:id", file: "src/items.ts", actor: "owner" },
      ],
    },
  };
}

test("a document carrying an API surface shows the section after the codebase map", () => {
  const slugs = visibleSections(withApiSurface(fixture("sample"))).map((s) => s.slug);
  assert.ok(slugs.includes("api"));
  assert.equal(slugs.indexOf("api"), slugs.indexOf("map") + 1);
});

test("a document with no API surface shows no API section at all", () => {
  for (const name of FIXTURE_NAMES) {
    const slugs = visibleSections(fixture(name)).map((s) => s.slug);
    assert.ok(!slugs.includes("api"), `${name} shows an API Surface tab`);
  }
});

test("the API section is only ever added, never reordered around", () => {
  const withApi = visibleSections(withApiSurface(fixture("sample"))).map((s) => s.slug);
  assert.deepEqual(
    withApi.filter((slug) => slug !== "api"),
    TODAYS_SECTIONS,
  );
});

test("the real document that carries an API surface shows the section", () => {
  // `repo-onboarding` is this repository analysed by its own engine — the one
  // document in the repository with a real API surface rather than a built one.
  const doc = fixture("repo-onboarding");
  assert.ok((doc.apiSurface?.routes.length ?? 0) >= 3);
  assert.ok(visibleSections(doc).some((s) => s.slug === "api"));
});
