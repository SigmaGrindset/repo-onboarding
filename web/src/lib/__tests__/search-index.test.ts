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
