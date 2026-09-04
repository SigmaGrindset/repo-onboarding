import { expect, type Page } from "@playwright/test";

export const CORE_ROUTES = [
  { slug: "overview", path: "/analysis/sample" },
  { slug: "architecture", path: "/analysis/sample/architecture" },
  { slug: "graph", path: "/analysis/sample/graph" },
  { slug: "map", path: "/analysis/sample/map" },
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
  if (path.endsWith("/architecture")) {
    // This page stacks several diagram canvases and Mermaid lays every one of
    // them out in the browser, so waiting for the first to appear leaves the
    // last ones still spinning. Wait until none is still rendering, and allow
    // longer than the default assertion timeout: a parallel run has several of
    // these pages laying out at once, and the suite should go red on a defect
    // rather than on load.
    await expect(page.locator(".diagram-canvas svg").first()).toBeVisible({
      timeout: DIAGRAM_TIMEOUT,
    });
    await expect(
      page.getByRole("status").filter({ hasText: /Rendering diagram/ }),
    ).toHaveCount(0, { timeout: DIAGRAM_TIMEOUT });
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
