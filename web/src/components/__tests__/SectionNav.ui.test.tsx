import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  pathname: "/analysis/sample",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));

import { SectionNav } from "@/components/SectionNav";

const layoutProperties = [
  "clientWidth",
  "scrollWidth",
  "scrollLeft",
  "offsetLeft",
  "offsetWidth",
  "scrollTo",
] as const;
const originalLayoutDescriptors = new Map(
  layoutProperties.map((property) => [
    property,
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, property),
  ]),
);

describe("SectionNav mobile overflow", () => {
  let scrollLeft = 0;
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    scrollLeft = options.left ?? 0;
  });

  beforeEach(() => {
    navigationMocks.pathname = "/analysis/sample";
    scrollLeft = 0;
    scrollTo.mockClear();

    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: {
        configurable: true,
        get() {
          return this.tagName === "NAV" ? 300 : 0;
        },
      },
      scrollWidth: {
        configurable: true,
        get() {
          return this.tagName === "NAV" ? 900 : 0;
        },
      },
      scrollLeft: {
        configurable: true,
        get() {
          return this.tagName === "NAV" ? scrollLeft : 0;
        },
      },
      offsetLeft: {
        configurable: true,
        get() {
          if (this.textContent === "First Tasks") return 700;
          return 0;
        },
      },
      offsetWidth: {
        configurable: true,
        get() {
          return this.tagName === "A" ? 120 : 0;
        },
      },
      scrollTo: {
        configurable: true,
        value: scrollTo,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const property of layoutProperties) {
      const descriptor = originalLayoutDescriptors.get(property);
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, property, descriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, property);
      }
    }
  });

  test("centers a late active section and updates the edge cues", async () => {
    navigationMocks.pathname = "/analysis/sample/tasks";
    const { container } = render(<SectionNav id="sample" />);

    expect(screen.getByRole("link", { name: "First Tasks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith({ left: 600, behavior: "smooth" }),
    );
    expect(container.querySelector('[data-scroll-edge="left"]')).toHaveAttribute(
      "data-visible",
      "true",
    );
    expect(container.querySelector('[data-scroll-edge="right"]')).toHaveAttribute(
      "data-visible",
      "false",
    );
  });

  test("shows and hides fades as the tab strip scrolls", () => {
    const { container } = render(<SectionNav id="sample" />);
    const nav = screen.getByRole("navigation", { name: "Analysis sections" });
    const leftFade = container.querySelector('[data-scroll-edge="left"]');
    const rightFade = container.querySelector('[data-scroll-edge="right"]');

    expect(leftFade).toHaveAttribute("data-visible", "false");
    expect(rightFade).toHaveAttribute("data-visible", "true");

    scrollLeft = 300;
    fireEvent.scroll(nav);
    expect(leftFade).toHaveAttribute("data-visible", "true");
    expect(rightFade).toHaveAttribute("data-visible", "true");

    scrollLeft = 600;
    fireEvent.scroll(nav);
    expect(rightFade).toHaveAttribute("data-visible", "false");
  });

  test("avoids animated scrolling when reduced motion is requested", async () => {
    navigationMocks.pathname = "/analysis/sample/tasks";
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
    } as MediaQueryList);

    render(<SectionNav id="sample" />);

    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith({ left: 600, behavior: "auto" }),
    );
  });
});
