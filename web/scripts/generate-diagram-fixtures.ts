/**
 * Regenerates the SVG fixtures the diagram-canvas component tests run against.
 *
 * The canvas derives its model from Mermaid's *rendered output*, so the fixtures
 * have to be real renders — never hand-written. This renders every diagram in
 * every analysis document in this repo, in a real browser, with the same Mermaid
 * configuration `Mermaid.tsx` uses, and writes the SVG it gets back.
 *
 * Run it deliberately after a Mermaid upgrade:
 *
 *     npm run fixtures:diagrams
 *
 * A diagram that fails to render is reported and skipped, not fatal: one
 * architecture section in the express document uses a reserved word of the
 * diagram language as an identifier and has never rendered.
 *
 * The fixtures are a photograph of the pinned Mermaid version, so they cannot
 * notice a library upgrade that breaks the identity contract. That is the job of
 * the browser contract spec, `e2e/diagram-contract.spec.ts` — run it before
 * regenerating these, because it names the row that moved (see docs/adr/0003-*.md).
 */
import { chromium } from "@playwright/test";
import type { Analysis } from "@schema/analysis";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DATA_DIR = join(REPO_ROOT, "data");
const OUT_DIR = fileURLToPath(
  new URL("../src/components/__tests__/fixtures/diagrams", import.meta.url),
);
// The UMD build, so the page can load it with a plain script tag.
const MERMAID_BUNDLE = require.resolve("mermaid/dist/mermaid.min.js");
const MERMAID_VERSION = require("mermaid/package.json").version as string;

interface Diagram {
  name: string;
  type: string;
  source: string;
  /** The Mermaid theme to render under. Light unless a fixture needs otherwise. */
  theme?: "default" | "dark";
}

/**
 * One diagram from a family the canvas has no reader for, so the degradation
 * path can be tested against a real render rather than a doctored one. It is
 * not from an analysis document — no document uses a family we cannot model —
 * but it is rendered by the same browser and the same Mermaid as the rest.
 */
const UNMODELLED_FAMILY: Diagram = {
  name: "unmodelled-family-pie",
  type: "pie",
  source: `pie title Lines by language
  "TypeScript" : 60
  "CSS" : 25
  "Shell" : 15`,
};

/**
 * A sequence diagram drawn with the control structures none of this
 * repository's analysis documents happen to use yet: a participant box, an
 * activation bar, a loop, an alternative and a note. They carry no identity, so
 * the canvas has to recognise them as decoration and dim them with everything
 * else — and only a real render says what Mermaid makes them out of.
 */
const SEQUENCE_CONTROL_STRUCTURES: Diagram = {
  name: "sequence-control-structures",
  type: "sequence",
  source: `sequenceDiagram
  box Web
    participant UI as Browser
    participant API as API server
  end
  participant DB as Database
  UI->>API: GET /orders
  activate API
  Note over UI,API: a session cookie is required
  loop every page
    API->>DB: SELECT ...
    DB-->>API: rows
  end
  alt nothing found
    API-->>UI: 404
  else some found
    API-->>UI: 200 OK
  end
  deactivate API`,
};

/**
 * The diagrams whose dark render is also captured. A theme change re-renders a
 * diagram into different SVG at the same size, and the canvas must not treat
 * that as a new diagram and refit, nor lose the reader's selection — which needs
 * two real renders of one diagram to test, not one fixture handed over twice.
 * One diagram per family that carries a selection, since each is re-derived by a
 * reader of its own.
 */
const THEME_CHANGE_DIAGRAMS = ["fer-mentor-1-er", "sample-2-sequence"];

function collectDiagrams(): Diagram[] {
  const diagrams: Diagram[] = [];
  for (const slug of readdirSync(DATA_DIR).sort()) {
    const path = join(DATA_DIR, slug, "analysis.json");
    let document: Analysis;
    try {
      document = JSON.parse(readFileSync(path, "utf8")) as Analysis;
    } catch {
      continue;
    }
    (document.architecture ?? []).forEach((section, index) => {
      if (!section.diagram) return;
      diagrams.push({
        name: `${slug}-${index}-${section.diagram.type}`,
        type: section.diagram.type,
        source: section.diagram.source,
      });
    });
  }
  for (const name of THEME_CHANGE_DIAGRAMS) {
    const themeChange = diagrams.find((diagram) => diagram.name === name);
    if (!themeChange) {
      throw new Error(`No diagram named ${name} to render in dark`);
    }
    diagrams.push({ ...themeChange, name: `${name}-dark`, theme: "dark" });
  }

  diagrams.push(SEQUENCE_CONTROL_STRUCTURES, UNMODELLED_FAMILY);
  return diagrams;
}

async function main() {
  const diagrams = collectDiagrams();
  if (diagrams.length === 0) throw new Error(`No diagrams found under ${DATA_DIR}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ path: MERMAID_BUNDLE });

  const rendered: { name: string; svg: string }[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const diagram of diagrams) {
    const result = await page.evaluate(
      async ({ name, source, theme }) => {
        // Mirrors Mermaid.tsx, including the render-id shape the canvas strips
        // off element identity. This configuration cannot be imported from the
        // app — it is evaluated inside the page — so it is copied, and a change
        // to Mermaid.tsx's initialize call belongs here too.
        const mermaid = (window as unknown as { mermaid: typeof import("mermaid").default }).mermaid;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        });
        try {
          const { svg } = await mermaid.render(`mmd-${Date.now()}-${name.length}`, source);
          return { svg };
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
      {
        name: diagram.name,
        source: diagram.source,
        theme: diagram.theme ?? ("default" as const),
      },
    );

    if (result.svg) rendered.push({ name: diagram.name, svg: result.svg });
    else failed.push({ name: diagram.name, error: result.error ?? "unknown" });
  }

  await browser.close();

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { name, svg } of rendered) {
    writeFileSync(join(OUT_DIR, `${name}.svg`), `${svg}\n`, "utf8");
  }
  writeFileSync(
    join(OUT_DIR, "README.md"),
    [
      "# Rendered diagram fixtures",
      "",
      "Generated — never edit by hand. Regenerate with `npm run fixtures:diagrams`.",
      "",
      `Rendered by Mermaid ${MERMAID_VERSION} from every diagram in \`data/*/analysis.json\`,`,
      "plus a dark render per selectable family, one sequence diagram drawn with",
      "control structures, and one family the canvas cannot model.",
      "",
      ...rendered.map(({ name }) => `- \`${name}.svg\``),
      ...(failed.length
        ? ["", "Did not render (reported by the generator, skipped):", "", ...failed.map(({ name, error }) => `- \`${name}\` — ${error.split("\n")[0]}`)]
        : []),
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(`Wrote ${rendered.length} fixture(s) to ${OUT_DIR} (mermaid ${MERMAID_VERSION})`);
  for (const { name, error } of failed) {
    console.warn(`  skipped ${name}: ${error.split("\n")[0]}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
