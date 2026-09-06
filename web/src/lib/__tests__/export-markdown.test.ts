/**
 * Parity + structural tests for the Markdown export.
 *
 * Run with `npm test` (which invokes `tsx --test`, cwd = `web/`). Plain
 * `node:test` + `node:assert/strict`.
 *
 * `web/src/lib/exportMarkdown.ts` is a hand-maintained TypeScript MIRROR of the
 * canonical `schema/export-markdown.mjs`. This test is the machine check that
 * keeps them in lockstep: for every real fixture it renders the document through
 * BOTH the TS mirror and the canonical `.mjs` (imported dynamically — tests run
 * under plain Node/tsx so importing outside `web/` is fine HERE, but non-test
 * web code must NEVER import the `.mjs`) and asserts byte-for-byte equality.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderOnboardingMarkdown } from "../exportMarkdown";
import type { Analysis } from "@schema/analysis";

type Renderer = (
  analysis: Analysis,
  options?: { siteUrl?: string; generatorVersion?: string },
) => string;

/**
 * The canonical generator, loaded from outside `web/` (allowed in tests only).
 * Lazily imported inside tests because tsx transforms this file to CJS, where
 * top-level `await` is unavailable; the dynamic import result is cached.
 */
let canonicalPromise: Promise<{ renderOnboardingMarkdown: Renderer }> | null =
  null;

function canonicalRenderer(): Promise<Renderer> {
  canonicalPromise ??= import(
    new URL("../../../../schema/export-markdown.mjs", import.meta.url).href
  ) as Promise<{ renderOnboardingMarkdown: Renderer }>;
  return canonicalPromise.then((m) => m.renderOnboardingMarkdown);
}

/**
 * `repo-onboarding` is here for a specific reason: parity is compared per
 * fixture, so a section no fixture carries could diverge between the mirror and
 * the canonical `.mjs` unnoticed. It is the only document with an `apiSurface`.
 */
const FIXTURE_IDS = ["sample", "express", "repo-onboarding"] as const;

function fixture(id: string): Analysis {
  const file = fileURLToPath(
    new URL(`../../../../data/${id}/analysis.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(file, "utf8")) as Analysis;
}

// --------------------------------------------------------------------------

for (const id of FIXTURE_IDS) {
  test(`TS mirror is byte-identical to the canonical .mjs — ${id}`, async () => {
    const doc = fixture(id);
    const renderCanonical = await canonicalRenderer();
    const mirror = renderOnboardingMarkdown(doc);
    const source = renderCanonical(doc);
    assert.equal(mirror, source);
  });

  test(`parity holds with an options bag — ${id}`, async () => {
    const doc = fixture(id);
    const renderCanonical = await canonicalRenderer();
    const options = {
      generatorVersion: "9.9.9",
      siteUrl: "https://example.com",
    };
    const mirror = renderOnboardingMarkdown(doc, options);
    const source = renderCanonical(doc, options);
    assert.equal(mirror, source);
    // The options actually flowed through, not just the defaults.
    assert.ok(mirror.includes("https://example.com"));
    assert.ok(mirror.includes("v9.9.9"));
  });

  test(`output has the expected structure — ${id}`, () => {
    const md = renderOnboardingMarkdown(fixture(id));
    assert.ok(md.startsWith("# "), "starts with an h1");
    assert.ok(md.includes("## Architecture"), "has an Architecture section");
    assert.ok(md.includes("## Contributor Guide"), "has a Contributor Guide section");
    assert.ok(md.includes("## Learn"), "has a Learn section");
    assert.ok(md.includes("**Start here:**"), "each technology has an entry point");
    assert.ok(md.includes("**In this repo:**"), "each technology is grounded in the repo");
    assert.ok(md.includes("```mermaid"), "embeds a mermaid diagram");
    assert.ok(md.includes("- [ ] "), "has a First Tasks checklist item");
    assert.ok(md.endsWith("\n"), "ends with a trailing newline");
    assert.ok(!md.endsWith("\n\n"), "has exactly one trailing newline");
  });
}

// --- API Surface -----------------------------------------------------------

test("a document with an API surface exports it, in its nav position", () => {
  const doc = fixture("repo-onboarding");
  const md = renderOnboardingMarkdown(doc);

  assert.ok(md.includes("## API Surface"), "the section has a heading");
  assert.ok(
    md.includes("- [API Surface](#api-surface)"),
    "the section is in the table of contents",
  );
  // After the codebase map, before the contributor guide — the registry order.
  assert.ok(
    md.indexOf("## Codebase Map") <
      md.indexOf("## API Surface") &&
      md.indexOf("## API Surface") < md.indexOf("## Contributor Guide"),
    "the section sits between the codebase map and the contributor guide",
  );

  // Exhaustive rows, curated prose: every route is a table row, and only the
  // routes carrying a note appear beneath.
  const routes = doc.apiSurface?.routes ?? [];
  assert.ok(routes.length > 0);
  for (const route of routes) {
    assert.ok(
      md.includes(`| ${route.method} | \`${route.path}\``),
      `${route.method} ${route.path} is missing from the table`,
    );
  }
  const explained = routes.filter((r) => r.note);
  assert.ok(explained.length > 0 && explained.length < routes.length);
  assert.ok(md.includes("### Routes worth explaining"));
  for (const route of explained) {
    assert.ok(
      md.includes(`**\`${route.method} ${route.path}\`** — ${route.note}`),
      `the note for ${route.method} ${route.path} is missing`,
    );
  }
});

test("a document without an API surface exports no such section", () => {
  const md = renderOnboardingMarkdown(fixture("sample"));
  assert.ok(!md.includes("## API Surface"));
  assert.ok(!md.includes("- [API Surface]"));
});
