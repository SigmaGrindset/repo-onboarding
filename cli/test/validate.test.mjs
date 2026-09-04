import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli, SAMPLE } from "./helpers.mjs";

const haveSample = existsSync(SAMPLE);
const skipNoSample = haveSample ? false : "data/sample/analysis.json not present";

test("validate: sample document is VALID (exit 0)", { skip: skipNoSample }, async () => {
  const res = await runCli(["validate", SAMPLE]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /VALID/);
});

test("validate --json: sample => { valid: true, issues: [] }", { skip: skipNoSample }, async () => {
  const res = await runCli(["validate", SAMPLE, "--json"]);
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.issues, []);
});

test("validate: broken doc => invalid with edge-integrity + required issues (exit 1)", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  // 1) Drop a required top-level property.
  delete doc.pitch;
  // 2) Dangle a dependency-graph edge.
  doc.dependencyGraph.edges.push({
    from: "___ghost_node___",
    to: doc.dependencyGraph.nodes[0].id,
    relationship: "imports",
  });

  const dir = mkdtempSync(join(tmpdir(), "roi-val-"));
  try {
    const p = join(dir, "broken.json");
    writeFileSync(p, JSON.stringify(doc));

    const res = await runCli(["validate", p, "--json"]);
    assert.equal(res.status, 1);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.valid, false);
    assert.ok(
      parsed.issues.some((i) => i.keyword === "edge-integrity"),
      "an edge-integrity issue is reported",
    );
    assert.ok(
      parsed.issues.some((i) => i.keyword === "required"),
      "the dropped required property is reported",
    );

    // Human mode: prints INVALID to stderr, exit 1.
    const human = await runCli(["validate", p]);
    assert.equal(human.status, 1);
    assert.match(human.stderr, /INVALID/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate: missing file argument => usage error (exit 2)", async () => {
  const res = await runCli(["validate"]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Usage/);
});

test("validate: nonexistent file => IO error (exit 2)", async () => {
  const res = await runCli(["validate", join(tmpdir(), "does-not-exist-xyz.json")]);
  assert.equal(res.status, 2);
});

test("validate: a tech-stack entry with no learning resources => resource-coverage (exit 1)", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  const dropped = doc.learningResources.pop().tech;

  const dir = mkdtempSync(join(tmpdir(), "roi-val-"));
  try {
    const p = join(dir, "gap.json");
    writeFileSync(p, JSON.stringify(doc));

    const res = await runCli(["validate", p, "--json"]);
    assert.equal(res.status, 1);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.valid, false);
    const issue = parsed.issues.find((i) => i.keyword === "resource-coverage");
    assert.ok(issue, "a resource-coverage issue is reported");
    assert.match(issue.message, new RegExp(dropped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate: learning resources for an unknown technology => resource-coverage (exit 1)", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  doc.learningResources.push({
    ...doc.learningResources[0],
    tech: "___not_in_the_stack___",
  });

  const dir = mkdtempSync(join(tmpdir(), "roi-val-"));
  try {
    const p = join(dir, "orphan.json");
    writeFileSync(p, JSON.stringify(doc));

    const res = await runCli(["validate", p, "--json"]);
    assert.equal(res.status, 1);
    const parsed = JSON.parse(res.stdout);
    assert.ok(
      parsed.issues.some(
        (i) => i.keyword === "resource-coverage" && i.got.includes("___not_in_the_stack___"),
      ),
      "the orphaned entry is reported",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate: a resource off the official domain => resource-origin (exit 1)", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  const entry = doc.learningResources.find((e) => e.official && e.resources.length > 0);
  assert.ok(entry, "the sample has an entry with an official URL and resources");
  entry.resources[0].url = "https://some-unrelated-blog.example/post";

  const dir = mkdtempSync(join(tmpdir(), "roi-val-"));
  try {
    const p = join(dir, "offsite.json");
    writeFileSync(p, JSON.stringify(doc));

    const res = await runCli(["validate", p, "--json"]);
    assert.equal(res.status, 1);
    const parsed = JSON.parse(res.stdout);
    assert.ok(
      parsed.issues.some((i) => i.keyword === "resource-origin"),
      "a resource-origin issue is reported",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate: documentation subdomains are accepted under the official domain", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  const entry = doc.learningResources.find((e) => e.official && e.resources.length > 0);
  const host = new URL(entry.official).host.replace(/^www\./, "");
  entry.resources[0].url = `https://docs.${host}/some/page`;

  const dir = mkdtempSync(join(tmpdir(), "roi-val-"));
  try {
    const p = join(dir, "subdomain.json");
    writeFileSync(p, JSON.stringify(doc));

    const res = await runCli(["validate", p, "--json"]);
    assert.equal(res.status, 0, res.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate: a null official entry point with no resources is valid", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  doc.learningResources[0].official = null;
  doc.learningResources[0].resources = [];

  const dir = mkdtempSync(join(tmpdir(), "roi-val-"));
  try {
    const p = join(dir, "internal.json");
    writeFileSync(p, JSON.stringify(doc));

    const res = await runCli(["validate", p, "--json"]);
    assert.equal(res.status, 0, res.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate: a null official entry point may not carry resources", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  const entry = doc.learningResources.find((e) => e.official && e.resources.length > 0);
  entry.official = null;

  const dir = mkdtempSync(join(tmpdir(), "roi-val-"));
  try {
    const p = join(dir, "null-with-resources.json");
    writeFileSync(p, JSON.stringify(doc));

    const res = await runCli(["validate", p, "--json"]);
    assert.equal(res.status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
