import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli, SAMPLE } from "./helpers.mjs";

const haveSample = existsSync(SAMPLE);
const skipNoSample = haveSample ? false : "data/sample/analysis.json not present";

/** Make a fresh temp dir with the sample fixture copied to analysis.json. */
function withSampleDir() {
  const dir = mkdtempSync(join(tmpdir(), "roi-export-"));
  copyFileSync(SAMPLE, join(dir, "analysis.json"));
  return dir;
}

test(
  "export: default discovery writes ONBOARDING.md beside analysis.json (exit 0)",
  { skip: skipNoSample },
  async () => {
    const dir = withSampleDir();
    try {
      const res = await runCli(["export"], { cwd: dir });
      assert.equal(res.status, 0, res.stderr);

      const outPath = join(dir, "ONBOARDING.md");
      assert.ok(existsSync(outPath), "ONBOARDING.md was written");

      const md = readFileSync(outPath, "utf8");
      assert.ok(md.startsWith("# "), "starts with a level-1 heading");
      assert.match(md, /## Architecture/);
      assert.ok(md.includes("```mermaid"), "contains a mermaid fence");
      assert.match(md, /## Setup/);
      assert.ok(md.includes("- [ ] "), "contains a task-list item");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "export: explicit --out path is honored (exit 0)",
  { skip: skipNoSample },
  async () => {
    const dir = withSampleDir();
    try {
      const outPath = join(dir, "docs", "GUIDE.md");
      // dir/docs does not exist yet — writeFileSync needs the parent, so create it.
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(dir, "docs"));

      const res = await runCli(["export", "analysis.json", "--out", outPath], {
        cwd: dir,
      });
      assert.equal(res.status, 0, res.stderr);
      assert.ok(existsSync(outPath), "wrote to the --out path");
      assert.ok(
        !existsSync(join(dir, "ONBOARDING.md")),
        "did not also write the default path",
      );
      assert.ok(readFileSync(outPath, "utf8").startsWith("# "));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "export --out -: markdown on stdout only, chatter on stderr",
  { skip: skipNoSample },
  async () => {
    const res = await runCli(["export", SAMPLE, "--out", "-"]);
    assert.equal(res.status, 0, res.stderr);

    assert.ok(res.stdout.startsWith("# "), "stdout is the markdown");
    assert.ok(res.stdout.endsWith("\n"), "stdout ends with a newline");
    assert.ok(
      !res.stdout.includes("Wrote "),
      "no success chatter leaked into stdout",
    );
    assert.ok(
      !res.stdout.includes("interactive version"),
      "no hint chatter leaked into stdout",
    );
  },
);

test(
  "export: invalid document => exit 1 with INVALID; --force => exit 0 and writes",
  { skip: skipNoSample },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "roi-export-bad-"));
    try {
      const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
      delete doc.pitch; // drop a required top-level key
      const badPath = join(dir, "analysis.json");
      writeFileSync(badPath, JSON.stringify(doc));

      const bad = await runCli(["export", "analysis.json"], { cwd: dir });
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /INVALID/);
      assert.ok(
        !existsSync(join(dir, "ONBOARDING.md")),
        "no file written on a rejected export",
      );

      const forced = await runCli(["export", "analysis.json", "--force"], {
        cwd: dir,
      });
      assert.equal(forced.status, 0, forced.stderr);
      assert.ok(
        existsSync(join(dir, "ONBOARDING.md")),
        "--force wrote the file anyway",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("export: missing input file => IO error (exit 2)", async () => {
  const res = await runCli([
    "export",
    join(tmpdir(), "does-not-exist-export-xyz.json"),
  ]);
  assert.equal(res.status, 2);
});

test(
  "export: two runs produce byte-identical output (deterministic)",
  { skip: skipNoSample },
  async () => {
    const a = await runCli(["export", SAMPLE, "--out", "-"]);
    const b = await runCli(["export", SAMPLE, "--out", "-"]);
    assert.equal(a.status, 0, a.stderr);
    assert.equal(b.status, 0, b.stderr);
    assert.equal(a.stdout, b.stdout, "output is deterministic");
  },
);
