/**
 * Unit tests for the public demo: which paths the proxy opens for it, and that
 * the fixture it points at actually exists and is traced into the deployment.
 *
 * Run with `npm test` (which invokes `tsx --test`). Plain `node:test` +
 * `node:assert/strict` — `demo.ts` is a pure module with zero imports.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_ANALYSIS_ID, DEMO_PUBLIC_ROUTES, isDemoAnalysis } from "../demo";

const isPublic = (path: string) => DEMO_PUBLIC_ROUTES.some((r) => r.test(path));

test("the demo's pages, OG image and Markdown download are public", () => {
  for (const path of [
    `/analysis/${DEMO_ANALYSIS_ID}`,
    `/analysis/${DEMO_ANALYSIS_ID}/tour`,
    `/analysis/${DEMO_ANALYSIS_ID}/delivery`,
    `/analysis/${DEMO_ANALYSIS_ID}/opengraph-image`,
    `/api/analyses/${DEMO_ANALYSIS_ID}/markdown`,
  ]) {
    assert.equal(isPublic(path), true, path);
  }
});

test("look-alike ids, other fixtures and the demo's account-only APIs stay private", () => {
  for (const path of [
    `/analysis/${DEMO_ANALYSIS_ID}-private`,
    `/analysis/${DEMO_ANALYSIS_ID}x/tour`,
    `/analysis/x${DEMO_ANALYSIS_ID}`,
    "/analysis/sample",
    "/analysis/express",
    `/api/analyses/${DEMO_ANALYSIS_ID}`,
    `/api/analyses/${DEMO_ANALYSIS_ID}/chat`,
    `/api/analyses/${DEMO_ANALYSIS_ID}/onboarding-progress`,
    `/api/analyses/${DEMO_ANALYSIS_ID}/markdown/extra`,
  ]) {
    assert.equal(isPublic(path), false, path);
  }
});

test("isDemoAnalysis matches only the exact id", () => {
  assert.equal(isDemoAnalysis(DEMO_ANALYSIS_ID), true);
  assert.equal(isDemoAnalysis(`${DEMO_ANALYSIS_ID}-2`), false);
  assert.equal(isDemoAnalysis(DEMO_ANALYSIS_ID.toUpperCase()), false);
});

test("the demo fixture exists and next.config.ts traces it into the server bundle", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(`../../../../data/${DEMO_ANALYSIS_ID}/analysis.json`, import.meta.url),
      "utf8",
    ),
  );
  assert.equal(fixture.metadata.repoName, DEMO_ANALYSIS_ID);

  const config = readFileSync(new URL("../../../next.config.ts", import.meta.url), "utf8");
  assert.ok(
    config.includes(`data/${DEMO_ANALYSIS_ID}/analysis.json`),
    "next.config.ts must list the demo fixture in outputFileTracingIncludes so every deployment carries it",
  );
});
