import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  ANALYSIS_REFRESH_COMMAND,
  AnalysisRefreshCommand,
} from "@/components/AnalysisRefreshCommand";

describe("AnalysisRefreshCommand", () => {
  test("shows the refresh workflow and copies its command", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...window.navigator,
      clipboard: { writeText },
    });

    render(<AnalysisRefreshCommand />);

    expect(screen.getByText("Refresh analysis")).toBeInTheDocument();
    expect(screen.getByText(ANALYSIS_REFRESH_COMMAND)).toBeInTheDocument();
    expect(screen.getByText(/regenerate and upload/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: `Copy: ${ANALYSIS_REFRESH_COMMAND}` }),
    );

    expect(writeText).toHaveBeenCalledWith(ANALYSIS_REFRESH_COMMAND);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument(),
    );

    vi.unstubAllGlobals();
  });
});
