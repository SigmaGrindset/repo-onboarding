/**
 * Unit tests for the command-palette search index.
 *
 * A pure function of an analysis document, so it is asserted directly rather
 * than through the palette component — the same doctrine as the derived section
 * list and the chat starter questions. Run with `npm test` (cwd = `web/`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Analysis } from "@schema/analysis";
import { buildSearchIndex } from "../search-index";

function fixture(name: string): Analysis {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "..", "data", name, "analysis.json"),
      "utf8",
    ),
  ) as Analysis;
}

const BASE = "/analysis/repo-onboarding";

test("a route is findable by its path, and reaches the row it names", () => {
  const doc = fixture("repo-onboarding");
  const items = buildSearchIndex(doc, BASE);

  // The palette matches on the label first, so the label has to carry the path
  // a reader would actually type.
  const upload = items.find((i) => i.label === "POST /api/v1/analyses");
  assert.ok(upload, "the CLI publishing route is not in the index");
  assert.equal(upload.group, "API Surface");
  assert.equal(upload.hint, "token-bearing CLI");
  assert.ok(
    upload.href.startsWith(`${BASE}/api?route=`),
    `"${upload.href}" does not deep-link into the section`,
  );
  assert.equal(upload.keywords, "web/src/app/api/v1/analyses/route.ts");
});

test("every route is indexed, not a selection", () => {
  const doc = fixture("repo-onboarding");
  const indexed = buildSearchIndex(doc, BASE).filter(
    (i) => i.group === "API Surface",
  );
  assert.equal(indexed.length, doc.apiSurface?.routes.length);
});

test("two routes on one path are separate entries", () => {
  // `/api/analyses/[id]/share-link` is both a POST and a DELETE, and a reader
  // searching for it has to be able to tell which one they are jumping to.
  const doc = fixture("repo-onboarding");
  const hrefs = buildSearchIndex(doc, BASE)
    .filter((i) => i.label.endsWith("/api/analyses/[id]/share-link"))
    .map((i) => i.href);
  assert.equal(hrefs.length, 2);
  assert.equal(new Set(hrefs).size, 2, "the two methods share an anchor");
});

test("a document with no API surface contributes no route entries", () => {
  const items = buildSearchIndex(fixture("sample"), "/analysis/sample");
  assert.equal(items.filter((i) => i.group === "API Surface").length, 0);
  // ...and the section itself is not offered as a jump target either.
  assert.equal(items.filter((i) => i.label === "API Surface").length, 0);
});

// --- Design System ---------------------------------------------------------

test("a primitive is findable by its name, and reaches the row it names", () => {
  const doc = fixture("repo-onboarding");
  const items = buildSearchIndex(doc, BASE);

  // The question the section exists to answer — "is there already a Card?" —
  // is one a reader asks the palette first.
  const card = items.find(
    (i) => i.group === "Design System" && i.label === "Card",
  );
  assert.ok(card, "the Card primitive is not in the index");
  assert.ok(
    card.href.startsWith(`${BASE}/design?primitive=`),
    `"${card.href}" does not deep-link into the section`,
  );
  // The file is the hint and the keyword: a reader who knows where it lives
  // finds it that way, and one who does not is told.
  assert.equal(card.hint, "ui.tsx");
  assert.equal(card.keywords, "web/src/components/ui.tsx");
});

test("every primitive is indexed, not a selection", () => {
  const doc = fixture("repo-onboarding");
  const indexed = buildSearchIndex(doc, BASE).filter(
    (i) => i.group === "Design System",
  );
  assert.equal(indexed.length, doc.designSystem?.primitives.length);
});

test("two primitives of the same name are separate entries", () => {
  // Names are deliberately not unique — see the Primitive entry in CONTEXT.md —
  // so the anchor cannot be the name alone: a reader jumping to one Button must
  // not land on the other.
  const doc = fixture("repo-onboarding");
  const primitives = doc.designSystem?.primitives ?? [];
  const twinned: Analysis = {
    ...doc,
    designSystem: {
      ...doc.designSystem!,
      primitives: [
        ...primitives,
        { ...primitives[0], file: "web/src/components/legacy/ui.tsx" },
      ],
    },
  };
  const hrefs = buildSearchIndex(twinned, BASE)
    .filter((i) => i.group === "Design System" && i.label === primitives[0].name)
    .map((i) => i.href);
  assert.equal(hrefs.length, 2);
  assert.equal(new Set(hrefs).size, 2, "the two files share an anchor");
});

test("a document with no design system contributes no primitive entries", () => {
  const items = buildSearchIndex(fixture("sample"), "/analysis/sample");
  assert.equal(items.filter((i) => i.group === "Design System").length, 0);
  // ...and the section itself is not offered as a jump target either.
  assert.equal(items.filter((i) => i.label === "Design System").length, 0);
});

// --- Delivery --------------------------------------------------------------

test("a gate is findable by its name, and reaches the row it names", () => {
  const doc = fixture("repo-onboarding");
  const items = buildSearchIndex(doc, BASE);

  const gate = doc.delivery!.gates[0];
  const hit = items.find((i) => i.group === "Delivery" && i.label === gate.name);
  assert.ok(hit, `the ${gate.name} gate is not in the index`);
  assert.ok(
    hit.href.startsWith(`${BASE}/delivery?gate=`),
    `"${hit.href}" does not deep-link into the section`,
  );
  assert.equal(hit.hint, "ci.yml");
});

test("a gate is findable by the command that pre-empts it", () => {
  // A reader knows `npm run lint` long before they know what the job is
  // called, so the command is matchable even though the hint is the file.
  const doc = fixture("repo-onboarding");
  const runnable = doc.delivery!.gates.filter((g) => g.runLocally);
  assert.ok(runnable.length > 0, "the fixture has gates a reader can pre-empt");

  const items = buildSearchIndex(doc, BASE);
  for (const gate of runnable) {
    const hit = items.find((i) => i.group === "Delivery" && i.label === gate.name);
    assert.ok(
      hit?.keywords?.includes(gate.runLocally!),
      `${gate.name} cannot be found by "${gate.runLocally}"`,
    );
  }
});

test("every gate is indexed, not a selection", () => {
  const doc = fixture("repo-onboarding");
  const indexed = buildSearchIndex(doc, BASE).filter((i) => i.group === "Delivery");
  assert.equal(indexed.length, doc.delivery?.gates.length);
});

test("two gates of the same name in different files are separate entries", () => {
  // A gate is named as the repository names it, and two workflow files may
  // each define a `test` job — so the anchor cannot be the name alone.
  const doc = fixture("repo-onboarding");
  const gates = doc.delivery!.gates;
  const twinned: Analysis = {
    ...doc,
    delivery: {
      ...doc.delivery!,
      gates: [...gates, { ...gates[0], file: ".github/workflows/nightly.yml" }],
    },
  };
  const hrefs = buildSearchIndex(twinned, BASE)
    .filter((i) => i.group === "Delivery" && i.label === gates[0].name)
    .map((i) => i.href);
  assert.equal(hrefs.length, 2);
  assert.equal(new Set(hrefs).size, 2, "the two files share an anchor");
});

test("deploy variables are deliberately not indexed", () => {
  // Exhaustive in the document, but nobody jumps to one: a reader checking
  // what a deploy needs reads the whole list, and the section entry goes there.
  const doc = fixture("repo-onboarding");
  const variables = doc.delivery?.deployVariables ?? [];
  assert.ok(variables.length > 0, "the fixture declares deploy variables");

  const labels = new Set(buildSearchIndex(doc, BASE).map((i) => i.label));
  for (const variable of variables) {
    assert.ok(!labels.has(variable.name), `${variable.name} is in the palette`);
  }
});

test("a document with no delivery section contributes no gate entries", () => {
  const items = buildSearchIndex(fixture("sample"), "/analysis/sample");
  assert.equal(items.filter((i) => i.group === "Delivery").length, 0);
  // ...and the section itself is not offered as a jump target either.
  assert.equal(items.filter((i) => i.label === "Delivery").length, 0);
});
