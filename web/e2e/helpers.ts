import { expect, test, type Page } from "@playwright/test";

/**
 * The pages the smoke, accessibility and visual suites all walk. One list, three
 * suites, so a section page added here gets all three kinds of coverage at once.
 *
 * Most rows point at `sample`, the demo fixture. `api` and `design` cannot: both
 * sections are specialized and `sample` declares neither, so those pages 404
 * there by design. They point at `repo-onboarding` — this repository analysed by
 * its own engine — which is the document that carries both.
 */
export const CORE_ROUTES = [
  { slug: "overview", path: "/analysis/sample" },
  { slug: "architecture", path: "/analysis/sample/architecture" },
  { slug: "graph", path: "/analysis/sample/graph" },
  { slug: "map", path: "/analysis/sample/map" },
  { slug: "api", path: "/analysis/repo-onboarding/api" },
  { slug: "design", path: "/analysis/repo-onboarding/design" },
  { slug: "guide", path: "/analysis/sample/guide" },
  { slug: "tour", path: "/analysis/sample/tour" },
  { slug: "hotspots", path: "/analysis/sample/hotspots" },
  { slug: "setup", path: "/analysis/sample/setup" },
  { slug: "tasks", path: "/analysis/sample/tasks" },
] as const;

/** Mermaid lays every diagram out in the browser, and this page stacks several. */
const DIAGRAM_TIMEOUT = 20_000;

/**
 * Navigating INTO a `repo-onboarding` page — from the palette, say — server-
 * renders the largest document in `data/` before anything of the new page
 * appears. Alone that is a second or two; under a fully parallel run it crosses
 * the default 5s assertion budget, which shows up as a flake rather than as a
 * finding. `test.slow()` does not help: it raises the TEST timeout and leaves
 * each assertion on its own. So a first assertion after such a navigation says
 * how long the page is allowed to take, and the suite still goes red on a
 * defect rather than on load.
 */
export const LARGE_DOCUMENT_TIMEOUT = 20_000;

/**
 * The document title is in `<head>`, and was there in the first flush.
 *
 * Not a given: Next.js streams metadata by default, which appends the `<title>`
 * to the `<body>` ~50KB in and lets React hoist it into `<head>` on a client
 * re-render. That hoist is a removal and an insertion, not always in one tick,
 * so the tour page spent up to ~300ms with no title at all and axe failed
 * `document-title` on whichever page happened to be audited inside that gap.
 * `next.config.ts` opts out of streaming metadata for exactly this reason.
 *
 * So this is a guard, not a wait: it passes on the first poll. If it ever
 * starts timing out on every page, the opt-out has been dropped.
 */
async function expectTitleInHead(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.head.querySelector("title")?.textContent?.trim() ?? "",
        ),
      { message: "no <title> in <head> — has next.config.ts stopped opting out of streaming metadata?" },
    )
    .not.toBe("");
}

export async function waitForPageReady(page: Page, path: string) {
  await expect(page.locator("main h1").first()).toBeVisible();
  await expectTitleInHead(page);
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
  if (path.startsWith("/analysis/repo-onboarding")) {
    // The largest document in `data/` — roughly twice the size of the others,
    // and every page of it pays that twice over: the server renders the whole
    // document, and the accessibility pass then audits the result. Alone each
    // page takes a few seconds; under a fully parallel local run they have hit
    // the default budget. Same reasoning as the architecture page above.
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
