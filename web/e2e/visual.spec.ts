import { expect, test } from "@playwright/test";
import { CORE_ROUTES, waitForPageReady } from "./helpers";

const themes = ["light", "dark"] as const;

for (const route of CORE_ROUTES) {
  for (const theme of themes) {
    test(`${route.slug} matches ${theme} theme`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Visual baselines are desktop-only");
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
      await page.addInitScript((resolvedTheme) => {
        localStorage.setItem("theme", resolvedTheme);
      }, theme);
      await page.goto(route.path);
      await waitForPageReady(page, route.path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation: none !important;
            transition: none !important;
            caret-color: transparent !important;
          }
          aside p[title^="Analyzed "] { visibility: hidden !important; }
        `,
      });

      await expect(page).toHaveScreenshot(`${route.slug}-${theme}.png`, {
        fullPage: true,
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    });
  }
}
