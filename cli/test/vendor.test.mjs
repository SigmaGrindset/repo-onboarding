import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { PKG_ROOT, REPO_ROOT } from "./helpers.mjs";
import { VENDOR_MAP } from "../scripts/sync.mjs";

// Detect the monorepo by the presence of a canonical source. Outside it (e.g.
// a published tarball) the sources are gone, so drift is unverifiable — skip.
const inMonorepo = existsSync(
  resolve(REPO_ROOT, ".claude", "skills", "onboard", "prepass.mjs"),
);
const skip = inMonorepo
  ? false
  : "canonical sources absent (published tarball) — drift check skipped";

for (const { source, vendored } of VENDOR_MAP) {
  test(`vendor/${vendored} is byte-identical to ${source}`, { skip }, () => {
    const src = readFileSync(resolve(REPO_ROOT, source));
    const ven = readFileSync(resolve(PKG_ROOT, "vendor", vendored));
    assert.ok(
      src.equals(ven),
      `vendor/${vendored} has drifted from ${source} — run \`npm run sync\``,
    );
  });
}
