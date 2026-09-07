import type { ReactNode } from "react";
import { basename } from "@/lib/format";

/**
 * Small squared-off label. Deliberately not a pill — these carry data
 * (language, category, difficulty), not "New"/"Beta" marketing.
 * Pass a full Tailwind className for colour.
 */
export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[0.72rem] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Surface container. `tone` decides whether the card earns elevation:
 *
 *  - `raised` (default) — a top-level block: paper surface, hairline border,
 *    a tinted shadow suggesting the same light source as everything else.
 *  - `quiet` — a block nested inside another card. No border and no shadow, so
 *    nesting reads as one depth step rather than two stacked frames.
 *
 * `radius` runs tighter as elements nest, which keeps the corner rhythm from
 * flattening into one uniform value across the whole page.
 * `id` makes the card a deep-link / jump target.
 */
export function Card({
  children,
  className = "",
  id,
  tone = "raised",
  radius = "xl",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "raised" | "quiet";
  radius?: "lg" | "xl" | "2xl";
}) {
  const radii = { lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" };
  const tones = {
    raised: "border border-border bg-surface shadow-soft",
    quiet: "bg-surface-2",
  };
  // `min-w-0`: as a grid or flex item a card's automatic minimum size is its
  // min-content width, so one long file path inside would widen the whole
  // track and push the page into a horizontal scroll. No-op elsewhere.
  return (
    <div id={id} className={`min-w-0 ${radii[radius]} ${tones[tone]} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Section header: a mono kicker on a short rule, then a display-scale title.
 * The rule replaces an all-caps sans eyebrow shouting on its own line.
 */
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
    <div className="mb-8">
      {kicker ? (
        <div className="mb-3 flex items-center gap-2.5 text-accent">
          <span aria-hidden className="h-px w-6 bg-accent/45" />
          <span className="kicker">{kicker}</span>
        </div>
      ) : null}
      <h1 className="text-[1.9rem] font-semibold leading-[1.1] tracking-[-0.03em] text-text sm:text-[2.35rem]">
        {title}
      </h1>
      {description ? (
        <p className="mt-3.5 max-w-[50ch] text-[1rem] leading-[1.65] text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Monospace file-path chip, optionally with a line range. With `href` it
 * becomes an external link (source on GitHub at the analyzed commit).
 */
export function FileChip({
  path,
  startLine,
  endLine,
  title,
  href,
}: {
  path: string;
  startLine?: number;
  endLine?: number;
  title?: string;
  href?: string | null;
}) {
  const lines =
    startLine != null
      ? endLine != null && endLine !== startLine
        ? `:${startLine}-${endLine}`
        : `:${startLine}`
      : "";
  // The last segment is emphasised and the rest is dimmed, so the eye lands on
  // the file. Located rather than assumed to be the tail: a directory path is
  // idiomatically written with a trailing slash (`web/drizzle/`), and slicing
  // by length alone renders that as `web/ddrizzle`.
  const name = basename(path);
  const nameAt = path.lastIndexOf(name);
  const before = nameAt >= 0 ? path.slice(0, nameAt) : path;
  const after = nameAt >= 0 ? path.slice(nameAt + name.length) : "";
  const body = (
    <>
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="shrink-0 text-faint"
        aria-hidden
      >
        <path d="M4 1.5h5L13 5.5v9H4z" />
        <path d="M9 1.5v4h4" />
      </svg>
      <span className="min-w-0 truncate">
        <span className="text-muted">{before}</span>
        <span className="text-text group-hover/chip:text-accent group-hover/chip:underline">
          {name}
        </span>
        {after ? <span className="text-muted">{after}</span> : null}
        {lines ? <span className="text-accent">{lines}</span> : null}
      </span>
    </>
  );
  const className =
    "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[0.78rem] text-text";
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        title={title ?? `${path} — view source on GitHub`}
        className={`group/chip press ${className} hover:border-border-strong hover:bg-surface-3`}
      >
        {body}
      </a>
    );
  }
  return (
    <span title={title ?? path} className={className}>
      {body}
    </span>
  );
}

/**
 * Empty-state placeholder. Composed rather than a lone sentence in a box: a
 * mark, the state, the reason, and — when there is one — the way out of it.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <Card radius="2xl" className="px-6 py-14 text-center">
      <span
        aria-hidden
        className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2 text-faint"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 4.5h5l1.2 1.6H14v7H2z" />
          <path d="M2 4.5V3h4l1 1.5" />
        </svg>
      </span>
      <p className="text-base font-semibold tracking-[-0.01em] text-text">
        {title}
      </p>
      {hint ? (
        <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </Card>
  );
}
