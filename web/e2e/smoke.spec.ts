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

test("onboarding journey resumes and persists milestones", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("onboarding-progress-seeded")) return;
    localStorage.setItem("onboarding-progress:v1:sample", JSON.stringify({
      architectureRead: false,
      setupCompleted: false,
      tourFurthest: 4,
      selectedTaskIndex: null,
    }));
    sessionStorage.setItem("onboarding-progress-seeded", "true");
  });

  await page.goto("/analysis/sample");
  await expect(page.getByRole("link", { name: "Continue at step 4" }).first()).toBeVisible();
  await expect(page.getByText("13%", { exact: true }).first()).toBeVisible();

  await page.goto("/analysis/sample/architecture");
  await expect(page.getByRole("heading", { name: "How it is built" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem("onboarding-progress:v1:sample") ?? "{}",
  ).architectureRead)).toBe(true);

  await page.goto("/analysis/sample/setup");
  await page.getByRole("button", { name: "Mark setup complete" }).click();
  await expect(page.getByRole("button", { name: "Mark incomplete" })).toBeVisible();

  await page.goto("/analysis/sample/tasks");
  await page.getByRole("button", { name: "Select this task" }).first().click();
  await expect(page.getByRole("button", { name: "✓ Selected — clear" })).toBeVisible();

  await page.goto("/analysis/sample/tour?step=8");
  await expect(page.getByText("Tour complete", { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem("onboarding-progress:v1:sample") ?? "{}",
  ).tourFurthest)).toBe(8);
  await page.goto("/analysis/sample");
  await expect(page.getByText("100%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("You’re ready to contribute")).toBeVisible();
});

test("contributor guide renders risks and change routes", async ({ page }) => {
  await page.goto("/analysis/sample/guide");
  await expect(page.getByRole("heading", { name: "Known risks and sharp edges" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where should this kind of change go?" })).toBeVisible();
  await expect(page.getByText("Ledger writes and outbox delivery must stay atomic")).toBeVisible();
  await expect(page.getByText("Add an HTTP endpoint")).toBeVisible();
});
