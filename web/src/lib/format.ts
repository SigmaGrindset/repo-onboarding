/** Presentation helpers — pure, framework-free. */

/** 18740 -> "18,740". Locale-stable (en-US) to avoid SSR/CSR hydration drift. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** 18740 -> "18.7k"; small numbers pass through. */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** ISO date-time -> "Jul 11, 2026". Returns the raw string if unparseable. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** ISO date-time -> "today" | "yesterday" | "23 days ago" | "3 months ago" | "2 years ago". */
export function relativeDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.floor(days / 30.44)} months ago`;
  return `${Math.floor(days / 365.25)} years ago`;
}

/** Short absolute commit sha, e.g. "9f3c1ab". */
export function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

/** Trim prose to a length on a word boundary, appending an ellipsis. */
export function snippet(text: string, max = 220): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

/** "src/App Router.tsx" -> "src-app-router-tsx". DOM-id and URL-safe slug. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

/** Last path segment, e.g. "src/domain/money.ts" -> "money.ts". */
export function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
