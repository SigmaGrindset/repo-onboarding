"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ValidationIssue } from "@/lib/validateAnalysis";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Client upload form: pick or drag-drop an analysis.json, POST it to
 * /api/analyses, then redirect to the new analysis on success.
 *
 * Two kinds of problems are surfaced. Schema-validation failures come back as
 * structured `ValidationIssue[]` and render field-level (path chip + message +
 * expected/got), with a "Copy for your agent" button that yields a paste-ready
 * block to feed back to the model that generated the file. Everything else
 * (client-side pre-checks, non-validation server errors) renders as plain
 * message rows via `messages`.
 */
export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const clearErrors = useCallback(() => {
    setIssues([]);
    setMessages([]);
    setCopied(false);
  }, []);

  const pick = useCallback(
    (f: File | null) => {
      clearErrors();
      setNotice(null);
      if (!f) {
        setFile(null);
        return;
      }
      const isJson =
        f.name.toLowerCase().endsWith(".json") || f.type === "application/json";
      if (!isJson) {
        setMessages(["Please choose a .json file."]);
        setFile(null);
        return;
      }
      if (f.size > MAX_BYTES) {
        setMessages([
          `That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`,
        ]);
        setFile(null);
        return;
      }
      setFile(f);
    },
    [clearErrors],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      pick(e.dataTransfer.files?.[0] ?? null);
    },
    [pick],
  );

  const copyForAgent = useCallback(async () => {
    const lines = issues.map((it) => {
      const detail: string[] = [];
      if (it.expected) detail.push(`expected ${it.expected}`);
      if (it.got) detail.push(`got ${it.got}`);
      const suffix = detail.length ? ` (${detail.join("; ")})` : "";
      return `- \`${it.path}\` — ${it.message}${suffix}`;
    });
    const block = `Fix these schema validation errors in analysis.json and regenerate. Each line is a JSON Pointer path, the problem, and what was expected vs. found:\n\n${lines.join(
      "\n",
    )}`;
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context); silently ignore.
    }
  }, [issues]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMessages(["Choose an analysis.json first."]);
      return;
    }
    setBusy(true);
    clearErrors();
    setNotice("Validating and uploading…");
    try {
      const text = await file.text();
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data: {
        id?: string;
        version?: number;
        repoName?: string;
        error?: string;
        errors?: string[];
        issues?: ValidationIssue[];
      } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(null);
        setBusy(false);
        if (Array.isArray(data.issues) && data.issues.length) {
          setIssues(data.issues);
        } else if (Array.isArray(data.errors) && data.errors.length) {
          setMessages(data.errors);
        } else {
          setMessages([data.error ?? `Upload failed (HTTP ${res.status}).`]);
        }
        return;
      }
      setNotice(
        data.version && data.version > 1
          ? `Uploaded version ${data.version}${
              data.repoName ? ` of ${data.repoName}` : ""
            }. Opening…`
          : "Uploaded. Opening…",
      );
      router.push(`/analysis/${data.id}`);
    } catch (err) {
      setNotice(null);
      setBusy(false);
      setMessages([err instanceof Error ? err.message : "Upload failed."]);
    }
  }

  const problemCount = issues.length + messages.length;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging
            ? "border-accent bg-accent-soft"
            : "border-border bg-surface hover:border-border-strong"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden className="mb-3 text-faint">
          <path d="M12 16V4m0 0 4 4m-4-4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {file ? (
          <p className="text-sm font-medium text-text">
            {file.name}{" "}
            <span className="text-faint">
              ({(file.size / 1024).toFixed(0)} KB)
            </span>
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-text">
              Drop analysis.json here, or click to choose
            </p>
            <p className="mt-1 text-xs text-faint">JSON only · up to 5 MB</p>
          </>
        )}
      </div>

      {problemCount > 0 ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-red-500">
              {problemCount === 1
                ? "Upload rejected"
                : `Upload rejected — ${problemCount} problems`}
            </p>
            {issues.length > 0 ? (
              <button
                type="button"
                onClick={copyForAgent}
                className="shrink-0 rounded-md border border-red-500/30 px-2 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-500/10"
              >
                {copied ? "Copied" : "Copy for your agent"}
              </button>
            ) : null}
          </div>

          {messages.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-red-500/90">
              {messages.map((m, i) => (
                <li key={`m-${i}`}>{m}</li>
              ))}
            </ul>
          ) : null}

          {issues.length > 0 ? (
            <ul className="mt-3 space-y-2.5">
              {issues.slice(0, 50).map((issue, i) => (
                <li key={`i-${i}`} className="text-xs leading-relaxed">
                  <code className="mr-2 inline-block rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-[11px] text-red-500">
                    {issue.path}
                  </code>
                  <span className="text-red-500/90">{issue.message}</span>
                  {issue.expected || issue.got ? (
                    <span className="mt-0.5 block text-[11px] text-red-500/70">
                      {issue.expected ? (
                        <>
                          expected{" "}
                          <span className="font-mono">{issue.expected}</span>
                        </>
                      ) : null}
                      {issue.expected && issue.got ? " · " : null}
                      {issue.got ? (
                        <>
                          got <span className="font-mono">{issue.got}</span>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {notice ? <p className="text-sm text-muted">{notice}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !file}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload analysis"}
        </button>
        {file ? (
          <button
            type="button"
            onClick={() => pick(null)}
            disabled={busy}
            className="text-xs font-medium text-muted transition hover:text-text disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>
    </form>
  );
}
