"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChatSession } from "./ChatSession";

/**
 * "Ask this repo" entry point: a fixed launcher button plus the slide-over
 * drawer it opens. This component is only the shell — launcher, portal, open
 * state, backdrop, scroll lock and Escape-to-close. The live session (transcript
 * + composer + header) is `<ChatSession>`, mounted ONLY while open so the
 * localStorage transcript is read client-side on each open with no SSR/hydration
 * mismatch. Rendered from the analysis layout, so it appears on every tab.
 */
export function ChatPanel({
  analysisId,
  repoName,
  suggestedQuestions,
}: {
  analysisId: string;
  repoName: string;
  /** Per-section starter prompts keyed by section slug ("" = overview). */
  suggestedQuestions: Record<string, string[]>;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Escape closes; lock page scroll behind the drawer (both only while open).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask this repo"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-medium text-accent-fg shadow-lg transition hover:bg-accent-hover"
      >
        <ChatIcon />
        <span className="hidden sm:inline">Ask this repo</span>
      </button>

      {/* Portaled to <body> so the fixed overlay is never trapped inside a
          positioned ancestor's stacking context (cf. CommandPalette). */}
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50">
              {/* Backdrop — mainly for the full-width mobile drawer. */}
              <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={close}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Ask this repo"
                className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-surface shadow-2xl sm:w-[420px]"
              >
                <ChatSession
                  analysisId={analysisId}
                  repoName={repoName}
                  suggestedQuestions={suggestedQuestions}
                  onClose={close}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 3.5h12v8H6l-3 2.5v-2.5H2z" />
      <path d="M5 6.5h6M5 8.7h4" />
    </svg>
  );
}
