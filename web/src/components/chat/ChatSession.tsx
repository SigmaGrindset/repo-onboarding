"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatMessage } from "./ChatMessage";
import {
  readLocalChatHistory,
  writeLocalChatHistory,
  clearLocalChatHistory,
  capStoredMessages,
} from "@/lib/chat-history-local";
import { DEFAULT_QUESTIONS } from "@/lib/suggested-questions";
import { ANALYSIS_SECTIONS } from "@/lib/sections";

/**
 * The live chat session: transcript, composer and the drawer header. Mounted
 * only while the drawer is open (by `ChatPanel`), so `readLocalChatHistory`
 * runs on the client at open time — no SSR/hydration mismatch — and re-reading
 * on each open is intentional (the store survives close/reopen within a page).
 */
export function ChatSession({
  analysisId,
  repoName,
  suggestedQuestions,
  onClose,
}: {
  analysisId: string;
  repoName: string;
  /** Per-section starter prompts keyed by section slug ("" = overview). */
  suggestedQuestions: Record<string, string[]>;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const pathname = usePathname();
  const starterQuestions =
    suggestedQuestions[currentSectionSlug(pathname)] ?? DEFAULT_QUESTIONS;
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    id: analysisId,
    transport: new DefaultChatTransport({
      api: `/api/analyses/${analysisId}/chat`,
    }),
    // Seed once from localStorage. `useChat` reads this only on initial mount;
    // since the component mounts fresh each time the drawer opens, a direct
    // call is correct.
    messages: readLocalChatHistory(analysisId),
  });

  // Focus the composer when the session opens.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Persist only completed transcripts: writing mid-stream would store partial
  // assistant turns, and an errored turn (status "error") is intentionally not
  // saved so a failed send leaves no orphaned user message behind.
  useEffect(() => {
    if (status === "ready" && messages.length > 0) {
      writeLocalChatHistory(analysisId, capStoredMessages(messages));
    }
  }, [messages, status, analysisId]);

  // Keep the newest content in view as messages and their parts grow.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const canSend = status === "ready" && input.trim().length > 0;
  const inFlight = status === "submitted" || status === "streaming";

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || status !== "ready") return;
    sendMessage({ text: trimmed });
    setInput("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) send(input);
    }
  };

  const newChat = () => {
    setMessages([]);
    clearLocalChatHistory(analysisId);
    setInput("");
    textareaRef.current?.focus();
  };

  const errorMessage = error ? readableError(error) : null;

  return (
    <>
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text">Ask this repo</h2>
          <p className="truncate text-xs text-faint">{repoName}</p>
        </div>
        <button
          type="button"
          onClick={newChat}
          disabled={inFlight || messages.length === 0}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          New chat
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-text"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      {/* Transcript */}
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3 pt-4">
            <p className="text-sm text-muted">
              Ask anything about this repository. Answers are grounded in the
              analysis and, when reachable, the source files.
            </p>
            <div className="flex flex-col items-start gap-2">
              {starterQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-left text-xs text-muted transition hover:border-border-strong hover:text-text"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}

        {status === "submitted" ? (
          <div className="flex items-center gap-2 text-xs text-faint">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-faint" />
            Thinking…
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
            {errorMessage}
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask about this repo…"
            className="max-h-32 min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none transition placeholder:text-faint focus:border-accent/40"
          />
          {inFlight ? (
            <button
              type="button"
              onClick={() => stop()}
              className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition hover:border-border-strong"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!canSend}
              aria-label="Send message"
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Resolve the analysis section for the current route so the empty state can
 * show that section's starter prompts. Paths look like
 * `/analysis/{id}` or `/analysis/{id}/{slug}[/...]` — take the segment after
 * the id and match it against the canonical slugs (so `versions/diff/x`
 * resolves to `versions`); anything unrecognized falls back to the overview.
 */
function currentSectionSlug(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const candidate = segments[2] ?? "";
  return ANALYSIS_SECTIONS.some((s) => s.slug === candidate) ? candidate : "";
}

/**
 * Turn a `useChat` error into user-facing copy. The API's 4xx/429 bodies are
 * JSON `{ error, ... }` and the SDK surfaces that body as `error.message`, so
 * try to lift the `.error` field; fall back to a generic line otherwise.
 */
function readableError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch {}
  return "Something went wrong. Try again.";
}
