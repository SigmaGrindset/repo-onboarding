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

export async function waitForPageReady(page: Page, path: string) {
  await expect(page.locator("main h1").first()).toBeVisible();
  if (path.endsWith("/architecture")) {
    await expect(page.locator(".mermaid-host svg").first()).toBeVisible();
  }
  if (path.endsWith("/graph")) {
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
