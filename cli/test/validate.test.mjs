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

// --- API surface: the substance floor ---------------------------------------
//
// The section is SPECIALIZED — a repository without an API omits the key
// entirely. The floors below are what stop an over-eager analysis engine from
// emitting the section for a repository that has nothing to put in it.

/** Three real routes: the minimum an API surface can be. */
const ROUTES = [
  { method: "GET", path: "/health", file: "src/health.ts", actor: "public" },
  { method: "POST", path: "/items", file: "src/items.ts", actor: "signed-in reader" },
  { method: "DELETE", path: "/items/:id", file: "src/items.ts", actor: "item owner" },
];

/**
 * Validate a mutated copy of the sample document, returning the parsed
 * `--json` result. Keeps every case below to its own single mutation.
 */
async function validateMutated(mutate, name) {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  mutate(doc);
  const dir = mkdtempSync(join(tmpdir(), "roi-val-"));
  try {
    const p = join(dir, `${name}.json`);
    writeFileSync(p, JSON.stringify(doc));
    const res = await runCli(["validate", p, "--json"]);
    return { res, parsed: JSON.parse(res.stdout) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("validate: a document with no apiSurface is valid", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  assert.equal(doc.apiSurface, undefined, "the sample carries no API surface");
  const res = await runCli(["validate", SAMPLE, "--json"]);
  assert.equal(res.status, 0, res.stdout);
});

test("validate: three real routes clear the substance floor", { skip: skipNoSample }, async () => {
  const { res } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES };
  }, "api-ok");
  assert.equal(res.status, 0, res.stdout);
});

test("validate: fewer than three routes is not an API surface", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES.slice(0, 2) };
  }, "api-thin");
  assert.equal(res.status, 1);
  const issue = parsed.issues.find((i) => i.path === "/apiSurface/routes");
  assert.ok(issue, `no issue at /apiSurface/routes: ${res.stdout}`);
  assert.equal(issue.keyword, "minItems");
  assert.equal(issue.expected, "at least 3 item(s)");
});

test("validate: an empty API surface is rejected rather than shipped as a hollow tab", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: [] };
  }, "api-empty");
  assert.equal(res.status, 1);
  assert.ok(parsed.issues.some((i) => i.path === "/apiSurface/routes" && i.keyword === "minItems"));
});

test("validate: a route must name the actor permitted to call it", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES.map((r) => ({ ...r })) };
    delete doc.apiSurface.routes[1].actor;
  }, "api-no-actor");
  assert.equal(res.status, 1);
  const issue = parsed.issues.find(
    (i) => i.path === "/apiSurface/routes/1" && i.keyword === "required",
  );
  assert.ok(issue, `no required issue for the missing actor: ${res.stdout}`);
  assert.equal(issue.expected, 'property "actor"');
});

test("validate: a route must name the file implementing it", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES.map((r) => ({ ...r })) };
    doc.apiSurface.routes[0].file = "";
  }, "api-no-file");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/apiSurface/routes/0/file" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: a method outside the enum is rejected", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES.map((r) => ({ ...r })) };
    doc.apiSurface.routes[0].method = "get";
  }, "api-bad-method");
  assert.equal(res.status, 1);
  const issue = parsed.issues.find(
    (i) => i.path === "/apiSurface/routes/0/method" && i.keyword === "enum",
  );
  assert.ok(issue, res.stdout);
  assert.equal(issue.got, '"get"');
});

test("validate: a path must be a path a caller could address", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES.map((r) => ({ ...r })) };
    doc.apiSurface.routes[0].path = "health";
  }, "api-bad-path");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/apiSurface/routes/0/path" && i.keyword === "pattern",
    ),
    res.stdout,
  );
});

test("validate: a route note must be substantive when present", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES.map((r) => ({ ...r })) };
    doc.apiSurface.routes[0].note = "reads stuff";
  }, "api-thin-note");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/apiSurface/routes/0/note" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: most routes carry no note at all", { skip: skipNoSample }, async () => {
  const { res } = await validateMutated((doc) => {
    doc.apiSurface = {
      routes: ROUTES.map((r) => ({ ...r })),
    };
    doc.apiSurface.routes[0].note =
      "The only unauthenticated route, and the one the load balancer polls, so it must stay free of database work.";
  }, "api-one-note");
  assert.equal(res.status, 0, res.stdout);
});

test("validate: a stray property on a route is rejected", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES.map((r) => ({ ...r })) };
    doc.apiSurface.routes[2].rateLimit = "10/min";
  }, "api-stray-key");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/apiSurface/routes/2" && i.keyword === "additionalProperties",
    ),
    res.stdout,
  );
});

// --- API surface: the actor coverage join ------------------------------------
//
// `actors` is optional within the section, but a document that carries one is
// making a claim about its own routes — so the claim is checked rather than
// trusted, the same shape as the learning-resource coverage rule above and for
// the reason recorded in ADR 0001. The join has four outcomes, and each has a
// test below: described and used (valid), described and unused, used and
// undescribed, and neither (nothing to say either way).

/** One entry per distinct actor in ROUTES — the fully covered case. */
const ACTORS = [
  {
    name: "public",
    summary: "Anyone on the internet, with no account and no token — reads only.",
  },
  {
    name: "signed-in reader",
    summary: "A caller with an account of their own, who may create new items.",
  },
  {
    name: "item owner",
    summary: "The signed-in caller who created an item, and the only one who may delete it.",
  },
];

test("validate: an actor described and required by a route is valid", { skip: skipNoSample }, async () => {
  const { res } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES, actors: ACTORS };
  }, "api-actors-ok");
  assert.equal(res.status, 0, res.stdout);
});

test("validate: actors are optional — routes alone remain valid", { skip: skipNoSample }, async () => {
  const { res } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES };
  }, "api-actors-absent");
  assert.equal(res.status, 0, res.stdout);
});

test("validate: an actor no route requires => actor-coverage (exit 1)", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = {
      routes: ROUTES,
      actors: [
        ...ACTORS,
        {
          name: "___nobody_calls_this___",
          summary: "An actor the route list never requires, which is the failure.",
        },
      ],
    };
  }, "api-actor-orphan");
  assert.equal(res.status, 1);
  const issue = parsed.issues.find((i) => i.keyword === "actor-coverage");
  assert.ok(issue, `no actor-coverage issue: ${res.stdout}`);
  assert.equal(issue.path, "/apiSurface/actors/3/name");
  assert.ok(issue.got.includes("___nobody_calls_this___"), issue.got);
  // The same structured shape as the learning-resource coverage rule.
  assert.ok(issue.message.length > 0);
  assert.ok(issue.expected.length > 0);
});

test("validate: a route requiring an undescribed actor => actor-coverage (exit 1)", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES, actors: ACTORS.slice(0, 2) };
  }, "api-actor-gap");
  assert.equal(res.status, 1);
  const issue = parsed.issues.find((i) => i.keyword === "actor-coverage");
  assert.ok(issue, `no actor-coverage issue: ${res.stdout}`);
  assert.equal(issue.path, "/apiSurface/actors");
  assert.match(issue.message, /item owner/);
  // Names the route that requires it, so the gap is locatable from the message.
  assert.match(issue.message, /DELETE \/items\/:id/);
  assert.ok(issue.expected.length > 0);
  assert.equal(issue.got, "undefined");
});

test("validate: an actor neither described nor required is not an issue", { skip: skipNoSample }, async () => {
  // The fourth cell of the join. Renaming an actor on both sides at once leaves
  // the old name undescribed AND unrequired — and that has to be silent, or the
  // rule would be reporting on names it has no reason to know about.
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = {
      routes: ROUTES.map((r) =>
        r.actor === "item owner" ? { ...r, actor: "item author" } : { ...r },
      ),
      actors: ACTORS.map((a) =>
        a.name === "item owner" ? { ...a, name: "item author" } : { ...a },
      ),
    };
  }, "api-actor-renamed");
  assert.equal(res.status, 0, res.stdout);
  assert.deepEqual(parsed.issues, []);
  // Silence about the retired name specifically is what separates this cell
  // from "described and used", which is silent too.
  assert.ok(
    !res.stdout.includes("item owner"),
    `the validator reported on a name in neither list: ${res.stdout}`,
  );
});

test("validate: the same actor described twice => actor-coverage (exit 1)", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES, actors: [...ACTORS, { ...ACTORS[0] }] };
  }, "api-actor-duplicate");
  assert.equal(res.status, 1);
  const issue = parsed.issues.find((i) => i.keyword === "actor-coverage");
  assert.ok(issue, `no actor-coverage issue: ${res.stdout}`);
  assert.equal(issue.path, "/apiSurface/actors/3/name");
  assert.match(issue.message, /duplicate/);
});

test("validate: an actor summary must say what the actor can do", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = {
      routes: ROUTES,
      actors: ACTORS.map((a, i) => (i === 0 ? { ...a, summary: "reads" } : a)),
    };
  }, "api-actor-thin-summary");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/apiSurface/actors/0/summary" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: an empty actor list is rejected rather than shipped as a hollow claim", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = { routes: ROUTES, actors: [] };
  }, "api-actors-empty");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/apiSurface/actors" && i.keyword === "minItems",
    ),
    res.stdout,
  );
});

test("validate: an actor must carry a summary", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = {
      routes: ROUTES,
      actors: ACTORS.map((a, i) => (i === 1 ? { name: a.name } : a)),
    };
  }, "api-actor-no-summary");
  assert.equal(res.status, 1);
  const issue = parsed.issues.find(
    (i) => i.path === "/apiSurface/actors/1" && i.keyword === "required",
  );
  assert.ok(issue, res.stdout);
  assert.equal(issue.expected, 'property "summary"');
});

test("validate: a stray property on an actor is rejected", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.apiSurface = {
      routes: ROUTES,
      actors: ACTORS.map((a, i) => (i === 2 ? { ...a, scope: "admin" } : a)),
    };
  }, "api-actor-stray-key");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/apiSurface/actors/2" && i.keyword === "additionalProperties",
    ),
    res.stdout,
  );
});

test("validate: the actor join is offline and deterministic (ADR 0002)", { skip: skipNoSample }, async () => {
  // In-process on purpose: the promise is about the check itself, so the test
  // takes the network away from it and runs it twice on the same document.
  const { validateAnalysisDocument } = await import("../vendor/validate-core.mjs");
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  doc.apiSurface = {
    routes: ROUTES,
    actors: [
      ...ACTORS.slice(0, 2),
      {
        name: "___nobody_calls_this___",
        summary: "An actor the route list never requires, which is the failure.",
      },
    ],
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("the validator must not reach the network");
  };
  try {
    const first = validateAnalysisDocument(doc, { crossRefs: true });
    const second = validateAnalysisDocument(JSON.parse(JSON.stringify(doc)), {
      crossRefs: true,
    });
    assert.deepEqual(first, second, "two runs of the same document disagree");
    const coverage = first.issues.filter((i) => i.keyword === "actor-coverage");
    // Both directions of the broken join, reported without a single request.
    assert.equal(coverage.length, 2, JSON.stringify(first.issues, null, 2));
  } finally {
    globalThis.fetch = realFetch;
  }
});
