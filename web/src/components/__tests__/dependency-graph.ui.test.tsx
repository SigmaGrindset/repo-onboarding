import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DependencyGraph } from "@/components/DependencyGraph";

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

const data = {
  nodes: [
    {
      id: "api",
      label: "Core API",
      kind: "entrypoint" as const,
      path: "src/api.ts",
      description: "Receives and routes incoming requests.",
    },
    {
      id: "store",
      label: "Data store",
      kind: "datastore" as const,
      description: "Persists application data.",
    },
  ],
  edges: [{ from: "api", to: "store", relationship: "writes" }],
};

describe("DependencyGraph mobile layout", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("defaults to the node list and expands the visual graph on demand", async () => {
    render(<DependencyGraph data={data} />);

    const nodeList = screen.getByRole("region", { name: "Nodes" });
    expect(within(nodeList).getByRole("heading", { name: "Nodes" })).toBeVisible();
    expect(within(nodeList).getByText("2 total")).toBeVisible();

    const visualToggle = screen.getByRole("button", {
      name: "Show visual graph",
    });
    const visualGraph = document.getElementById("dependency-graph-visual");

    expect(visualToggle).toHaveAttribute("aria-expanded", "false");
    expect(visualGraph).toHaveClass("hidden");

    await userEvent.click(within(nodeList).getByRole("button", { name: /Core API/ }));
    expect(
      within(nodeList).getByText("Receives and routes incoming requests."),
    ).toBeVisible();
    expect(within(nodeList).getByText("1 connection")).toBeVisible();

    await userEvent.click(visualToggle);
    expect(visualToggle).toHaveAttribute("aria-expanded", "true");
    expect(visualGraph).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeVisible();
  });
});
