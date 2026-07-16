"use client";

import { useCallback, useState } from "react";
import { formatDate } from "@/lib/format";

/**
 * Interactive API-token manager for the /account page (cloud mode).
 *
 * Create a named token, reveal its plaintext exactly once (with a copy button
 * and a "you won't see this again" note), list existing tokens with their
 * display prefix / created / last-used, and revoke with a confirm. The server
 * component seeds `initialTokens`; every mutation then talks to /api/tokens.
 */

export interface TokenListItem {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string; // ISO
  lastUsedAt: string | null; // ISO or null
}

interface CreatedToken {
  id: string;
  name: string;
  token: string;
  tokenPrefix: string;
  createdAt: string;
}

export function ApiTokensPanel({
  initialTokens,
}: {
  initialTokens: TokenListItem[];
}) {
  const [tokens, setTokens] = useState<TokenListItem[]>(initialTokens);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const value = name.trim();
      if (!value) return;
      setBusy(true);
      setError(null);
      setJustCreated(null);
      setCopied(false);
      try {
        const res = await fetch("/api/tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? `Couldn't create token (HTTP ${res.status}).`);
          return;
        }
        const created = data as CreatedToken;
        setJustCreated(created);
        setTokens((prev) => [
          {
            id: created.id,
            name: created.name,
            tokenPrefix: created.tokenPrefix,
            createdAt: created.createdAt,
            lastUsedAt: null,
          },
          ...prev,
        ]);
        setName("");
      } catch {
        setError("Couldn't create token. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [name],
  );

  const copyToken = useCallback(async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }, [justCreated]);

  const revoke = useCallback(async (id: string, tokenName: string) => {
    if (
      !window.confirm(
        `Revoke "${tokenName}"? Any CLI or script using it will stop working immediately.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTokens((prev) => prev.filter((t) => t.id !== id));
      setJustCreated((cur) => (cur && cur.id === id ? null : cur));
    }
  }, []);

  return (
    <div className="space-y-8">
      {/* Create */}
      <section>
        <form onSubmit={create} className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            maxLength={60}
            placeholder="Token name (e.g. laptop CLI)"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create token"}
          </button>
        </form>
        {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
      </section>

      {/* One-time reveal */}
      {justCreated ? (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Token created — copy it now
          </p>
          <p className="mt-1 text-xs text-muted">
            This is the only time the full token is shown. Store it somewhere
            safe; you won&apos;t be able to see it again.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-text">
              {justCreated.token}
            </code>
            <button
              type="button"
              onClick={copyToken}
              className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition hover:border-border-strong"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Usage hint */}
      <section className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-sm font-medium text-text">Using a token</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Set the token in your environment and publish a generated analysis
          from the CLI:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-text">
          <code>{`export REPO_ONBOARDING_TOKEN=roa_…
repo-onboarding upload analysis.json`}</code>
        </pre>
      </section>

      {/* List */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">Your tokens</h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">
            No tokens yet. Create one above to publish from the CLI.
          </p>
        ) : (
          <ul className="space-y-2">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {t.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.72rem]">
                      {t.tokenPrefix}…
                    </code>
                    <span className="text-faint">
                      Created {formatDate(t.createdAt)}
                    </span>
                    <span className="text-faint">·</span>
                    <span className="text-faint">
                      {t.lastUsedAt
                        ? `Last used ${formatDate(t.lastUsedAt)}`
                        : "Never used"}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(t.id, t.name)}
                  className="shrink-0 text-xs font-medium text-muted transition hover:text-red-500"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
