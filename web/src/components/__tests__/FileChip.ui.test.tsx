import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { FileChip } from "@/components/ui";

/**
 * The chip dims the directory part and emphasises the last segment, so the eye
 * lands on the file. That split is the only logic in the component, and it is
 * asserted on the chip's whole text rather than on the spans it is split
 * across: what matters is that a reader sees the path they were given — whole,
 * and once.
 */
describe("FileChip", () => {
  const text = (path: string, props: Record<string, unknown> = {}) =>
    render(<FileChip path={path} {...props} />).container.textContent;

  test("renders a file path exactly as it was given", () => {
    expect(text("web/src/lib/sections.ts")).toBe("web/src/lib/sections.ts");
  });

  test("renders a directory path with its trailing slash, not a doubled letter", () => {
    // `web/drizzle/` is how the delivery section names a migrations directory.
    // Splitting the path by the basename's LENGTH rather than its position put
    // the last segment back after a prefix that still ended mid-word, and the
    // chip read `web/ddrizzle` — a path that does not exist, on the row whose
    // whole job is to say where the migrations live.
    expect(text("web/drizzle/")).toBe("web/drizzle/");
  });

  test("renders a bare filename with no directory part", () => {
    expect(text("package.json")).toBe("package.json");
  });

  test("appends a line range after the filename", () => {
    expect(text("src/app.ts", { startLine: 12, endLine: 40 })).toBe(
      "src/app.ts:12-40",
    );
  });
});
