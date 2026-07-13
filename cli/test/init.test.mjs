import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

import { runCli } from "./helpers.mjs";

test("init builds a working .repo-onboarding/ from a tiny fixture repo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roi-init-"));
  try {
    // A tiny throwaway repo (no git — exercises the soft-warning path too).
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "fixture", scripts: { test: "node --test" } }),
    );
    writeFileSync(join(dir, "src", "index.js"), "export const answer = 42;\n");
    writeFileSync(join(dir, "README.md"), "# fixture\n\nA throwaway repo.\n");

    const res = await runCli(["init", dir]);
    assert.equal(res.status, 0, `init failed: ${res.stderr}`);

    const work = join(dir, ".repo-onboarding");
    const prepassPath = join(work, "prepass.json");
    const promptPath = join(work, "PROMPT.md");
    const schemaPath = join(work, "schema.json");

    assert.ok(existsSync(prepassPath), "prepass.json exists");
    assert.ok(existsSync(promptPath), "PROMPT.md exists");
    assert.ok(existsSync(schemaPath), "schema.json exists");

    const prepass = JSON.parse(readFileSync(prepassPath, "utf8"));
    assert.equal(prepass.prepassVersion, "0.1.0");
    assert.equal(prepass.git.isRepo, false);

    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    assert.equal(schema.title, "Analysis");

    const prompt = readFileSync(promptPath, "utf8");
    assert.ok(!prompt.includes("{{"), "no unrendered {{placeholders}} remain");
    assert.ok(prompt.includes(basename(dir)), "repo name rendered into PROMPT");
    assert.ok(
      prompt.includes("npx repo-onboarding validate analysis.json"),
      "validate command rendered into PROMPT",
    );
    assert.ok(
      prompt.includes("repo-onboarding/0.1.0"),
      "analyzerVersion rendered into PROMPT",
    );

    // Non-git dir prints a soft warning, not a failure.
    assert.match(res.stdout, /not a git repository/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("init defaults its target path to the current directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roi-init-cwd-"));
  try {
    writeFileSync(join(dir, "README.md"), "# cwd fixture\n");
    const res = await runCli(["init"], { cwd: dir });
    assert.equal(res.status, 0, res.stderr);
    assert.ok(existsSync(join(dir, ".repo-onboarding", "PROMPT.md")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
