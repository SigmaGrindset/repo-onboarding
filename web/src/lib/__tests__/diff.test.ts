/**
 * Unit tests for the analysis diff engine.
 *
 * Run with `npm test` (which invokes `tsx --test`). These tests are plain
 * `node:test` + `node:assert/strict` — no framework — because `diff.ts` is a
 * pure module that must stay runnable outside Next.js. It reaches for the
 * section registry and the route label at runtime, and for nothing else; this
 * suite running under bare `tsx --test` is what keeps that honest.
 *
 * The `@schema` import below is type-only and erased at transpile time, so the
 * alias never needs runtime resolution; it exists only to keep the fixtures
 * honestly typed against the real `Analysis` contract.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Analysis, ApiRoute } from "@schema/analysis";
import type { SpecializedSection } from "../sections";
import { diffAnalyses, diffSpecializedSections } from "../diff";

/**
 * A complete, schema-shaped analysis document. Returns a FRESH object on every
 * call so a test that mutates `head` can never leak into another test's `base`.
 * Only the fields the engine actually reads carry test-relevant values; the rest
 * are valid filler so the object typechecks against `Analysis`.
 */
function baseAnalysis(): Analysis {
  return {
    schemaVersion: "1.0.0",
    metadata: {
      repoName: "demo",
      repoUrl: "https://github.com/acme/demo",
      analyzedAt: "2026-01-01T00:00:00Z",
      analyzerVersion: "1.2.0",
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      primaryLanguage: "TypeScript",
      stats: {
        totalFiles: 100,
        totalLoc: 5000,
        languages: [
          { language: "TypeScript", files: 60, loc: 4000, percentage: 80 },
          { language: "CSS", files: 20, loc: 600, percentage: 12 },
          { language: "JSON", files: 20, loc: 400, percentage: 8 },
        ],
      },
    },
    pitch: {
      summary: "A demo repo.",
      audience: "Developers.",
      techStack: [
        { name: "TypeScript", category: "language", role: "Primary language." },
      ],
    },
    architecture: [
      {
        title: "Overview",
        body: "The system does things.",
        diagram: { type: "flowchart", source: "graph TD; A-->B" },
      },
      { title: "Core Engine", body: "The engine processes data." },
      {
        title: "Data Layer",
        body: "Persists records.",
        diagram: { type: "er", source: "erDiagram X" },
      },
      { title: "API", body: "Serves requests." },
      { title: "Legacy", body: "Old stuff lives here." },
    ],
    dependencyGraph: {
      nodes: [
        {
          id: "n1",
          label: "App",
          kind: "entrypoint",
          description: "entry point",
          path: "src/app.ts",
        },
        { id: "n2", label: "Db", kind: "datastore", description: "database" },
        { id: "n3", label: "Utils", kind: "internal-module", path: "src/utils.ts" },
      ],
      edges: [
        { from: "n1", to: "n2", relationship: "reads from" },
        { from: "n1", to: "n3" },
        { from: "n3", to: "n2", relationship: "helps" },
      ],
    },
    codebaseMap: [{ path: "src", purpose: "Source.", role: "core" }],
    tour: [
      {
        order: 1,
        title: "Start",
        files: [{ path: "src/app.ts" }],
        why: "It is the entry point.",
        notice: "Read the bootstrap.",
      },
    ],
    hotspots: {
      entries: [
        {
          path: "src/a.ts",
          commits: 10,
          churnScore: 100,
          recentActivity: "active",
          insight: "Central and busy.",
        },
        {
          path: "src/b.ts",
          commits: 5,
          churnScore: 50,
          recentActivity: "moderate",
          insight: "Steady churn.",
        },
        {
          path: "src/c.ts",
          commits: 2,
          recentActivity: "dormant",
          insight: "Rarely touched.",
        },
        {
          path: "src/gone.ts",
          commits: 4,
          recentActivity: "active",
          insight: "Will be deleted.",
        },
      ],
      interpretation: "The core is where the action is.",
    },
    setup: {
      prerequisites: ["Node 22"],
      setup: [{ title: "Install", commands: ["npm install"] }],
      run: [{ title: "Run", commands: ["npm start"] }],
      test: [{ title: "Test", commands: ["npm test"] }],
    },
    firstTasks: [
      {
        title: "Fix a bug",
        description: "Squash something small.",
        difficulty: "easy",
        files: ["src/a.ts"],
        rationale: "A gentle introduction.",
      },
    ],
  };
}

// --------------------------------------------------------------------------
// 1. Identical documents
// --------------------------------------------------------------------------

test("identical documents produce no changes", () => {
  const diff = diffAnalyses(baseAnalysis(), baseAnalysis());

  assert.equal(diff.hasChanges, false);

  assert.deepEqual(diff.hotspots.deltas, []);
  assert.equal(diff.hotspots.unchangedCount, 4);

  assert.deepEqual(diff.graph.nodes.deltas, []);
  assert.equal(diff.graph.nodes.unchangedCount, 3);

  assert.deepEqual(diff.graph.edges.deltas, []);
  assert.equal(diff.graph.edges.unchangedCount, 3);

  assert.deepEqual(diff.architecture.deltas, []);
  assert.equal(diff.architecture.unchangedCount, 5);

  assert.equal(diff.stats.filesDelta, 0);
  assert.equal(diff.stats.locDelta, 0);
  assert.deepEqual(diff.stats.languages, []);

  // Endpoints carry the identifying facts of each run.
  assert.deepEqual(diff.base, {
    analyzedAt: "2026-01-01T00:00:00Z",
    commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    analyzerVersion: "1.2.0",
    totalFiles: 100,
    totalLoc: 5000,
  });
  assert.deepEqual(diff.base, diff.head);
});

// --------------------------------------------------------------------------
// 2. Hotspot add / remove / commits / activity / churnScore
// --------------------------------------------------------------------------

test("hotspot add, remove, and change deltas", () => {
  const base = baseAnalysis();
  const head = baseAnalysis();
  head.hotspots.entries = [
    // changed: commits +4, churnScore +60, active -> moderate
    {
      path: "src/a.ts",
      commits: 14,
      churnScore: 160,
      recentActivity: "moderate",
      insight: "Regenerated prose.",
    },
    // unchanged (identical structural facts; only omitted below is gone.ts)
    {
      path: "src/b.ts",
      commits: 5,
      churnScore: 50,
      recentActivity: "moderate",
      insight: "Steady churn.",
    },
    // changed: commits +1, no churnScore either side, activity unchanged
    {
      path: "src/c.ts",
      commits: 3,
      recentActivity: "dormant",
      insight: "Rarely touched.",
    },
    // added
    {
      path: "src/new.ts",
      commits: 7,
      churnScore: 70,
      recentActivity: "active",
      insight: "Brand new.",
    },
    // src/gone.ts omitted -> removed
  ];

  const diff = diffAnalyses(base, head);
  assert.equal(diff.hotspots.unchangedCount, 1); // only src/b.ts

  const byPath = (p: string) =>
    diff.hotspots.deltas.find((d) => d.path === p);

  const a = byPath("src/a.ts");
  assert.equal(a?.kind, "changed");
  assert.equal(a?.commitsDelta, 4);
  assert.equal(a?.churnScoreDelta, 60);
  assert.deepEqual(a?.activityChange, { from: "active", to: "moderate" });
  assert.equal(a?.before?.commits, 10);
  assert.equal(a?.after?.commits, 14);

  const c = byPath("src/c.ts");
  assert.equal(c?.kind, "changed");
  assert.equal(c?.commitsDelta, 1);
  assert.equal(c?.churnScoreDelta, undefined); // neither side defines churnScore
  assert.equal(c?.activityChange, undefined); // dormant -> dormant

  const added = byPath("src/new.ts");
  assert.equal(added?.kind, "added");
  assert.equal(added?.after?.commits, 7);
  assert.equal(added?.before, undefined);

  const removed = byPath("src/gone.ts");
  assert.equal(removed?.kind, "removed");
  assert.equal(removed?.before?.commits, 4);
  assert.equal(removed?.after, undefined);
});

// --------------------------------------------------------------------------
// 3. Narrative-only change is not a delta
// --------------------------------------------------------------------------

test("insight-only change is not counted as a hotspot delta", () => {
  const base = baseAnalysis();
  const head = baseAnalysis();
  head.hotspots.entries[1].insight = "Completely rewritten narrative prose.";
  head.hotspots.interpretation = "A different reading of the same facts.";

  const diff = diffAnalyses(base, head);
  assert.deepEqual(diff.hotspots.deltas, []);
  assert.equal(diff.hotspots.unchangedCount, 4);
  assert.equal(diff.hasChanges, false);
});

// --------------------------------------------------------------------------
// 4. Graph node add / remove / change (description excluded)
// --------------------------------------------------------------------------

test("graph node deltas ignore description-only changes", () => {
  const base = baseAnalysis();
  const head = baseAnalysis();
  head.dependencyGraph.nodes = [
    // description changed only -> NOT a change
    {
      id: "n1",
      label: "App",
      kind: "entrypoint",
      description: "the main entry",
      path: "src/app.ts",
    },
    // kind changed -> changed
    { id: "n2", label: "Db", kind: "service", description: "database" },
    // n3 removed; n4 added
    { id: "n4", label: "Cache", kind: "datastore" },
  ];
  // Keep edges identical so this test isolates node deltas.

  const diff = diffAnalyses(base, head);
  assert.equal(diff.graph.nodes.unchangedCount, 1); // n1

  const byId = (id: string) =>
    diff.graph.nodes.deltas.find((d) => d.id === id);

  assert.equal(byId("n1"), undefined); // description change ignored

  const n2 = byId("n2");
  assert.equal(n2?.kind, "changed");
  assert.equal(n2?.before?.kind, "datastore");
  assert.equal(n2?.after?.kind, "service");

  assert.equal(byId("n4")?.kind, "added");
  assert.equal(byId("n3")?.kind, "removed");
});

// --------------------------------------------------------------------------
// 5. Graph edge add / remove / relationship change
// --------------------------------------------------------------------------

test("graph edge deltas by (from,to) with relationship comparison", () => {
  const base = baseAnalysis();
  const head = baseAnalysis();
  head.dependencyGraph.edges = [
    { from: "n1", to: "n2", relationship: "queries" }, // changed text
    { from: "n1", to: "n3", relationship: "uses" }, // undefined -> "uses" == changed
    { from: "n2", to: "n3", relationship: "notifies" }, // added
    // n3 -> n2 "helps" omitted -> removed
  ];

  const diff = diffAnalyses(base, head);
  assert.equal(diff.graph.edges.unchangedCount, 0);

  const edge = (from: string, to: string) =>
    diff.graph.edges.deltas.find((d) => d.from === from && d.to === to);

  const e12 = edge("n1", "n2");
  assert.equal(e12?.kind, "changed");
  assert.equal(e12?.relationshipBefore, "reads from");
  assert.equal(e12?.relationshipAfter, "queries");

  const e13 = edge("n1", "n3");
  assert.equal(e13?.kind, "changed");
  assert.equal(e13?.relationshipBefore, undefined); // absent on base
  assert.equal(e13?.relationshipAfter, "uses");

  const e23 = edge("n2", "n3");
  assert.equal(e23?.kind, "added");
  assert.equal(e23?.relationshipBefore, undefined);
  assert.equal(e23?.relationshipAfter, "notifies");

  const e32 = edge("n3", "n2");
  assert.equal(e32?.kind, "removed");
  assert.equal(e32?.relationshipBefore, "helps");
  assert.equal(e32?.relationshipAfter, undefined);
});

// --------------------------------------------------------------------------
// 6. Architecture: reflow vs real edit, diagram change/add, retitle, join key
// --------------------------------------------------------------------------

test("architecture body/diagram deltas and case-insensitive title join", () => {
  const base = baseAnalysis();
  const head = baseAnalysis();
  head.architecture = [
    // whitespace-only reflow + identical diagram -> unchanged
    {
      title: "Overview",
      body: "The   system\n\n  does things. ",
      diagram: { type: "flowchart", source: "graph TD; A-->B" },
    },
    // case + surrounding-space title variation, real body edit -> changed(body)
    {
      title: "  core engine ",
      body: "The engine processes data quickly and safely.",
    },
    // diagram source edit, same body -> changed(diagram)
    {
      title: "Data Layer",
      body: "Persists records.",
      diagram: { type: "er", source: "erDiagram Y" },
    },
    // diagram added where there was none -> changed(diagram)
    {
      title: "API",
      body: "Serves requests.",
      diagram: { type: "flowchart", source: "graph LR; C-->D" },
    },
    // "Legacy" retitled -> removed(Legacy) + added(Legacy V2)
    { title: "Legacy V2", body: "Old stuff lives here." },
  ];

  const diff = diffAnalyses(base, head);
  assert.equal(diff.architecture.unchangedCount, 1); // Overview

  const byTitle = (t: string) =>
    diff.architecture.deltas.find(
      (d) => d.title.trim().toLowerCase() === t.trim().toLowerCase(),
    );

  assert.equal(byTitle("Overview"), undefined); // reflow is not a change

  const core = byTitle("core engine");
  assert.equal(core?.kind, "changed");
  assert.equal(core?.bodyChanged, true);
  assert.equal(core?.diagramChanged, false);
  assert.equal(core?.title, "  core engine "); // head-side title preserved

  const data = byTitle("Data Layer");
  assert.equal(data?.kind, "changed");
  assert.equal(data?.bodyChanged, false);
  assert.equal(data?.diagramChanged, true);

  const api = byTitle("API");
  assert.equal(api?.kind, "changed");
  assert.equal(api?.bodyChanged, false);
  assert.equal(api?.diagramChanged, true);

  const removed = byTitle("Legacy");
  assert.equal(removed?.kind, "removed");
  assert.equal(removed?.bodyChanged, false);
  assert.equal(removed?.diagramChanged, false);

  const added = byTitle("Legacy V2");
  assert.equal(added?.kind, "added");
  assert.equal(added?.bodyChanged, false);
  assert.equal(added?.diagramChanged, false);
});

// --------------------------------------------------------------------------
// 7. Stats: language appear/drop/change and file/loc arithmetic
// --------------------------------------------------------------------------

test("stats deltas: languages and file/loc arithmetic", () => {
  const base = baseAnalysis();
  const head = baseAnalysis();
  head.metadata.stats.totalFiles = 110;
  head.metadata.stats.totalLoc = 5100;
  head.metadata.stats.languages = [
    { language: "TypeScript", files: 62, loc: 4500, percentage: 82 }, // +500
    { language: "CSS", files: 20, loc: 600, percentage: 11 }, // unchanged
    { language: "Python", files: 8, loc: 300, percentage: 7 }, // new (0 -> 300)
    // JSON dropped (400 -> 0)
  ];

  const diff = diffAnalyses(base, head);
  assert.equal(diff.stats.filesDelta, 10);
  assert.equal(diff.stats.locDelta, 100);

  // Ordered by |loc swing| descending: TS(500), JSON(400), Python(300). CSS out.
  assert.deepEqual(
    diff.stats.languages.map((l) => l.language),
    ["TypeScript", "JSON", "Python"],
  );

  const lang = (name: string) =>
    diff.stats.languages.find((l) => l.language === name);
  assert.deepEqual(lang("TypeScript"), {
    language: "TypeScript",
    locBefore: 4000,
    locAfter: 4500,
  });
  assert.deepEqual(lang("JSON"), {
    language: "JSON",
    locBefore: 400,
    locAfter: 0,
  });
  assert.deepEqual(lang("Python"), {
    language: "Python",
    locBefore: 0,
    locAfter: 300,
  });
  assert.equal(lang("CSS"), undefined);
  assert.equal(diff.hasChanges, true);
});

// --------------------------------------------------------------------------
// 8. Deterministic ordering: added -> changed -> removed, magnitude desc, ties
// --------------------------------------------------------------------------

test("hotspot deltas sort by group, magnitude, then alphabetically", () => {
  const base = baseAnalysis();
  const head = baseAnalysis();
  base.hotspots.entries = [
    { path: "chg-big.ts", commits: 10, recentActivity: "active", insight: "x" },
    { path: "chg-small.ts", commits: 10, recentActivity: "active", insight: "x" },
    { path: "rm-a.ts", commits: 7, recentActivity: "active", insight: "x" },
    { path: "rm-b.ts", commits: 7, recentActivity: "active", insight: "x" },
  ];
  head.hotspots.entries = [
    { path: "chg-big.ts", commits: 20, recentActivity: "active", insight: "x" }, // Δ10
    { path: "chg-small.ts", commits: 12, recentActivity: "active", insight: "x" }, // Δ2
    { path: "add-big.ts", commits: 15, recentActivity: "active", insight: "x" }, // +15
    { path: "add-small.ts", commits: 4, recentActivity: "active", insight: "x" }, // +4
    // rm-a.ts / rm-b.ts removed, both commits 7 -> alphabetical tiebreak
  ];

  const diff = diffAnalyses(base, head);
  assert.deepEqual(
    diff.hotspots.deltas.map((d) => `${d.kind}:${d.path}`),
    [
      "added:add-big.ts", // added group, mag 15
      "added:add-small.ts", // added group, mag 4
      "changed:chg-big.ts", // changed group, |Δ| 10
      "changed:chg-small.ts", // changed group, |Δ| 2
      "removed:rm-a.ts", // removed group, mag 7, alphabetical tie
      "removed:rm-b.ts",
    ],
  );
});

// --------------------------------------------------------------------------
// 9. Duplicate join key within one document: first occurrence wins
// --------------------------------------------------------------------------

test("duplicate hotspot path: first occurrence wins, no crash", () => {
  const base = baseAnalysis();
  const head = baseAnalysis();
  base.hotspots.entries = [
    { path: "dup.ts", commits: 5, recentActivity: "active", insight: "first" },
    { path: "dup.ts", commits: 99, recentActivity: "active", insight: "second" },
  ];
  head.hotspots.entries = [
    { path: "dup.ts", commits: 8, recentActivity: "active", insight: "head" },
  ];

  const diff = diffAnalyses(base, head);
  assert.equal(diff.hotspots.deltas.length, 1);
  assert.equal(diff.hotspots.deltas[0].kind, "changed");
  // 8 - 5 (first), NOT 8 - 99 (the ignored duplicate).
  assert.equal(diff.hotspots.deltas[0].commitsDelta, 3);
  assert.equal(diff.hotspots.unchangedCount, 0);
});

// --------------------------------------------------------------------------
// 10. Specialized sections: presence, and the two cases that look like it
// --------------------------------------------------------------------------

/**
 * A document at a given contract version, optionally carrying an API surface.
 * `schemaVersion` is what separates "this repository has no API surface" from
 * "this document was written before API surfaces existed", so every
 * specialized section test sets it deliberately.
 */
function docAt(schemaVersion: string, routes?: ApiRoute[]): Analysis {
  const a = baseAnalysis();
  a.schemaVersion = schemaVersion;
  if (routes) a.apiSurface = { routes };
  return a;
}

/** Two routes, enough to make a surface that is plainly present. */
function someRoutes(): ApiRoute[] {
  return [
    { method: "GET", path: "/api/items", file: "src/items.ts", actor: "visitor" },
    { method: "POST", path: "/api/items", file: "src/items.ts", actor: "admin" },
  ];
}

const apiDelta = (diff: ReturnType<typeof diffAnalyses>) =>
  diff.sections.deltas.find((d) => d.slug === "api");

test("a section present in both documents is not a presence change", () => {
  const diff = diffAnalyses(
    docAt("1.3.0", someRoutes()),
    docAt("1.3.0", someRoutes()),
  );
  assert.deepEqual(diff.sections.deltas, []);
});

test("a section absent from both documents is not a presence change", () => {
  const diff = diffAnalyses(docAt("1.3.0"), docAt("1.3.0"));
  assert.deepEqual(diff.sections.deltas, []);
});

test("a section the newer document gained is reported as added", () => {
  // The older document could have carried an API surface and did not, so its
  // silence belongs to the repository: this repository gained one.
  const diff = diffAnalyses(docAt("1.3.0"), docAt("1.3.0", someRoutes()));

  assert.deepEqual(diff.sections.deltas, [
    { slug: "api", label: "API Surface", kind: "added" },
  ]);
  assert.equal(diff.hasChanges, true);
});

test("a section the older document predates is newly present, never removed", () => {
  // The older document is a 1.2.0 document: API surfaces did not exist when it
  // was written. The section IS newly present, and the reader gains a tab, but
  // nothing here says the repository gained an API surface, and nothing says
  // it lost one.
  const diff = diffAnalyses(docAt("1.2.0"), docAt("1.3.0", someRoutes()));

  const d = apiDelta(diff);
  assert.equal(d?.kind, "newly-present");
  assert.notEqual(d?.kind, "removed");
  assert.equal(diff.hasChanges, true);
});

test("a section dropped between two documents that could both carry it is removed", () => {
  const diff = diffAnalyses(docAt("1.3.0", someRoutes()), docAt("1.3.0"));

  assert.deepEqual(diff.sections.deltas, [
    { slug: "api", label: "API Surface", kind: "removed" },
  ]);
});

test("a section the NEWER document predates is not stated, never removed", () => {
  // Regenerating with an older engine: the newer run has no place in its
  // contract to put an API surface, so its silence says nothing about the
  // repository. This is the case a naive presence comparison calls a removal.
  const diff = diffAnalyses(docAt("1.3.0", someRoutes()), docAt("1.2.0"));

  const d = apiDelta(diff);
  assert.equal(d?.kind, "not-stated");
  assert.notEqual(d?.kind, "removed");
});

test("a section carried by a document that predates its release still counts as present", () => {
  // A document written while a section was still unreleased carries the key and
  // declares the older contract. Presence wins over the version: dropping the
  // section from the next run is a real removal, not a contract difference.
  const diff = diffAnalyses(docAt("1.2.0", someRoutes()), docAt("1.3.0"));
  assert.equal(apiDelta(diff)?.kind, "removed");

  // The same document on the head side is an addition rather than merely newly
  // present, because the 1.3.0 base could have carried one and did not.
  const reverse = diffAnalyses(docAt("1.3.0"), docAt("1.2.0", someRoutes()));
  assert.equal(apiDelta(reverse)?.kind, "added");
});

// --------------------------------------------------------------------------
// 11. The presence rule is one rule, applied to every specialized section
// --------------------------------------------------------------------------

test("the presence rule is a function of the section registry, not of the API surface", () => {
  // A stand-in registry: the API surface as it really is, plus a second
  // specialized section introduced at a different contract version. Neither
  // entry has to be a section that ships, which is the point: the rule is
  // written once and reads whatever the registry holds. The second entry
  // borrows a real optional key so the fixture stays honestly typed.
  const registry: SpecializedSection[] = [
    {
      slug: "api",
      label: "API Surface",
      class: "specialized",
      key: "apiSurface",
      since: "1.3.0",
    },
    {
      slug: "learn",
      label: "Stand-in Section",
      class: "specialized",
      key: "learningResources",
      since: "1.2.0",
    },
  ];

  const withStandIn = (a: Analysis): Analysis => {
    a.learningResources = [
      {
        tech: "TypeScript",
        official: "https://www.typescriptlang.org/docs/",
        resources: [],
        inRepo: { note: "Types everywhere.", files: [{ path: "src/a.ts" }] },
      },
    ];
    return a;
  };

  // Both sections gained, and both documents were new enough to have said so.
  assert.deepEqual(
    diffSpecializedSections(
      docAt("1.3.0"),
      withStandIn(docAt("1.3.0", someRoutes())),
      registry,
    ),
    [
      { slug: "api", label: "API Surface", kind: "added" },
      { slug: "learn", label: "Stand-in Section", kind: "added" },
    ],
  );

  // A 1.1.0 base predates both, so neither is a claim about the repository.
  assert.deepEqual(
    diffSpecializedSections(
      docAt("1.1.0"),
      withStandIn(docAt("1.3.0", someRoutes())),
      registry,
    ),
    [
      { slug: "api", label: "API Surface", kind: "newly-present" },
      { slug: "learn", label: "Stand-in Section", kind: "newly-present" },
    ],
  );

  // A 1.2.0 head predates only the API surface: one section is not stated, the
  // other is genuinely gone. One rule reads both.
  assert.deepEqual(
    diffSpecializedSections(
      withStandIn(docAt("1.3.0", someRoutes())),
      docAt("1.2.0"),
      registry,
    ),
    [
      { slug: "api", label: "API Surface", kind: "not-stated" },
      { slug: "learn", label: "Stand-in Section", kind: "removed" },
    ],
  );
});

test("the real registry now reads a second section through the same rule", () => {
  // The stand-in registry above proves the rule generalises; this proves the
  // Design System is actually wired into it, which is a different claim and the
  // one that breaks if a section is added to the schema and not to the registry.
  const withDesign = (a: Analysis): Analysis => {
    a.designSystem = {
      approach:
        "One stylesheet of custom properties behind utility classes; no component writes a colour literal.",
      tokens: [
        {
          name: "Colour",
          file: "src/tokens.css",
          usage: "Referenced as var(--surface-2) in CSS and bg-surface-2 in markup.",
          examples: ["--surface", "--text"],
        },
      ],
      primitives: [
        { name: "Badge", file: "src/ui.tsx", use: "A squared-off label carrying data." },
        { name: "Card", file: "src/ui.tsx", use: "The surface a top-level block sits on." },
        { name: "Field", file: "src/ui.tsx", use: "A labelled input with its error text." },
        { name: "Stack", file: "src/ui.tsx", use: "Vertical rhythm between blocks." },
      ],
      reuseRule: {
        reuseWhen: "Read src/ui.tsx first; a shape differing only by colour is a prop.",
        createWhen: "Extract one when a second surface needs the same behaviour.",
        newPrimitiveHome: "src/ui.tsx",
      },
    };
    return a;
  };

  const designDelta = (diff: ReturnType<typeof diffAnalyses>) =>
    diff.sections.deltas.find((d) => d.slug === "design");

  // Gained between two documents that could both have carried one.
  assert.equal(
    designDelta(diffAnalyses(docAt("1.3.0"), withDesign(docAt("1.3.0"))))?.kind,
    "added",
  );
  // The base predates the section, so its silence is the contract's.
  assert.equal(
    designDelta(diffAnalyses(docAt("1.2.0"), withDesign(docAt("1.3.0"))))?.kind,
    "newly-present",
  );
  // And a repository can gain both sections at once, each read by the same rule.
  assert.deepEqual(
    diffAnalyses(docAt("1.3.0"), withDesign(docAt("1.3.0", someRoutes()))).sections
      .deltas,
    [
      { slug: "api", label: "API Surface", kind: "added" },
      { slug: "design", label: "Design System", kind: "added" },
    ],
  );
});

test("the real registry now reads a third section through the same rule", () => {
  // Delivery is wired into the registry, so the same rule reads it — and this
  // is the assertion that breaks if a section is added to the schema and the
  // viewer but not to the registry the diff derives from.
  const withDelivery = (a: Analysis): Analysis => {
    a.delivery = {
      pipeline:
        "A push opens a pull request, one workflow runs the gate below against it, and merging to main hands the commit to the host to build and serve.",
      build: {
        produces: "A standalone server bundle the host runs directly.",
        file: "package.json",
      },
      gates: [
        {
          name: "test",
          file: ".github/workflows/ci.yml",
          checks: "Runs the unit suite; one failing assertion fails the job.",
        },
      ],
    };
    return a;
  };

  const deliveryDelta = (diff: ReturnType<typeof diffAnalyses>) =>
    diff.sections.deltas.find((d) => d.slug === "delivery");

  // Gained between two documents that could both have carried one.
  assert.equal(
    deliveryDelta(diffAnalyses(docAt("1.3.0"), withDelivery(docAt("1.3.0"))))?.kind,
    "added",
  );
  // The base predates the section, so its silence is the contract's.
  assert.equal(
    deliveryDelta(diffAnalyses(docAt("1.2.0"), withDelivery(docAt("1.3.0"))))?.kind,
    "newly-present",
  );
  // A repository that stopped committing a pipeline really did lose one.
  assert.equal(
    deliveryDelta(diffAnalyses(withDelivery(docAt("1.3.0")), docAt("1.3.0")))?.kind,
    "removed",
  );
  // And the deltas stay in reading order: delivery follows setup, so it sorts
  // after the two sections that join the structural block.
  assert.deepEqual(
    diffAnalyses(docAt("1.3.0"), withDelivery(docAt("1.3.0", someRoutes()))).sections
      .deltas.map((d) => d.slug),
    ["api", "delivery"],
  );
});

// --------------------------------------------------------------------------
// 12. Routes added, removed and changed
// --------------------------------------------------------------------------

test("route deltas by method and path, with file and actor changes", () => {
  const base = docAt("1.3.0", [
    { method: "GET", path: "/api/items", file: "src/items.ts", actor: "visitor" },
    { method: "POST", path: "/api/items", file: "src/items.ts", actor: "admin" },
    {
      method: "GET",
      path: "/api/items/[id]",
      file: "src/item.ts",
      actor: "visitor",
      note: "The one everything goes through.",
    },
    { method: "DELETE", path: "/api/items/[id]", file: "src/item.ts", actor: "admin" },
  ]);
  const head = docAt("1.3.0", [
    // moved to another file
    { method: "GET", path: "/api/items", file: "src/routes/items.ts", actor: "visitor" },
    // the actor permitted to call it changed
    { method: "POST", path: "/api/items", file: "src/items.ts", actor: "signed-in reader" },
    // note rewritten only: narrative, so not a change
    {
      method: "GET",
      path: "/api/items/[id]",
      file: "src/item.ts",
      actor: "visitor",
      note: "Regenerated prose.",
    },
    // DELETE /api/items/[id] dropped, PATCH added
    { method: "PATCH", path: "/api/items/[id]", file: "src/item.ts", actor: "admin" },
  ]);

  const diff = diffAnalyses(base, head);
  const byLabel = (l: string) => diff.apiSurface.deltas.find((d) => d.label === l);

  assert.equal(diff.apiSurface.unchangedCount, 1); // GET /api/items/[id]

  const moved = byLabel("GET /api/items");
  assert.equal(moved?.kind, "changed");
  assert.deepEqual(moved?.fileChange, {
    from: "src/items.ts",
    to: "src/routes/items.ts",
  });
  assert.equal(moved?.actorChange, undefined);

  const reassigned = byLabel("POST /api/items");
  assert.equal(reassigned?.kind, "changed");
  assert.deepEqual(reassigned?.actorChange, {
    from: "admin",
    to: "signed-in reader",
  });
  assert.equal(reassigned?.fileChange, undefined);

  const added = byLabel("PATCH /api/items/[id]");
  assert.equal(added?.kind, "added");
  assert.equal(added?.after?.actor, "admin");
  assert.equal(added?.before, undefined);

  const removed = byLabel("DELETE /api/items/[id]");
  assert.equal(removed?.kind, "removed");
  assert.equal(removed?.before?.file, "src/item.ts");
  assert.equal(removed?.after, undefined);

  assert.equal(diff.hasChanges, true);
});

test("route deltas sort added, then changed, then removed, alphabetically within each", () => {
  const base = docAt("1.3.0", [
    { method: "GET", path: "/b", file: "b.ts", actor: "visitor" },
    { method: "GET", path: "/gone-b", file: "x.ts", actor: "visitor" },
    { method: "GET", path: "/gone-a", file: "x.ts", actor: "visitor" },
  ]);
  const head = docAt("1.3.0", [
    { method: "GET", path: "/b", file: "b2.ts", actor: "visitor" },
    { method: "GET", path: "/new-b", file: "n.ts", actor: "visitor" },
    { method: "GET", path: "/new-a", file: "n.ts", actor: "visitor" },
  ]);

  assert.deepEqual(
    diffAnalyses(base, head).apiSurface.deltas.map((d) => `${d.kind}:${d.label}`),
    [
      "added:GET /new-a",
      "added:GET /new-b",
      "changed:GET /b",
      "removed:GET /gone-a",
      "removed:GET /gone-b",
    ],
  );
});

test("routes are not enumerated when the section itself appeared or disappeared", () => {
  // The section-level delta already says the whole surface arrived. Listing
  // every route in it as added would bury that one line underneath them.
  const appeared = diffAnalyses(docAt("1.3.0"), docAt("1.3.0", someRoutes()));
  assert.deepEqual(appeared.apiSurface.deltas, []);
  assert.equal(appeared.apiSurface.unchangedCount, 0);
  assert.equal(apiDelta(appeared)?.kind, "added");

  // And no route is reported as removed when the newer document simply
  // predates the section.
  const predates = diffAnalyses(docAt("1.3.0", someRoutes()), docAt("1.2.0"));
  assert.deepEqual(predates.apiSurface.deltas, []);
});

test("an unchanged API surface is not a change", () => {
  const diff = diffAnalyses(
    docAt("1.3.0", someRoutes()),
    docAt("1.3.0", someRoutes()),
  );
  assert.deepEqual(diff.apiSurface.deltas, []);
  assert.equal(diff.apiSurface.unchangedCount, 2);
  assert.deepEqual(diff.sections.deltas, []);
  assert.equal(diff.hasChanges, false);
});

test("duplicate route identity: first occurrence wins, no crash", () => {
  const base = docAt("1.3.0", [
    { method: "GET", path: "/dup", file: "first.ts", actor: "visitor" },
    { method: "GET", path: "/dup", file: "second.ts", actor: "visitor" },
  ]);
  const head = docAt("1.3.0", [
    { method: "GET", path: "/dup", file: "third.ts", actor: "visitor" },
  ]);

  const diff = diffAnalyses(base, head);
  assert.equal(diff.apiSurface.deltas.length, 1);
  assert.deepEqual(diff.apiSurface.deltas[0].fileChange, {
    from: "first.ts",
    to: "third.ts",
  });
});
