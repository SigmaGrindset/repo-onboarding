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
import { execFileSync } from "node:child_process";

import { runCli } from "./helpers.mjs";
import { ANALYZER_VERSION } from "../src/constants.mjs";

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
      prompt.includes(ANALYZER_VERSION),
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

// ---------------------------------------------------------------------------
// Ignore handling: what the repo excludes must not become "the repo".
// ---------------------------------------------------------------------------

/** Build a repo whose ignored data dwarfs its source. */
function makeRepoWithIgnoredBulk(dir) {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "data", "raw"), { recursive: true });

  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture" }));
  writeFileSync(join(dir, "src", "app.ts"), "export const answer = 42;\n".repeat(10));
  writeFileSync(join(dir, ".gitignore"), "data/raw/\ndata/*.html\n");

  // Bulk that git ignores: an anchored directory and a glob-matched file.
  writeFileSync(join(dir, "data", "raw", "harvest.xml"), "<row>x</row>\n".repeat(5000));
  writeFileSync(join(dir, "data", "page.html"), "<p>saved page</p>\n".repeat(5000));
}

test("init: a gitignored directory and glob are excluded from the facts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roi-ignore-"));
  try {
    makeRepoWithIgnoredBulk(dir);
    execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
    execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"],
      { cwd: dir, stdio: "ignore" },
    );

    const res = await runCli(["init", dir]);
    assert.equal(res.status, 0, `init failed: ${res.stderr}`);

    const prepass = JSON.parse(
      readFileSync(join(dir, ".repo-onboarding", "prepass.json"), "utf8"),
    );
    const langs = prepass.stats.languages.map((l) => l.language);

    assert.equal(prepass.primaryLanguage, "TypeScript");
    assert.ok(!langs.includes("XML"), `XML leaked in: ${langs.join(", ")}`);
    assert.ok(!langs.includes("HTML"), `HTML leaked in: ${langs.join(", ")}`);
    assert.ok(
      !prepass.largestFiles.some((f) => f.path.startsWith("data/")),
      "no ignored file reaches largestFiles",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("init: an anchored .gitignore path is honoured without git", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roi-ignore-nogit-"));
  try {
    makeRepoWithIgnoredBulk(dir); // no git init — exercises the parser fallback

    const res = await runCli(["init", dir]);
    assert.equal(res.status, 0, `init failed: ${res.stderr}`);

    const prepass = JSON.parse(
      readFileSync(join(dir, ".repo-onboarding", "prepass.json"), "utf8"),
    );
    const langs = prepass.stats.languages.map((l) => l.language);

    assert.equal(prepass.git.isRepo, false);
    assert.ok(!langs.includes("XML"), `data/raw/ was not pruned: ${langs.join(", ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("init: the tool's own scratch directory is never counted as source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roi-selfcount-"));
  try {
    makeRepoWithIgnoredBulk(dir);

    const first = await runCli(["init", dir]);
    assert.equal(first.status, 0, `first init failed: ${first.stderr}`);
    const second = await runCli(["init", dir]);
    assert.equal(second.status, 0, `second init failed: ${second.stderr}`);

    const prepass = JSON.parse(
      readFileSync(join(dir, ".repo-onboarding", "prepass.json"), "utf8"),
    );
    assert.ok(
      !prepass.largestFiles.some((f) => f.path.startsWith(".repo-onboarding/")),
      "a previous run's output must not appear in the next run's facts",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
