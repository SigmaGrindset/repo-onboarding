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
  SPECIALIZED_SECTIONS,
  canExpressSection,
  compareSchemaVersions,
  isSectionVisible,
  visibleSections,
  type AnalysisSection,
  type SpecializedSection,
} from "../sections";

/**
 * Only committed documents may be loaded here. A git-ignored one (a private
 * repository analysed locally) passes on the machine that has it and fails in CI.
 */
function fixture(name: string): Analysis {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "..", "data", name, "analysis.json"),
      "utf8",
    ),
  ) as Analysis;
}

/**
 * The documents that carry no specialized key: both at 1.2.0, the contract
 * before any specialized section existed. `repo-onboarding` is deliberately not
 * among them — it is the one committed document that carries all three.
 */
const FIXTURE_NAMES = ["sample", "express"] as const;

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

/**
 * Every specialized section that ships: the key each is declared by, and the
 * contract version that introduced it. Restated here rather than read from the
 * registry, so that changing either in the registry has to be meant.
 *
 * All three share 1.3.0 because all three were released together. That is a
 * fact about one release rather than a rule, so they are listed separately
 * here: a fourth section arriving later gets its own version, and nothing in
 * the viewer should come to assume the specialized sections share one.
 */
const EXPECTED_SPECIALIZED: Record<
  string,
  { key: keyof Analysis; since: string }
> = {
  api: { key: "apiSurface", since: "1.3.0" },
  design: { key: "designSystem", since: "1.3.0" },
  delivery: { key: "delivery", since: "1.3.0" },
};

test("a section is specialized exactly when it is one of the known few", () => {
  for (const s of ANALYSIS_SECTIONS) {
    const expected = EXPECTED_SPECIALIZED[s.slug];
    assert.equal(
      s.class,
      expected ? "specialized" : "core",
      `"${s.slug}" has the wrong class`,
    );
    if (s.class === "specialized") {
      assert.equal(s.key, expected.key);
      // Absence is read against this, so a section without it would make an
      // older document look like a repository that lost something.
      assert.equal(s.since, expected.since);
    }
  }
});

test("the specialized sections are exactly the specialized entries of the registry", () => {
  assert.deepEqual(
    SPECIALIZED_SECTIONS.map((s) => s.slug),
    ANALYSIS_SECTIONS.filter((s) => s.class === "specialized").map((s) => s.slug),
  );
  assert.deepEqual(
    SPECIALIZED_SECTIONS.map((s) => s.slug),
    Object.keys(EXPECTED_SPECIALIZED),
  );
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
  since: "1.0.0",
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

// --- Design System --------------------------------------------------------

/** The floor: four primitives, one token group, an approach and a rule. */
function withDesignSystem(base: Analysis): Analysis {
  return {
    ...base,
    designSystem: {
      approach:
        "Utility classes over one stylesheet of custom properties; no component writes a colour literal of its own.",
      tokens: [
        {
          name: "Colour",
          file: "src/styles/tokens.css",
          usage: "Referenced as var(--surface-2) in CSS and bg-surface-2 in markup.",
          examples: ["--surface", "--surface-2", "--text"],
        },
      ],
      primitives: [
        { name: "Badge", file: "src/ui.tsx", use: "A squared-off label carrying data rather than marketing." },
        { name: "Card", file: "src/ui.tsx", use: "The surface every top-level block on a page sits on." },
        { name: "Field", file: "src/ui.tsx", use: "A labelled input with its hint text and error message." },
        { name: "Stack", file: "src/ui.tsx", use: "Vertical rhythm between blocks, so margins are never hand-set." },
      ],
      reuseRule: {
        reuseWhen:
          "Read src/ui.tsx before writing anything: if a primitive renders the shape you need, pass it a prop.",
        createWhen:
          "Write a new primitive only once three screens need the same shape and no prop on an existing one expresses it.",
        newPrimitiveHome: "src/ui.tsx",
      },
    },
  };
}

test("a document carrying a design system shows the section after the API surface", () => {
  const slugs = visibleSections(
    withDesignSystem(withApiSurface(fixture("sample"))),
  ).map((s) => s.slug);
  assert.ok(slugs.includes("design"));
  assert.equal(slugs.indexOf("design"), slugs.indexOf("api") + 1);
});

test("a design system needs no API surface to sit in the structural block", () => {
  // The two are independent: a static front end has primitives and no routes,
  // and the section still lands after the codebase map rather than at the end.
  const slugs = visibleSections(withDesignSystem(fixture("sample"))).map((s) => s.slug);
  assert.ok(!slugs.includes("api"));
  assert.equal(slugs.indexOf("design"), slugs.indexOf("map") + 1);
});

test("a document with no design system shows no Design System section at all", () => {
  for (const name of FIXTURE_NAMES) {
    const slugs = visibleSections(fixture(name)).map((s) => s.slug);
    assert.ok(!slugs.includes("design"), `${name} shows a Design System tab`);
  }
});

test("the Design System section is only ever added, never reordered around", () => {
  const withDesign = visibleSections(withDesignSystem(fixture("sample"))).map((s) => s.slug);
  assert.deepEqual(
    withDesign.filter((slug) => slug !== "design"),
    TODAYS_SECTIONS,
  );
});

test("the real document that carries a design system shows the section", () => {
  // `repo-onboarding` is this repository analysed by its own engine — the one
  // document with a real design system rather than a built one.
  const doc = fixture("repo-onboarding");
  assert.ok((doc.designSystem?.primitives.length ?? 0) >= 4);
  assert.ok(visibleSections(doc).some((s) => s.slug === "design"));
});

/** The Design System as the registry really records it. */
const DESIGN_SECTION = ANALYSIS_SECTIONS.find(
  (s): s is SpecializedSection => s.class === "specialized" && s.slug === "design",
)!;

test("a document predating the design system's contract could not have carried one", () => {
  // 1.2.0 is the last contract with no specialized section in it at all, which
  // is what makes it the honest "before" here. The "after" is read from the
  // registry rather than written down, so this does not rot at the next release.
  const old = { ...fixture("sample"), schemaVersion: "1.2.0" };
  assert.equal(canExpressSection(old, DESIGN_SECTION), false);

  const current = { ...fixture("sample"), schemaVersion: DESIGN_SECTION.since };
  assert.equal(canExpressSection(current, DESIGN_SECTION), true);
});

test("carrying a design system beats whatever version a document claims", () => {
  // No committed document is in this state any more: 1.3.0 released all three
  // specialized sections, so a document carrying one now declares a contract
  // that allowed it. The rule still has to hold, because a document written
  // anywhere else can carry a key while claiming an older contract, and nothing
  // may read that as a repository that lost something.
  const doc = withDesignSystem({ ...fixture("sample"), schemaVersion: "1.2.0" });
  assert.ok(compareSchemaVersions(doc.schemaVersion, DESIGN_SECTION.since) < 0);
  assert.equal(canExpressSection(doc, DESIGN_SECTION), true);
});

// --- Delivery -------------------------------------------------------------

/** The floor: a pipeline paragraph, a build that names an artefact, one gate. */
function withDelivery(base: Analysis): Analysis {
  return {
    ...base,
    delivery: {
      pipeline:
        "A push opens a pull request, one workflow runs the test job against it, and merging to main hands the commit to the host, which builds and serves it.",
      build: {
        produces: "A standalone server bundle the host runs directly.",
        file: "package.json",
        command: "npm run build",
      },
      gates: [
        {
          name: "test",
          file: ".github/workflows/ci.yml",
          checks: "Runs the unit suite; any failing assertion fails the job.",
          runLocally: "npm test",
        },
      ],
    },
  };
}

test("a document carrying a delivery section shows it straight after setup", () => {
  const slugs = visibleSections(withDelivery(fixture("sample"))).map((s) => s.slug);
  assert.ok(slugs.includes("delivery"));
  assert.equal(slugs.indexOf("delivery"), slugs.indexOf("setup") + 1);
});

test("a document with no committed pipeline shows no Delivery section at all", () => {
  for (const name of FIXTURE_NAMES) {
    const slugs = visibleSections(fixture(name)).map((s) => s.slug);
    assert.ok(!slugs.includes("delivery"), `${name} shows a Delivery tab`);
  }
});

test("the Delivery section is only ever added, never reordered around", () => {
  const withDeliv = visibleSections(withDelivery(fixture("sample"))).map((s) => s.slug);
  assert.deepEqual(
    withDeliv.filter((slug) => slug !== "delivery"),
    TODAYS_SECTIONS,
  );
});

test("delivery sits after setup even when the structural sections are present", () => {
  // The three specialized sections are independent and interleaved by meaning:
  // two join the structural block after the codebase map, this one follows
  // setup, and adding one must not drag the others out of position.
  const slugs = visibleSections(
    withDelivery(withDesignSystem(withApiSurface(fixture("sample")))),
  ).map((s) => s.slug);
  assert.equal(slugs.indexOf("api"), slugs.indexOf("map") + 1);
  assert.equal(slugs.indexOf("design"), slugs.indexOf("api") + 1);
  assert.equal(slugs.indexOf("delivery"), slugs.indexOf("setup") + 1);
});

test("the real document that carries a delivery section shows it", () => {
  // `repo-onboarding` is this repository analysed by its own engine — the one
  // document with a real committed pipeline rather than a built one.
  const doc = fixture("repo-onboarding");
  assert.ok((doc.delivery?.gates.length ?? 0) >= 1);
  assert.ok(visibleSections(doc).some((s) => s.slug === "delivery"));
});

/** The Delivery section as the registry really records it. */
const DELIVERY_SECTION = ANALYSIS_SECTIONS.find(
  (s): s is SpecializedSection => s.class === "specialized" && s.slug === "delivery",
)!;

test("a document predating delivery's contract could not have carried the section", () => {
  const old = { ...fixture("sample"), schemaVersion: "1.2.0" };
  assert.equal(canExpressSection(old, DELIVERY_SECTION), false);

  const current = { ...fixture("sample"), schemaVersion: DELIVERY_SECTION.since };
  assert.equal(canExpressSection(current, DELIVERY_SECTION), true);
});

test("carrying a delivery section beats whatever version a document claims", () => {
  // As with the design system above: a document from outside this repository
  // can carry the key while claiming a contract that predates it.
  const doc = withDelivery({ ...fixture("sample"), schemaVersion: "1.2.0" });
  assert.ok(compareSchemaVersions(doc.schemaVersion, DELIVERY_SECTION.since) < 0);
  assert.equal(canExpressSection(doc, DELIVERY_SECTION), true);
});

// --------------------------------------------------------------------------
// Reading absence against the contract a document declares
// --------------------------------------------------------------------------

/** The API surface as the registry really records it. */
const API_SECTION = ANALYSIS_SECTIONS.find(
  (s): s is SpecializedSection => s.class === "specialized" && s.slug === "api",
)!;

test("schema versions order numerically, not as strings", () => {
  assert.ok(compareSchemaVersions("1.2.0", "1.3.0") < 0);
  assert.ok(compareSchemaVersions("1.10.0", "1.9.0") > 0); // not "1.10" < "1.9"
  assert.equal(compareSchemaVersions("1.3.0", "1.3.0"), 0);
  assert.ok(compareSchemaVersions("2.0.0", "1.99.99") > 0);
});

test("a document declaring an older contract could not have carried the section", () => {
  const old = { ...fixture("sample"), schemaVersion: "1.2.0" };
  assert.equal(canExpressSection(old, API_SECTION), false);

  const current = { ...fixture("sample"), schemaVersion: API_SECTION.since };
  assert.equal(canExpressSection(current, API_SECTION), true);
});

test("carrying the section beats whatever version a document claims", () => {
  // A document carrying an API surface while declaring the contract before the
  // one that introduced it. Presence wins, so the next run dropping the section
  // is a real removal rather than a difference between two contracts.
  const doc = withApiSurface({ ...fixture("sample"), schemaVersion: "1.2.0" });
  assert.ok(compareSchemaVersions(doc.schemaVersion, API_SECTION.since) < 0);
  assert.equal(canExpressSection(doc, API_SECTION), true);
});

test("a schemaVersion that cannot be read counts as too old to have carried it", () => {
  // The conservative reading: nothing downstream gets to claim a repository
  // lost a section on the strength of a version string it could not parse.
  const garbled = { ...fixture("sample"), schemaVersion: "not-a-version" };
  assert.equal(canExpressSection(garbled, API_SECTION), false);
});
