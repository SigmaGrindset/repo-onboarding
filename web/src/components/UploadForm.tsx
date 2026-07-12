"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Client upload form: pick or drag-drop an analysis.json, POST it to
 * /api/analyses, then redirect to the new analysis on success. Schema
 * validation happens server-side; its errors are surfaced here.
 */
export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const pick = useCallback((f: File | null) => {
    setErrors([]);
    setNotice(null);
    if (!f) {
      setFile(null);
      return;
    }
    const isJson = f.name.toLowerCase().endsWith(".json") || f.type === "application/json";
    if (!isJson) {
      setErrors(["Please choose a .json file."]);
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setErrors([
        `That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`,
      ]);
      setFile(null);
      return;
    }
    setFile(f);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      pick(e.dataTransfer.files?.[0] ?? null);
    },
    [pick],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setErrors(["Choose an analysis.json first."]);
      return;
    }
    setBusy(true);
    setErrors([]);
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
      } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(null);
        setBusy(false);
        if (Array.isArray(data.errors) && data.errors.length) {
          setErrors(data.errors);
        } else {
          setErrors([data.error ?? `Upload failed (HTTP ${res.status}).`]);
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
      setErrors([err instanceof Error ? err.message : "Upload failed."]);
    }
  }

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

      {errors.length > 0 ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-500">
            {errors.length === 1 ? "Upload rejected" : `Upload rejected — ${errors.length} problems`}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-red-500/90">
            {errors.slice(0, 50).map((err, i) => (
              <li key={i} className="font-mono">
                {err}
              </li>
            ))}
          </ul>
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
