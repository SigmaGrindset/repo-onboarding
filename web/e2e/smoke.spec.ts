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
