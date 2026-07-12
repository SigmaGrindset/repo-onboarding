import type { ReactNode } from "react";
import { basename } from "@/lib/format";

/** Small pill badge. Pass a full Tailwind className for colour. */
export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/** A surface card container. `id` makes it a deep-link / jump target. */
export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded-xl border border-border bg-surface ${className}`}
    >
      {children}
    </div>
  );
}

/** Section header with an eyebrow kicker, title and optional description. */
export function SectionHeader({
  kicker,
  title,
  description,
}: {
  kicker?: string;
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {kicker ? (
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
          {kicker}
        </div>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-[1.7rem]">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Monospace file-path chip, optionally with a line range. */
export function FileChip({
  path,
  startLine,
  endLine,
  title,
}: {
  path: string;
  startLine?: number;
  endLine?: number;
  title?: string;
}) {
  const lines =
    startLine != null
      ? endLine != null && endLine !== startLine
        ? `:${startLine}-${endLine}`
        : `:${startLine}`
      : "";
  return (
    <span
      title={title ?? path}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[0.78rem] text-text"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        className="shrink-0 text-faint"
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
      <span className="truncate">
        <span className="text-muted">
          {path.slice(0, path.length - basename(path).length)}
        </span>
        <span className="text-text">{basename(path)}</span>
        {lines ? <span className="text-accent">{lines}</span> : null}
      </span>
    </span>
  );
}

/** Empty-state placeholder. */
export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <Card className="p-8 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </Card>
  );
}
