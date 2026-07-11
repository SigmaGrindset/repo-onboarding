import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-5 py-24 text-center">
      <div className="mb-4 text-5xl font-semibold tracking-tight text-accent">
        404
      </div>
      <h1 className="text-lg font-semibold text-text">Not found</h1>
      <p className="mt-2 text-sm text-muted">
        That analysis or page doesn&apos;t exist. It may have been removed, or
        the id is misspelled.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover"
      >
        Back to all analyses
      </Link>
    </div>
  );
}
