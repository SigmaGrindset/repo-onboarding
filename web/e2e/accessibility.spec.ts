import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { CORE_ROUTES, waitForPageReady } from "./helpers";

for (const route of CORE_ROUTES) {
  test(`${route.slug} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route.path);
    await waitForPageReady(page, route.path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const summary = results.violations.flatMap((violation) =>
      violation.nodes.map(
        (node) => `${violation.id}: ${node.target.join(" ")} — ${node.failureSummary}`,
      ),
    );
    expect(summary).toEqual([]);
  });
}
