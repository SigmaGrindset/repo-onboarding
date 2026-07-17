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

const FIXTURE_IDS = ["sample", "express"] as const;

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
    assert.ok(md.includes("```mermaid"), "embeds a mermaid diagram");
    assert.ok(md.includes("- [ ] "), "has a First Tasks checklist item");
    assert.ok(md.endsWith("\n"), "ends with a trailing newline");
    assert.ok(!md.endsWith("\n\n"), "has exactly one trailing newline");
  });
}
