import { expect, test, type Page } from "@playwright/test";

/**
 * The pages the smoke, accessibility and visual suites all walk. One list, three
 * suites, so a section page added here gets all three kinds of coverage at once.
 *
 * Most rows point at `sample`, the demo fixture. `api` cannot: the API Surface
 * section is specialized and `sample` declares none, so the page 404s there by
 * design. It points at `repo-onboarding` — this repository analysed by its own
 * engine — which is the document that carries one.
 */
export const CORE_ROUTES = [
  { slug: "overview", path: "/analysis/sample" },
  { slug: "architecture", path: "/analysis/sample/architecture" },
  { slug: "graph", path: "/analysis/sample/graph" },
  { slug: "map", path: "/analysis/sample/map" },
  { slug: "api", path: "/analysis/repo-onboarding/api" },
  { slug: "guide", path: "/analysis/sample/guide" },
  { slug: "tour", path: "/analysis/sample/tour" },
  { slug: "hotspots", path: "/analysis/sample/hotspots" },
  { slug: "setup", path: "/analysis/sample/setup" },
  { slug: "tasks", path: "/analysis/sample/tasks" },
] as const;

/** Mermaid lays every diagram out in the browser, and this page stacks several. */
const DIAGRAM_TIMEOUT = 20_000;

export async function waitForPageReady(page: Page, path: string) {
  await expect(page.locator("main h1").first()).toBeVisible();
  // The title comes from an async `generateMetadata`, so React can stream the
  // body before the head. The accessibility suite audits the whole document —
  // `<head>` included — so waiting for the h1 alone let it read a title that
  // had not arrived yet, and `document-title` failed on whichever pages lost
  // that race under a fully parallel run. Wait for a non-empty title too.
  await expect(page).toHaveTitle(/\S/);
  if (path.endsWith("/architecture")) {
    // Laying out several diagrams is the slowest thing this suite asks of a
    // browser, and more than one spec asks for this page — so a fully parallel
    // run has several of them laying out at once and each takes far longer than
    // it does alone. Waiting for them can eat most of the default budget before
    // a test body starts, which showed up as an intermittent timeout rather
    // than as a finding. The page is genuinely slow; say so.
    test.slow();
    // Mermaid lays every canvas out in the browser, so waiting for the first to
    // appear leaves the last ones still spinning. Wait until none is still
    // rendering, and allow longer than the default assertion timeout: the suite
    // should go red on a defect rather than on load.
    await expect(page.locator(".diagram-canvas svg").first()).toBeVisible({
      timeout: DIAGRAM_TIMEOUT,
    });
    await expect(
      page.getByRole("status").filter({ hasText: /Rendering diagram/ }),
    ).toHaveCount(0, { timeout: DIAGRAM_TIMEOUT });
  }
  if (path.endsWith("/api")) {
    // The only row on a document other than `sample`, and the largest one in
    // `data/` — roughly twice the size, which every page of it pays for twice
    // over: the server renders the whole document and the accessibility pass
    // then audits the biggest table the suite draws. Alone it takes a few
    // seconds; under a fully parallel local run it has hit the default budget.
    // Same reasoning as the architecture page above.
    test.slow();
  }
  if (path.endsWith("/graph")) {
    // Below `lg` the force-directed canvas starts collapsed behind a
    // disclosure (DependencyGraph.tsx); above it the canvas is always shown
    // and the button is `lg:hidden`. The button stays in the DOM either way,
    // so its visibility — not the viewport width — is what tells the two
    // layouts apart. Open it when present, so the mobile project exercises
    // the same graph the desktop project does instead of skipping it.
    const disclosure = page.locator(
      'button[aria-controls="dependency-graph-visual"]',
    );
    if (await disclosure.isVisible()) {
      await disclosure.click();
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    }
    await expect(page.locator("main svg.touch-none")).toBeVisible();
  }
  await page.evaluate(() => document.fonts.ready);
}

export function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}
