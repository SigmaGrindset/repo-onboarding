import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Analysis } from "@schema/analysis";
import {
  collectBrowserErrors,
  CORE_ROUTES,
  LARGE_DOCUMENT_TIMEOUT,
  waitForPageReady,
} from "./helpers";

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

test("the command palette finds a route by its path", async ({ page }) => {
  // The reader-level assertion behind "a route is findable by its path". The
  // index building an entry is not enough: the palette renders group by group,
  // so an entry in a group the palette does not iterate is built and then
  // silently dropped — which is exactly what happened when the group order and
  // the group union were two lists instead of one.
  const path = "/analysis/repo-onboarding";
  await page.goto(path);
  await waitForPageReady(page, path);

  await page.getByRole("button", { name: /Search analysis/ }).click();
  const dialog = page.getByRole("dialog", { name: "Search this analysis" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("textbox", { name: "Search this analysis" }).fill("/api/v1");
  const hit = dialog.getByRole("button", { name: /POST \/api\/v1\/analyses/ });
  await expect(hit).toBeVisible();
  await expect(dialog.getByText("API Surface", { exact: true })).toBeVisible();

  await hit.click();
  await expect(page).toHaveURL(/\/analysis\/repo-onboarding\/api\?route=/);
  await expect(
    page.getByRole("heading", { name: "What this repository exposes" }),
  ).toBeVisible({ timeout: LARGE_DOCUMENT_TIMEOUT });
});

test("the API surface says what each actor can do", async ({ page }) => {
  // Read from the document rather than restated here: the promise is that the
  // permission model is on the page as a handful of lines, not that this
  // fixture happens to word an actor a particular way.
  // Resolved from the project's own testDir, so the run works from wherever it
  // was started — the same way the diagram contract spec locates a file.
  const file = join(
    test.info().project.testDir,
    "..",
    "..",
    "data",
    "repo-onboarding",
    "analysis.json",
  );
  const doc = JSON.parse(readFileSync(file, "utf8")) as Analysis;
  const actors = doc.apiSurface?.actors ?? [];
  expect(actors.length).toBeGreaterThan(0);

  const path = "/analysis/repo-onboarding/api";
  await page.goto(path);
  await waitForPageReady(page, path);

  await expect(page.getByRole("heading", { name: "Actors" })).toBeVisible();
  for (const actor of actors) {
    await expect(page.getByText(actor.summary, { exact: true })).toBeVisible();
  }
});

test("the command palette finds a primitive by its name", async ({ page }) => {
  // The reader-level assertion behind "do not write a fourth Button": before
  // writing a component you ask the palette whether one already exists, and the
  // answer has to take you to the row that says what it is for.
  const path = "/analysis/repo-onboarding";
  await page.goto(path);
  await waitForPageReady(page, path);

  await page.getByRole("button", { name: /Search analysis/ }).click();
  const dialog = page.getByRole("dialog", { name: "Search this analysis" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("textbox", { name: "Search this analysis" }).fill("FileChip");
  const hit = dialog.getByRole("button", { name: /FileChip/ });
  await expect(hit).toBeVisible();
  await expect(dialog.getByText("Design System", { exact: true })).toBeVisible();

  await hit.click();
  await expect(page).toHaveURL(/\/analysis\/repo-onboarding\/design\?primitive=/);
  await expect(
    page.getByRole("heading", { name: "How this interface is built" }),
  ).toBeVisible({ timeout: LARGE_DOCUMENT_TIMEOUT });
});

test("the design system keeps its two lists' promises apart", async ({ page }) => {
  // Read from the document rather than restated here. The promise is that a
  // reader can tell the sampled list from the exhaustive one — if a primitive
  // is not listed it does not exist, and if a token is not listed it very
  // likely does. See ADR 0005.
  const file = join(
    test.info().project.testDir,
    "..",
    "..",
    "data",
    "repo-onboarding",
    "analysis.json",
  );
  const doc = JSON.parse(readFileSync(file, "utf8")) as Analysis;
  const system = doc.designSystem;
  expect(system).toBeTruthy();

  const path = "/analysis/repo-onboarding/design";
  await page.goto(path);
  await waitForPageReady(page, path);

  await expect(page.getByText(/sampled,\s*not exhaustive/i)).toBeVisible();
  await expect(page.getByText(/exhaustive — one that is not here/i)).toBeVisible();

  // The rule is the section's reason for existing, so both halves are on the
  // page — not one blob with the useful half missing.
  await expect(page.getByRole("heading", { name: "Reuse when" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create when" })).toBeVisible();
  await expect(page.getByText(system!.reuseRule.createWhen)).toBeVisible();

  for (const primitive of system!.primitives) {
    await expect(page.getByText(primitive.use, { exact: true })).toBeVisible();
  }
});

test("the command palette finds a gate by its name", async ({ page }) => {
  // The reader-level assertion behind the gate list: before pushing you ask
  // the palette what runs against a pull request, and the answer has to take
  // you to the row that says what the check looks for.
  const path = "/analysis/repo-onboarding";
  await page.goto(path);
  await waitForPageReady(page, path);

  await page.getByRole("button", { name: /Search analysis/ }).click();
  const dialog = page.getByRole("dialog", { name: "Search this analysis" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("textbox", { name: "Search this analysis" }).fill("playwright");
  // Named exactly, because "playwright" also matches the Learn entry for it —
  // which is the palette working, not a defect. The hint is what tells the two
  // apart on screen, so it is what tells them apart here.
  const hit = dialog.getByRole("button", { name: "playwright ci.yml" });
  await expect(hit).toBeVisible();
  await expect(dialog.getByText("Delivery", { exact: true })).toBeVisible();

  await hit.click();
  await expect(page).toHaveURL(/\/analysis\/repo-onboarding\/delivery\?gate=/);
  await expect(
    page.getByRole("heading", { name: "What happens when this merges" }),
  ).toBeVisible({ timeout: LARGE_DOCUMENT_TIMEOUT });
});

/**
 * The fixed sentence the viewer states about the boundary — the one place on
 * the page allowed to name the operational half, and only to say it is not
 * here. Restated in the test rather than imported: this is the reader-level
 * check that it is actually rendered, so reading it from the source under test
 * would assert nothing.
 */
const BOUNDARY_SENTENCE =
  "Everything here is read from a committed file. Production dashboards, log " +
  "access, rollback procedure and on-call are not in this repository, so they " +
  "are not here — a boundary rather than a gap.";

test("the delivery section stops at what is committed", async ({ page }) => {
  // Two claims, and the second is the one ADR 0006 exists for. First: every
  // gate a change must pass is on the page, read from the document rather than
  // restated here. Second: the section is exactly the blocks the schema has
  // fields for, so the operational half — dashboards, log access, rollback,
  // on-call — has nowhere to appear, and the reader is told so.
  const file = join(
    test.info().project.testDir,
    "..",
    "..",
    "data",
    "repo-onboarding",
    "analysis.json",
  );
  const doc = JSON.parse(readFileSync(file, "utf8")) as Analysis;
  const delivery = doc.delivery;
  expect(delivery).toBeTruthy();

  const path = "/analysis/repo-onboarding/delivery";
  await page.goto(path);
  await waitForPageReady(page, path);

  await expect(page.getByText(/exhaustive — a check that is not here/i)).toBeVisible();
  for (const gate of delivery!.gates) {
    await expect(page.getByText(gate.checks, { exact: true })).toBeVisible();
  }

  // The sentence is on the page, and it is the VIEWER's: a document that
  // carried it would be an analysis engine writing its own disclaimer, which
  // is the operational summary the boundary exists to prevent.
  await expect(page.getByText(BOUNDARY_SENTENCE)).toBeVisible();
  expect(JSON.stringify(doc)).not.toContain("read from a committed file");

  // And the section holds these blocks and NO others — which is the whole
  // guarantee, because the operational half has no block to appear in.
  //
  // Deliberately not a keyword scan for "rollback", "dashboard" and friends.
  // ADR 0006 rejects that outright and the reasoning carries here: "a failed
  // gate blocks the merge, so there is nothing to roll back" is a sentence the
  // section should be able to say, and a blacklist cannot tell it from an
  // invented runbook — it would go red on a correct document, in CI, and teach
  // its author to write around the test. The shape is what is enforceable, so
  // the shape is what is asserted.
  const headings = await page
    .locator("main")
    .getByRole("heading")
    .allInnerTexts();
  // Cased as a reader sees them: the two kickers are uppercased by the
  // `.kicker` class, and `allInnerTexts` reports the rendered text.
  expect(headings.map((h) => h.trim())).toEqual([
    "What happens when this merges",
    "THE PIPELINE",
    "WHAT A DEPLOY RUNS",
    "Gates",
    "Migrations",
    "Deploy variables",
  ]);
});

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
