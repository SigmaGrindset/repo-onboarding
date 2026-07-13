import Link from "next/link";
import { isCloudMode } from "@/lib/mode";
import { Card, SectionHeader } from "@/components/ui";
import { ApiTokensPanel, type TokenListItem } from "@/components/ApiTokensPanel";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const cloud = isCloudMode();

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <SectionHeader
        kicker="Account"
        title="API tokens"
        description={
          cloud
            ? "Personal tokens let the repo-onboarding CLI publish analyses to your workspace without a browser. Treat a token like a password."
            : "API tokens require cloud mode (auth + database)."
        }
      />

      {cloud ? (
        <CloudAccount />
      ) : (
        <Card className="p-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-faint" />
            Cloud mode not configured
          </div>
          <p className="text-sm leading-relaxed text-muted">
            This deployment is running in{" "}
            <strong className="text-text">local mode</strong>, which serves the
            read-only fixture analyses from{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
              data/
            </code>
            . API tokens authenticate uploads to a per-user workspace, so they
            need authentication and a database.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            To enable them, provision Clerk, Neon Postgres and Vercel Blob and
            set the keys in{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
              .env
            </code>{" "}
            (see{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
              web/.env.example
            </code>{" "}
            and the README). The app switches to cloud mode automatically once
            all keys are present.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border-strong"
          >
            Back to analyses
          </Link>
        </Card>
      )}
    </div>
  );
}

/**
 * Server-side data fetch for the token list, then hand off to the interactive
 * client panel. Split into its own async component so the not-configured branch
 * above never imports Clerk/DB.
 */
async function CloudAccount() {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    // The proxy protects this route, so this is a belt-and-braces fallback.
    return (
      <Card className="p-6">
        <p className="text-sm text-muted">Sign in to manage your API tokens.</p>
      </Card>
    );
  }

  const { listTokens } = await import("@/lib/tokens");
  const rows = await listTokens(userId);
  const initialTokens: TokenListItem[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
  }));

  return <ApiTokensPanel initialTokens={initialTokens} />;
}
