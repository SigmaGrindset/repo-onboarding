import Link from "next/link";
import { isCloudMode } from "@/lib/mode";
import { Card, SectionHeader } from "@/components/ui";
import { UploadForm } from "@/components/UploadForm";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  const cloud = isCloudMode();

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <SectionHeader
        kicker="Upload"
        title="Add an analysis"
        description={
          cloud
            ? "Upload an analysis.json produced by the /onboard skill. It is validated against the schema, stored privately, and added to your workspace."
            : "Uploading requires cloud mode (auth + database + blob storage)."
        }
      />

      {cloud ? (
        <UploadForm />
      ) : (
        <Card className="p-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-faint" />
            Cloud mode not configured
          </div>
          <p className="text-sm leading-relaxed text-muted">
            This deployment is running in <strong className="text-text">local mode</strong>,
            which serves the read-only fixture analyses from{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
              data/
            </code>
            . Uploads are stored per-user, so they need authentication and cloud
            storage.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            To enable uploads, provision Clerk, Neon Postgres and Vercel Blob and
            set the keys in{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
              .env
            </code>{" "}
            (see{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
              web/.env.example
            </code>{" "}
            and the README). The app switches to cloud mode automatically once all
            keys are present.
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
