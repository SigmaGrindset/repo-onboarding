import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { OnboardingJourney } from "@/components/OnboardingJourney";
import { OnboardingProgressProvider } from "@/components/OnboardingProgressProvider";

describe("OnboardingJourney", () => {
  test("hydrates a local checkpoint into the shared journey", async () => {
    localStorage.setItem("onboarding-progress:v1:sample", JSON.stringify({
      architectureRead: false,
      setupCompleted: false,
      tourFurthest: 4,
      selectedTaskIndex: null,
    }));
    render(
      <OnboardingProgressProvider
        analysisId="sample"
        storage="local"
        totalTourSteps={8}
        taskCount={2}
        initialProgress={{
          architectureRead: false,
          setupCompleted: false,
          tourFurthest: 0,
          selectedTaskIndex: null,
        }}
      >
        <OnboardingJourney analysisId="sample" taskTitles={["First", "Second"]} />
      </OnboardingProgressProvider>,
    );
    expect(await screen.findAllByRole("link", { name: "Continue at step 4" })).toHaveLength(2);
    localStorage.clear();
  });

  test("shows partial tour credit and the resume action", () => {
    render(
      <OnboardingProgressProvider
        analysisId="sample"
        storage="db"
        totalTourSteps={8}
        taskCount={2}
        initialProgress={{
          architectureRead: true,
          setupCompleted: true,
          tourFurthest: 4,
          selectedTaskIndex: null,
        }}
      >
        <OnboardingJourney analysisId="sample" taskTitles={["First", "Second"]} />
      </OnboardingProgressProvider>,
    );

    expect(screen.getByText("63%", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Continue at step 4" })).toHaveLength(2);
    expect(screen.getByText("4/8 steps reached")).toBeInTheDocument();
  });

  test("shows the selected task when all milestones are complete", () => {
    render(
      <OnboardingProgressProvider
        analysisId="sample"
        storage="db"
        totalTourSteps={8}
        taskCount={2}
        initialProgress={{
          architectureRead: true,
          setupCompleted: true,
          tourFurthest: 8,
          selectedTaskIndex: 1,
        }}
      >
        <OnboardingJourney analysisId="sample" taskTitles={["First", "Second"]} />
      </OnboardingProgressProvider>,
    );

    expect(screen.getByText("100%", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("You’re ready to contribute")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
