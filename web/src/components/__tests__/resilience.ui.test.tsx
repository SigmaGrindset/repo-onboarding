import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

const chatMocks = vi.hoisted(() => ({
  useChat: vi.fn(),
  clearError: vi.fn(),
  regenerate: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMocks }));
vi.mock("next/navigation", () => ({ usePathname: () => "/analysis/sample" }));
vi.mock("@ai-sdk/react", () => ({ useChat: chatMocks.useChat }));
vi.mock("ai", () => ({ DefaultChatTransport: class {} }));
vi.mock("@/components/chat/ChatMessage", () => ({
  ChatMessage: ({ message }: { message: { id: string } }) => <div>{message.id}</div>,
}));

import RootError from "@/app/error";
import { Mermaid } from "@/components/Mermaid";
import { ShareDialog } from "@/components/ShareDialog";
import { ChatSession } from "@/components/chat/ChatSession";

describe("route error state", () => {
  test("announces the failure and resets on retry", async () => {
    const retry = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RootError error={new Error("offline")} unstable_retry={retry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("couldn't load this page");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("Mermaid resilience", () => {
  beforeEach(() => {
    mermaidMocks.render.mockReset();
    mermaidMocks.initialize.mockReset();
  });

  test("shows source after failure and can retry rendering", async () => {
    mermaidMocks.render
      .mockRejectedValueOnce(new Error("bad diagram"))
      .mockResolvedValueOnce({ svg: '<svg viewBox="0 0 10 10"></svg>' });

    render(<Mermaid source="graph TD; A-->B" title="Flow" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("showing its source");
    expect(screen.getByText("graph TD; A-->B")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Retry rendering" }));
    expect(await screen.findByRole("img", { name: "Flow" })).toBeVisible();
    expect(mermaidMocks.render).toHaveBeenCalledTimes(2);
  });
});

describe("sharing resilience", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("retries a failed settings request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Temporarily unavailable" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ viewers: [], shareToken: null }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ShareDialog analysisId="db_test" />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Temporarily unavailable");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Not shared with anyone yet.")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("keeps the dialog usable after a failed link mutation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ viewers: [], shareToken: null }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "Link service failed" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ShareDialog analysisId="db_test" />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await userEvent.click(await screen.findByRole("button", { name: "Create link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Link service failed");
    expect(screen.getByRole("button", { name: "Create link" })).toBeEnabled();
  });
});

describe("chat resilience", () => {
  test("clears the error and regenerates the failed answer", async () => {
    chatMocks.useChat.mockReturnValue({
      messages: [{ id: "question-1", role: "user", parts: [{ type: "text", text: "How?" }] }],
      sendMessage: vi.fn(),
      status: "error",
      error: new Error(JSON.stringify({ error: "Gateway unavailable" })),
      stop: vi.fn(),
      setMessages: vi.fn(),
      clearError: chatMocks.clearError,
      regenerate: chatMocks.regenerate,
    });

    render(
      <ChatSession
        analysisId="sample"
        repoName="Sample"
        suggestedQuestions={{ "": [] }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Gateway unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Retry answer" }));
    await waitFor(() => expect(chatMocks.regenerate).toHaveBeenCalledOnce());
    expect(chatMocks.clearError).toHaveBeenCalledOnce();
  });
});
