import Link from "next/link";

/**
 * Branded 404. Every dead end here offers the three real destinations rather
 * than a single "go home" button, since the most common way to land on this
 * page is a mistyped or expired analysis id.
 */
const EXITS = [
  {
    href: "/",
    title: "All analyses",
    hint: "Everything you can currently open",
  },
  {
    href: "/generate",
    title: "Generate",
    hint: "Run the analyzer against your own repo",
  },
  {
    href: "/upload",
    title: "Upload",
    hint: "Add an analysis.json you already have",
  },
];

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-24 sm:py-32">
      <div className="kicker mb-4 text-accent">Error 404</div>
      <p
        aria-hidden
        className="font-mono text-[4.5rem] font-semibold leading-none tracking-[-0.05em] text-text sm:text-[6rem]"
      >
        404
      </p>
      <h1 className="mt-6 text-[1.6rem] font-semibold tracking-[-0.025em] text-text">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 max-w-[44ch] text-[0.95rem] leading-relaxed text-muted">
        That analysis or page doesn&apos;t exist. It may have been removed, the
        id may be misspelled, or a share link may have expired.
      </p>

      <ul className="mt-9 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        {EXITS.map((exit) => (
          <li key={exit.href}>
            <Link
              href={exit.href}
              className="press group flex items-center gap-4 px-5 py-4 hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.92rem] font-medium text-text transition group-hover:text-accent">
                  {exit.title}
                </span>
                <span className="mt-0.5 block text-[0.8rem] text-faint">
                  {exit.hint}
                </span>
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
                aria-hidden
              >
                <path d="M6 3.5 10.5 8 6 12.5" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
