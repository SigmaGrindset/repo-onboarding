"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Owner-only Share dialog (cloud mode). Two ways to share one analysis:
 *
 *  1. Unlisted link — a secret-token URL viewable without signing in. Create,
 *     copy, or revoke.
 *  2. People — grant/revoke viewer access by email (resolved to a Clerk user).
 *
 * `analysisId` is the `db_<uuid>` route id, used verbatim in the API URLs.
 */

interface Viewer {
  userId: string;
  email: string;
}

export function ShareDialog({ analysisId }: { analysisId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition hover:border-border-strong"
      >
        <IconShare />
        Share
      </button>
      {/* Portaled to <body>: the sidebar's sticky container forms its own
          stacking context, so the fixed overlay would otherwise paint under
          positioned main-column content. */}
      {open
        ? createPortal(
            <ShareOverlay
              analysisId={analysisId}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function ShareOverlay({
  analysisId,
  onClose,
}: {
  analysisId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [shareToken, setShareToken] = useState<string | null>(null);

  // Link section
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // People section
  const [email, setEmail] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const base = `/api/analyses/${analysisId}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${base}/shares`);
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setLoadError(data.error ?? `Failed to load sharing (HTTP ${res.status}).`);
        } else {
          setViewers(Array.isArray(data.viewers) ? data.viewers : []);
          setShareToken(data.shareToken ?? null);
        }
      } catch {
        if (alive) setLoadError("Failed to load sharing.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [base]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const createLink = useCallback(async () => {
    setLinkBusy(true);
    try {
      const res = await fetch(`${base}/share-link`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setShareToken(data.shareToken ?? null);
    } finally {
      setLinkBusy(false);
    }
  }, [base]);

  const revokeLink = useCallback(async () => {
    setLinkBusy(true);
    try {
      const res = await fetch(`${base}/share-link`, { method: "DELETE" });
      if (res.ok) {
        setShareToken(null);
        setCopied(false);
      }
    } finally {
      setLinkBusy(false);
    }
  }, [base]);

  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/analysis/st_${shareToken}`
      : "";

  const copyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }, [shareUrl]);

  const addViewer = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const value = email.trim();
      if (!value) return;
      setAddBusy(true);
      setAddError(null);
      try {
        const res = await fetch(`${base}/shares`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAddError(data.error ?? `Couldn't share (HTTP ${res.status}).`);
          return;
        }
        setViewers((prev) =>
          prev.some((v) => v.userId === data.userId)
            ? prev
            : [...prev, { userId: data.userId, email: data.email }],
        );
        setEmail("");
      } catch {
        setAddError("Couldn't share. Try again.");
      } finally {
        setAddBusy(false);
      }
    },
    [base, email],
  );

  const removeViewer = useCallback(
    async (userId: string) => {
      const res = await fetch(`${base}/shares/${userId}`, { method: "DELETE" });
      if (res.ok) {
        setViewers((prev) => prev.filter((v) => v.userId !== userId));
      }
    },
    [base],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share this analysis"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">Share analysis</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : loadError ? (
          <p className="text-sm text-red-500">{loadError}</p>
        ) : (
          <div className="space-y-6">
            {/* Unlisted link */}
            <section>
              <h3 className="text-sm font-semibold text-text">Unlisted link</h3>
              <p className="mt-1 text-xs text-faint">
                Anyone with the link can view. No sign-in required.
              </p>
              {shareToken ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-text"
                    />
                    <button
                      type="button"
                      onClick={copyLink}
                      className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition hover:border-border-strong"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={revokeLink}
                    disabled={linkBusy}
                    className="text-xs font-medium text-muted transition hover:text-red-500 disabled:opacity-50"
                  >
                    Revoke link
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={createLink}
                  disabled={linkBusy}
                  className="mt-3 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-fg transition hover:bg-accent-hover disabled:opacity-50"
                >
                  {linkBusy ? "Creating…" : "Create link"}
                </button>
              )}
            </section>

            {/* People */}
            <section>
              <h3 className="text-sm font-semibold text-text">People</h3>
              <form onSubmit={addViewer} className="mt-3 flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setAddError(null);
                  }}
                  placeholder="teammate@example.com"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint"
                />
                <button
                  type="submit"
                  disabled={addBusy || !email.trim()}
                  className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addBusy ? "Adding…" : "Add"}
                </button>
              </form>
              {addError ? (
                <p className="mt-2 text-xs text-red-500">{addError}</p>
              ) : null}

              {viewers.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {viewers.map((v) => (
                    <li
                      key={v.userId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-sm text-text">
                        {v.email}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeViewer(v.userId)}
                        className="shrink-0 text-xs font-medium text-muted transition hover:text-red-500"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-faint">Not shared with anyone yet.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function IconShare() {
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
      <circle cx="12" cy="3.5" r="1.8" />
      <circle cx="4" cy="8" r="1.8" />
      <circle cx="12" cy="12.5" r="1.8" />
      <path d="M5.6 7.1 10.4 4.4M5.6 8.9l4.8 2.7" />
    </svg>
  );
}
