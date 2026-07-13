import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
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
const VALID_TOKEN = "roa_" + "a".repeat(40);

/** @type {import("node:http").Server} */
let server;
let base;
let requests = [];
let nextResponse = { status: 201, body: {} };

before(async () => {
  server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(nextResponse.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(nextResponse.body));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  requests = [];
});

test("upload: valid doc + 201 => posts correctly and prints the returned url", { skip: skipNoSample }, async () => {
  const url = "https://repo-onboarding-tau.vercel.app/r/sample/v/3";
  nextResponse = {
    status: 201,
    body: { id: "abc123", version: 3, repoName: "sample", url },
  };

  const res = await runCli([
    "upload",
    SAMPLE,
    "--api",
    base,
    "--token",
    VALID_TOKEN,
  ]);

  assert.equal(res.status, 0, res.stderr);
  assert.equal(requests.length, 1, "exactly one POST reached the server");

  const r = requests[0];
  assert.equal(r.method, "POST");
  assert.equal(r.url, "/api/v1/analyses");
  assert.equal(r.headers.authorization, `Bearer ${VALID_TOKEN}`);
  assert.match(r.headers["content-type"], /application\/json/);
  assert.equal(r.body, readFileSync(SAMPLE, "utf8"), "raw file text is passed through as the body");

  assert.ok(res.stdout.includes(url), "the returned url is printed");
});

test("upload: 401 => helpful token message, exit 1", { skip: skipNoSample }, async () => {
  nextResponse = { status: 401, body: { error: "invalid or revoked token" } };

  const res = await runCli([
    "upload",
    SAMPLE,
    "--api",
    base,
    "--token",
    VALID_TOKEN,
  ]);

  assert.equal(res.status, 1);
  assert.equal(requests.length, 1);
  assert.match(res.stderr, /token/i);
});

test("upload: 400 with issues => prints the server issues, exit 1", { skip: skipNoSample }, async () => {
  nextResponse = {
    status: 400,
    body: {
      error: "schema validation failed",
      issues: [
        {
          path: "/metadata/repoName",
          message: "must be string",
          keyword: "type",
          expected: "type string",
          got: "undefined",
        },
      ],
    },
  };

  const res = await runCli([
    "upload",
    SAMPLE,
    "--api",
    base,
    "--token",
    VALID_TOKEN,
  ]);

  assert.equal(res.status, 1);
  assert.equal(requests.length, 1);
  assert.match(res.stderr, /metadata\/repoName/);
});

test("upload: invalid local document => refuses to POST (zero requests), exit 1", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roi-up-bad-"));
  try {
    const p = join(dir, "bad.json");
    // Structurally invalid: only schemaVersion present.
    writeFileSync(p, JSON.stringify({ schemaVersion: "1.0.0" }));

    const res = await runCli([
      "upload",
      p,
      "--api",
      base,
      "--token",
      VALID_TOKEN,
    ]);

    assert.equal(res.status, 1);
    assert.equal(requests.length, 0, "no request may reach the server for an invalid document");
    assert.match(res.stderr, /Refusing to upload/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upload: missing token => guidance, exit 2, no request", async () => {
  const res = await runCli(["upload", SAMPLE, "--api", base], {
    unset: ["REPO_ONBOARDING_TOKEN"],
  });
  assert.equal(res.status, 2);
  assert.equal(requests.length, 0);
  assert.match(res.stderr, /token/i);
});

test("upload: malformed token => rejected before any network call (exit 2)", async () => {
  const res = await runCli([
    "upload",
    SAMPLE,
    "--api",
    base,
    "--token",
    "definitely-not-a-token",
  ]);
  assert.equal(res.status, 2);
  assert.equal(requests.length, 0);
});
