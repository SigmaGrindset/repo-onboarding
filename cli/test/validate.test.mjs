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

// --- Design system: the substance floor --------------------------------------
//
// Also SPECIALIZED, and the floor is the whole enforcement: unlike the API
// surface there is no join by name here, so nothing but the schema stands
// between an over-eager analysis engine and a Design System tab on a repository
// with a handful of styles. See docs/adr/0005-design-system-judgement-not-inventory.md.

/** Four real primitives: the fourth-Button number, and the minimum. */
const PRIMITIVES = [
  {
    name: "Button",
    file: "src/ui/button.tsx",
    use: "Every clickable action in the product, in three variants.",
  },
  {
    name: "Card",
    file: "src/ui/card.tsx",
    use: "The surface every top-level block on a page sits on.",
  },
  {
    name: "Field",
    file: "src/ui/field.tsx",
    use: "A labelled input with its error message and hint text.",
  },
  {
    name: "Stack",
    file: "src/ui/stack.tsx",
    use: "Vertical rhythm between blocks, so margins are never hand-set.",
  },
];

/** One token group: the minimum, and a sample rather than an inventory. */
const TOKENS = [
  {
    name: "Colour",
    file: "src/styles/tokens.css",
    usage: "Referenced as var(--surface-2) in CSS and as bg-surface-2 in markup.",
    examples: ["--surface", "--surface-2", "--text", "--accent"],
  },
];

const REUSE_RULE = {
  reuseWhen:
    "Search src/ui before writing anything: if a primitive renders the shape you need, extend its props rather than forking it.",
  createWhen:
    "Write a new primitive only when three screens already need the same shape and no existing one can express it with a prop.",
  newPrimitiveHome: "src/ui/",
};

/** A design system that clears every floor — the baseline the cases mutate. */
function designSystem() {
  return {
    approach:
      "One stylesheet of custom properties, consumed through utility classes; nothing writes a colour literal in a component.",
    tokens: TOKENS.map((t) => ({ ...t, examples: [...t.examples] })),
    primitives: PRIMITIVES.map((p) => ({ ...p })),
    reuseRule: { ...REUSE_RULE },
  };
}

test("validate: a document with no designSystem is valid", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  assert.equal(doc.designSystem, undefined, "the sample carries no design system");
  const res = await runCli(["validate", SAMPLE, "--json"]);
  assert.equal(res.status, 0, res.stdout);
});

test("validate: four primitives, one token group, an approach and a rule clear the floor", { skip: skipNoSample }, async () => {
  const { res } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
  }, "design-ok");
  assert.equal(res.status, 0, res.stdout);
});

test("validate: fewer than four primitives is not a design system", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.primitives = PRIMITIVES.slice(0, 3);
  }, "design-thin");
  assert.equal(res.status, 1);
  const issue = parsed.issues.find((i) => i.path === "/designSystem/primitives");
  assert.ok(issue, `no issue at /designSystem/primitives: ${res.stdout}`);
  assert.equal(issue.keyword, "minItems");
  assert.equal(issue.expected, "at least 4 item(s)");
});

test("validate: a design system with no token group is rejected", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.tokens = [];
  }, "design-no-tokens");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/designSystem/tokens" && i.keyword === "minItems",
    ),
    res.stdout,
  );
});

for (const key of ["approach", "tokens", "primitives", "reuseRule"]) {
  test(`validate: a design system without ${key} answers a different question`, { skip: skipNoSample }, async () => {
    const { res, parsed } = await validateMutated((doc) => {
      doc.designSystem = designSystem();
      delete doc.designSystem[key];
    }, `design-no-${key}`);
    assert.equal(res.status, 1);
    const issue = parsed.issues.find(
      (i) => i.path === "/designSystem" && i.expected === `property "${key}"`,
    );
    assert.ok(issue, res.stdout);
    assert.equal(issue.keyword, "required");
  });
}

for (const half of ["reuseWhen", "createWhen"]) {
  test(`validate: the reuse rule must carry ${half}`, { skip: skipNoSample }, async () => {
    // Both halves are required for the same reason: asked for one rule, an
    // engine writes the platitude and drops the test a newcomer needs.
    const { res, parsed } = await validateMutated((doc) => {
      doc.designSystem = designSystem();
      delete doc.designSystem.reuseRule[half];
    }, `design-rule-no-${half}`);
    assert.equal(res.status, 1);
    assert.ok(
      parsed.issues.some(
        (i) =>
          i.path === "/designSystem/reuseRule" &&
          i.keyword === "required" &&
          i.expected === `property "${half}"`,
      ),
      res.stdout,
    );
  });

  test(`validate: a platitude in ${half} is rejected`, { skip: skipNoSample }, async () => {
    const { res, parsed } = await validateMutated((doc) => {
      doc.designSystem = designSystem();
      doc.designSystem.reuseRule[half] = "Reuse a component where one fits.";
    }, `design-rule-thin-${half}`);
    assert.equal(res.status, 1);
    assert.ok(
      parsed.issues.some(
        (i) =>
          i.path === `/designSystem/reuseRule/${half}` && i.keyword === "minLength",
      ),
      res.stdout,
    );
  });
}

test("validate: a genuinely new primitive needs somewhere to go", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    delete doc.designSystem.reuseRule.newPrimitiveHome;
  }, "design-rule-no-home");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/designSystem/reuseRule" &&
        i.expected === 'property "newPrimitiveHome"',
    ),
    res.stdout,
  );
});

test("validate: naming the styling library is not an approach", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.approach = "Tailwind CSS.";
  }, "design-thin-approach");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/designSystem/approach" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: a primitive must say what a reader reaches for it for", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.primitives[1].use = "A card.";
  }, "design-thin-use");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/designSystem/primitives/1/use" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: two primitives of the same name are two entries, not an error", { skip: skipNoSample }, async () => {
  // The rejected uniqueness rule, asserted as a permission: two components
  // called Button in two files is a true statement about a repository, and
  // precisely the one a reader most needs — see the Primitive entry in
  // CONTEXT.md, which the schema description restates.
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.primitives.push({
      name: "Button",
      file: "src/legacy/Button.tsx",
      use: "The pre-redesign button, still rendered on the billing screens.",
    });
  }, "design-duplicate-primitive");
  assert.equal(res.status, 0, res.stdout);
  assert.deepEqual(parsed.issues, []);
});

test("validate: a token group samples rather than enumerates", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.tokens[0].examples = Array.from(
      { length: 9 },
      (_, i) => `--surface-${i}`,
    );
  }, "design-token-inventory");
  assert.equal(res.status, 1);
  const issue = parsed.issues.find(
    (i) => i.path === "/designSystem/tokens/0/examples",
  );
  assert.ok(issue, res.stdout);
  assert.equal(issue.keyword, "maxItems");
});

test("validate: one example is not a sample", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.tokens[0].examples = ["--surface"];
  }, "design-token-single");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/designSystem/tokens/0/examples" && i.keyword === "minItems",
    ),
    res.stdout,
  );
});

test("validate: a token group must say how a value is referenced here", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.tokens[0].usage = "CSS variables.";
  }, "design-token-thin-usage");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/designSystem/tokens/0/usage" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: a stray property on a primitive is rejected", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.primitives[0].variants = ["primary", "ghost"];
  }, "design-stray-key");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/designSystem/primitives/0" &&
        i.keyword === "additionalProperties",
    ),
    res.stdout,
  );
});

test("validate: a token group carries names, and has nowhere to put a value", { skip: skipNoSample }, async () => {
  // Values rot invisibly — a swatch is still a swatch when it is the wrong
  // blue — so the schema gives them no home rather than trusting the prompt.
  const { res, parsed } = await validateMutated((doc) => {
    doc.designSystem = designSystem();
    doc.designSystem.tokens[0].values = { "--surface": "#ffffff" };
  }, "design-token-values");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/designSystem/tokens/0" &&
        i.keyword === "additionalProperties",
    ),
    res.stdout,
  );
});

// --- Delivery: the substance floor, and the boundary the schema enforces -----
//
// Also SPECIALIZED, and here the schema is doing two jobs at once. The floor is
// the usual one — nothing but this stands between an over-eager engine and a
// Delivery tab on a repository with a lint job and nothing else. The SHAPE is
// the other: there is no field for a dashboard, a log, a rollback or an on-call
// rota, every entry is anchored to a committed file or directory, and
// `additionalProperties: false` means an engine cannot add one. That is the
// half of the boundary a prompt cannot guarantee. See
// docs/adr/0006-delivery-stops-at-what-is-committed.md.

/** One gate: the minimum, and a check a change must actually pass. */
const GATES = [
  {
    name: "test",
    file: ".github/workflows/ci.yml",
    checks:
      "Runs the unit suite against the pull request; one failing assertion fails the job.",
    runLocally: "npm test",
  },
];

/** A delivery section that clears every floor — the baseline the cases mutate. */
function delivery() {
  return {
    pipeline:
      "A push opens a pull request, the CI workflow runs the gates below against it, and merging to main hands the commit to the host, which builds and serves it.",
    build: {
      produces: "A standalone server bundle the host runs directly.",
      file: "package.json",
      command: "npm run build",
    },
    gates: GATES.map((g) => ({ ...g })),
  };
}

test("validate: a document with no delivery is valid", { skip: skipNoSample }, async () => {
  const doc = JSON.parse(readFileSync(SAMPLE, "utf8"));
  assert.equal(doc.delivery, undefined, "the sample carries no delivery section");
  const res = await runCli(["validate", SAMPLE, "--json"]);
  assert.equal(res.status, 0, res.stdout);
});

test("validate: a pipeline, a build and one gate clear the floor", { skip: skipNoSample }, async () => {
  const { res } = await validateMutated((doc) => {
    doc.delivery = delivery();
  }, "delivery-ok");
  assert.equal(res.status, 0, res.stdout);
});

test("validate: a delivery section with no gate is rejected", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    doc.delivery.gates = [];
  }, "delivery-no-gates");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/delivery/gates" && i.keyword === "minItems",
    ),
    res.stdout,
  );
});

for (const key of ["pipeline", "build", "gates"]) {
  test(`validate: a delivery section without ${key} is rejected`, { skip: skipNoSample }, async () => {
    const { res, parsed } = await validateMutated((doc) => {
      doc.delivery = delivery();
      delete doc.delivery[key];
    }, `delivery-no-${key}`);
    assert.equal(res.status, 1);
    assert.ok(
      parsed.issues.some(
        (i) => i.path === "/delivery" && i.expected === `property "${key}"`,
      ),
      res.stdout,
    );
  });
}

test("validate: naming the CI provider is not a pipeline", { skip: skipNoSample }, async () => {
  // No file states the end-to-end story, which is why the field is required and
  // why it is the one an engine is most likely to answer with a label.
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    doc.delivery.pipeline = "GitHub Actions, then Vercel.";
  }, "delivery-thin-pipeline");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/delivery/pipeline" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: a build must say what a deploy actually runs", { skip: skipNoSample }, async () => {
  // A Dockerfile does not say what the thing it builds IS, which is the whole
  // judgement this field exists for.
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    doc.delivery.build.produces = "A bundle.";
  }, "delivery-thin-build");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/delivery/build/produces" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: a build must name the committed file that defines it", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    delete doc.delivery.build.file;
  }, "delivery-build-no-file");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/delivery/build" && i.expected === 'property "file"',
    ),
    res.stdout,
  );
});

test("validate: a gate must say what it checks", { skip: skipNoSample }, async () => {
  // A job called `web` says nothing, and that gap is why the field exists.
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    doc.delivery.gates[0].checks = "Runs CI.";
  }, "delivery-thin-gate");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/delivery/gates/0/checks" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: a gate must name the file defining it", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    delete doc.delivery.gates[0].file;
  }, "delivery-gate-no-file");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) => i.path === "/delivery/gates/0" && i.expected === 'property "file"',
    ),
    res.stdout,
  );
});

test("validate: a gate need not be runnable locally", { skip: skipNoSample }, async () => {
  // Optional because it is a `run:` line an engine reads off the file, not a
  // judgement it has to make — required here tracks judgement, not importance.
  const { res } = await validateMutated((doc) => {
    doc.delivery = delivery();
    delete doc.delivery.gates[0].runLocally;
  }, "delivery-gate-no-local");
  assert.equal(res.status, 0, res.stdout);
});

test("validate: an environment cannot be claimed without the file that says so", { skip: skipNoSample }, async () => {
  // The boundary in its operative form: a branch-to-environment mapping that
  // lives in a hosting dashboard cannot be cited, so it cannot be claimed.
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    doc.delivery.environments = [{ name: "production", deployedFrom: "main" }];
  }, "delivery-env-no-file");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/delivery/environments/0" && i.expected === 'property "file"',
    ),
    res.stdout,
  );
});

test("validate: a repository with no committed environment mapping omits the key", { skip: skipNoSample }, async () => {
  const { res } = await validateMutated((doc) => {
    doc.delivery = delivery();
    assert.equal(doc.delivery.environments, undefined);
  }, "delivery-no-envs");
  assert.equal(res.status, 0, res.stdout);
});

test("validate: migrations must say what applies them, and when", { skip: skipNoSample }, async () => {
  // "Nothing does — a person runs the command by hand" is the answer the field
  // exists for, and it is a sentence rather than a word.
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    doc.delivery.migrations = { directory: "db/migrate/", appliedBy: "By hand." };
  }, "delivery-thin-migrations");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/delivery/migrations/appliedBy" && i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: a deploy variable must say what it is needed for", { skip: skipNoSample }, async () => {
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    doc.delivery.deployVariables = [
      { name: "DATABASE_URL", purpose: "The database.", file: ".env.example" },
    ];
  }, "delivery-thin-variable");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/delivery/deployVariables/0/purpose" &&
        i.keyword === "minLength",
    ),
    res.stdout,
  );
});

test("validate: a deploy variable carries a name, and has nowhere to put a value", { skip: skipNoSample }, async () => {
  // Disclosure rather than staleness: an analysis document is shared, exported
  // and fed to a chat model, and a value beside a database URL is a leak. There
  // is no exception for a placeholder that looks fake, because the schema has
  // no property to hold either.
  const { res, parsed } = await validateMutated((doc) => {
    doc.delivery = delivery();
    doc.delivery.deployVariables = [
      {
        name: "DATABASE_URL",
        purpose: "The Postgres connection the app reads and writes analyses through.",
        file: "web/.env.example",
        value: "postgres://user:hunter2@db.example.com/app",
      },
    ];
  }, "delivery-variable-value");
  assert.equal(res.status, 1);
  assert.ok(
    parsed.issues.some(
      (i) =>
        i.path === "/delivery/deployVariables/0" &&
        i.keyword === "additionalProperties",
    ),
    res.stdout,
  );
});

test("validate: the operational half has nowhere to go", { skip: skipNoSample }, async () => {
  // The load-bearing half of ADR 0006. A prompt can be ignored between model
  // versions; a schema with no field for a dashboard, a log query, a rollback
  // procedure or an on-call rota cannot be. Each is rejected as a stray
  // property on the section itself.
  for (const key of ["dashboards", "logs", "rollback", "onCall", "operations"]) {
    const { res, parsed } = await validateMutated((doc) => {
      doc.delivery = delivery();
      doc.delivery[key] = "Grafana, in the shared workspace.";
    }, `delivery-operational-${key}`);
    assert.equal(res.status, 1, `${key} was accepted`);
    assert.ok(
      parsed.issues.some(
        (i) => i.path === "/delivery" && i.keyword === "additionalProperties",
      ),
      `${key}: ${res.stdout}`,
    );
  }
});
