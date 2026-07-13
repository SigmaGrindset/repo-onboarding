"use client";

import { Streamdown } from "streamdown";
import type { UIMessage } from "ai";

/**
 * One rendered turn in the "Ask this repo" transcript.
 *
 *  - user      → a right-aligned plain-text bubble (`whitespace-pre-wrap`).
 *  - assistant → left-aligned; each text part flows through Streamdown for
 *                streaming-safe markdown, and each `fetchFile` tool part becomes
 *                a compact one-line status chip.
 *
 * `step-start`, reasoning and any other/unknown part type render nothing.
 * Every optional tool field is guarded because parts arrive incrementally as
 * the stream progresses (a tool part exists before its `input`/`output` do).
 */
export function ChatMessage({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent-soft px-3.5 py-2 text-sm text-text">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[92%] space-y-2">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className="prose min-w-0 text-sm [&_pre]:overflow-x-auto [&_pre]:max-w-full"
              >
                <Streamdown className="min-w-0">{part.text}</Streamdown>
              </div>
            );
          }
          if (part.type === "tool-fetchFile") {
            return <ToolChip key={i} part={part} />;
          }
          // step-start, reasoning, and any unknown part type render nothing.
          return null;
        })}
      </div>
    </div>
  );
}

/** The `fetchFile` tool result the server returns (see lib/chat/tools.ts). */
type FetchFileOutput =
  | { ok: true; path?: string; content?: string; truncated?: boolean }
  | { ok: false; error?: string };

/** The loose runtime shape of a `tool-fetchFile` UI part across its states. */
interface ToolPartLike {
  state?:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  input?: { path?: string };
  output?: FetchFileOutput;
  errorText?: string;
}

/** A single monospace status line reflecting one file-read tool call. */
function ToolChip({ part }: { part: unknown }) {
  const p = part as ToolPartLike;
  const inputPath = p.input?.path;

  let label: React.ReactNode;
  if (p.state === "output-error") {
    label = "File fetch failed";
  } else if (p.state === "output-available") {
    const out = p.output;
    if (out && out.ok) {
      label = (
        <>
          Read <Code>{out.path ?? inputPath ?? "file"}</Code>
          {out.truncated ? " (truncated)" : ""}
        </>
      );
    } else {
      label = (
        <>
          Couldn&apos;t read <Code>{inputPath ?? "file"}</Code>
        </>
      );
    }
  } else {
    // input-streaming | input-available (or unset while the part first appears)
    label = (
      <>
        Reading <Code>{inputPath ?? "…"}</Code>…
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-faint">
      <FileIcon />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.72rem] text-muted">
      {children}
    </code>
  );
}

function FileIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
      aria-hidden
    >
      <path
        d="M4 1.5h5L13 5.5v9H4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9 1.5v4h4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
