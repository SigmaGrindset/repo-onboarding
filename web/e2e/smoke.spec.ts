import { expect, test } from "@playwright/test";
import { collectBrowserErrors, CORE_ROUTES, waitForPageReady } from "./helpers";

test("home lists local analysis fixtures", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Repo Onboarding", exact: true })).toBeVisible();
  await expect(page.locator('a[href="/analysis/sample"]')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const route of CORE_ROUTES) {
  test(`${route.slug} analysis page renders`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const response = await page.goto(route.path);
    expect(response?.ok()).toBeTruthy();
    await waitForPageReady(page, route.path);
    expect(errors).toEqual([]);
  });
}

test("mobile section nav reveals a late active tab", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile navigation behavior only");

  const path = "/analysis/sample/tasks";
  await page.goto(path);
  await waitForPageReady(page, path);

  const nav = page.getByRole("navigation", { name: "Analysis sections" });
  const activeLink = nav.locator('[aria-current="page"]');
  await expect(activeLink).toHaveText("First Tasks");
  await expect
    .poll(async () => {
      const navBox = await nav.boundingBox();
      const linkBox = await activeLink.boundingBox();
      if (!navBox || !linkBox) return false;
      return (
        linkBox.x >= navBox.x &&
        linkBox.x + linkBox.width <= navBox.x + navBox.width
      );
    })
    .toBe(true);

  await expect(page.locator('[data-scroll-edge="left"]')).toHaveAttribute(
    "data-visible",
    "true",
  );
});
