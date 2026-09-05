import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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

/**
 * The keyboard model of a diagram canvas, in a real browser rather than in
 * jsdom: one tab stop for a whole diagram, a cursor moved with the arrow keys,
 * Enter for the card, Escape to clear and let go.
 *
 * The Architecture page is where this matters, because it stacks several
 * diagrams — a tab stop per element would put dozens of stops between a reader
 * and the rest of the page.
 */
const ARCHITECTURE = "/analysis/sample/architecture";

test("a diagram canvas is reached and read with the keyboard alone", async ({
  page,
}) => {
  await page.goto(ARCHITECTURE);
  await waitForPageReady(page, ARCHITECTURE);

  const canvas = page.locator('[data-diagram-addressable="true"]').first();
  const outline = canvas.getByRole("listbox");
  await expect(outline).toHaveCount(1);

  // Tab through the page until the first stop that is inside a diagram. That
  // stop is the diagram itself: nothing it draws is ever tabbed to.
  const reached = await tabUntilInsideDiagram(page);
  expect(reached).toBe("listbox");
  await expect(outline).toBeFocused();

  // And the whole canvas is that stop plus its toolbar — never its elements,
  // of which this diagram draws ten.
  expect(await countRemainingStopsInCanvas(page)).toBe(4);
  await outline.focus();

  await page.keyboard.press("ArrowDown");
  await expect(outline).toHaveAttribute("aria-activedescendant", /\S/);
  await expect(canvas.locator('[data-diagram-cursor="true"]')).not.toHaveCount(0);

  await page.keyboard.press("ArrowDown");
  const card = canvas.getByRole("region", { name: "Selected element" });
  await expect(card).toHaveCount(0);

  await page.keyboard.press("Enter");
  await expect(card).toBeVisible();

  // A card open over a diagram being read with a cursor is a state the route
  // sweep above never reaches, and it is the one this feature added.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(canvas.locator('[data-diagram-cursor="true"]')).toHaveCount(0);
  // Released, so the reader is never held inside a widget that answers to the
  // arrow keys.
  await expect(outline).not.toBeFocused();
});

/** A canvas whose diagram the viewer could model, which is where a cursor lives. */
const CANVAS = '[data-diagram-addressable="true"]';

/** What the keyboard first lands on inside the first such canvas on the page. */
async function tabUntilInsideDiagram(page: Page) {
  for (let press = 0; press < 100; press += 1) {
    await page.keyboard.press("Tab");
    const role = await page.evaluate((selector) => {
      const canvas = document.querySelector(selector);
      const active = document.activeElement;
      if (!canvas || !active || !canvas.contains(active)) return null;
      return active.getAttribute("role") ?? active.tagName.toLowerCase();
    }, CANVAS);
    if (role) return role;
  }
  throw new Error("tabbing never reached a diagram");
}

/** How many more stops that canvas has after the one the keyboard is on. */
async function countRemainingStopsInCanvas(page: Page) {
  let stops = 0;
  for (let press = 0; press < 20; press += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate((selector) => {
      const canvas = document.querySelector(selector);
      const active = document.activeElement;
      return Boolean(canvas && active && canvas.contains(active));
    }, CANVAS);
    if (!inside) return stops;
    stops += 1;
  }
  throw new Error("this canvas never let the keyboard out");
}
