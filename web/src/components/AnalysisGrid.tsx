"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisSummary } from "@/lib/datasource";
import { compactNumber, formatDate, snippet } from "@/lib/format";
import { Badge } from "@/components/ui";
import { OnboardingProgressBadge } from "@/components/OnboardingProgressBadge";

/** One index card: the newest version of a repo plus its version count. */
export interface AnalysisCard {
  newest: AnalysisSummary;
  count: number;
}

export type SortKey = "newest" | "name" | "largest";

/** Toolbar appears from this many cards up; below it, filtering is noise. */
const TOOLBAR_MIN_CARDS = 4;

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  name: "Name A–Z",
  largest: "Largest first",
};

/**
 * Same token contract as the Cmd+K palette: every whitespace-separated token
 * must match somewhere in the card's name, language or summary.
 */
function matches(a: AnalysisSummary, tokens: string[]): boolean {
  const haystack =
    `${a.repoName} ${a.primaryLanguage} ${a.summary}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

function compare(a: AnalysisCard, b: AnalysisCard, sort: SortKey): number {
  switch (sort) {
    case "newest":
      // ISO 8601 timestamps order correctly as strings.
      return b.newest.analyzedAt.localeCompare(a.newest.analyzedAt);
    case "name":
      return a.newest.repoName.localeCompare(b.newest.repoName);
    case "largest":
      return b.newest.totalLoc - a.newest.totalLoc;
  }
}

/**
 * The index card grid with a client-side toolbar: free-text filter (the "/"
 * shortcut focuses it), language chips and a sort select. With fewer than
 * {@link TOOLBAR_MIN_CARDS} cards the toolbar is omitted and the grid renders
 * exactly as before — small workspaces and the fixture demo stay pristine.
 *
 * `defaultSort` mirrors the server's ordering per mode (cloud lists
 * newest-first, the fs source sorts by name), so the initial render is
 * pixel-identical to the unfiltered server list.
 */
export function AnalysisGrid({
  cards,
  defaultSort,
}: {
  cards: AnalysisCard[];
  defaultSort: SortKey;
}) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>(defaultSort);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToolbar = cards.length >= TOOLBAR_MIN_CARDS;

  // "/" jumps to the filter input, unless the user is already typing somewhere.
  useEffect(() => {
    if (!showToolbar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showToolbar]);

  // Language chips, most-used first. Hidden when everything shares one language.
  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) {
      const lang = c.newest.primaryLanguage;
      if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [cards]);

  const visible = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return cards
      .filter(
        (c) =>
          (language === null || c.newest.primaryLanguage === language) &&
          (tokens.length === 0 || matches(c.newest, tokens)),
      )
      .sort((a, b) => compare(a, b, sort));
  }, [cards, query, language, sort]);

  const filtering = query.trim() !== "" || language !== null;

  return (
    <>
      {showToolbar ? (
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 transition-colors focus-within:border-accent/35">
              <span className="text-faint">
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter analyses…"
                aria-label="Filter analyses"
                className="focus-quiet w-full bg-transparent py-2 text-sm text-text outline-none placeholder:text-faint"
              />
              <kbd className="shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[0.65rem] font-medium text-faint">
                /
              </kbd>
            </div>
            <div className="flex items-center gap-2 text-xs text-faint">
              Sort
              <SortSelect value={sort} onChange={setSort} />
            </div>
          </div>

          {languages.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                active={language === null}
                onClick={() => setLanguage(null)}
              >
                All
              </FilterChip>
              {languages.map(([lang, n]) => (
                <FilterChip
                  key={lang}
                  active={language === lang}
                  onClick={() => setLanguage(language === lang ? null : lang)}
                >
                  {lang}
                  <span
                    className={
                      language === lang ? "text-accent/70" : "text-faint"
                    }
                  >
                    {n}
                  </span>
                </FilterChip>
              ))}
            </div>
          ) : null}

          {filtering ? (
            <p className="text-xs text-faint" aria-live="polite">
              {visible.length} of {cards.length}{" "}
              {cards.length === 1 ? "analysis" : "analyses"}
            </p>
          ) : null}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-text">No matches</p>
          <p className="mt-1 text-sm text-muted">
            Nothing matches{query.trim() ? ` “${query.trim()}”` : ""}
            {language ? ` in ${language}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setLanguage(null);
            }}
            className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium text-muted transition hover:border-border-strong hover:text-text"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {visible.map((card) => (
            <AnalysisCardItem key={card.newest.id} card={card} />
          ))}
        </ul>
      )}
    </>
  );
}

const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];

/**
 * Custom sort dropdown replacing the native <select>, whose popup can't be
 * themed. Collapsed-focus listbox pattern: focus stays on the trigger button
 * (aria-activedescendant tracks the keyboard cursor), options are plain
 * role="option" rows, so no focus juggling is needed when the list closes.
 */
function SortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (k: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  // Keyboard cursor; seeded from the current value on every open.
  const [active, setActive] = useState<SortKey>(value);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when the user clicks/taps anywhere outside the control.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const openList = () => {
    setActive(value);
    setOpen(true);
  };

  const choose = (k: SortKey) => {
    onChange(k);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const i = SORT_KEYS.indexOf(active);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(SORT_KEYS[Math.min(i + 1, SORT_KEYS.length - 1)]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(SORT_KEYS[Math.max(i - 1, 0)]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="sort-listbox"
        aria-label="Sort analyses"
        aria-activedescendant={open ? `sort-option-${active}` : undefined}
        className="focus-quiet flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition hover:border-border-strong focus-visible:border-accent/35"
      >
        {SORT_LABELS[value]}
        <span
          className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}
        >
          <ChevronDownIcon />
        </span>
      </button>

      {open ? (
        <ul
          id="sort-listbox"
          role="listbox"
          aria-label="Sort analyses"
          className="absolute right-0 top-full z-20 mt-1.5 w-44 rounded-lg border border-border bg-surface p-1 shadow-lg shadow-black/10"
        >
          {SORT_KEYS.map((k) => (
            <li
              key={k}
              id={`sort-option-${k}`}
              role="option"
              aria-selected={k === value}
              onClick={() => choose(k)}
              onMouseMove={() => setActive(k)}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${
                k === active ? "bg-accent-soft text-accent" : "text-text"
              }`}
            >
              {SORT_LABELS[k]}
              {k === value ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M3 8.5 6.5 12 13 4.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
        active
          ? "border-accent/25 bg-accent-soft text-accent"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

/** One analysis card — markup unchanged from the original server-rendered grid. */
function AnalysisCardItem({ card: { newest: a, count } }: { card: AnalysisCard }) {
  const hasStats = a.totalFiles > 0 || a.totalLoc > 0;
  return (
    <li>
      <Link
        href={`/analysis/${a.id}`}
        className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition hover:border-border-strong hover:shadow-lg hover:shadow-black/5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-text transition group-hover:text-accent">
              {a.repoName}
            </h2>
            <p className="mt-0.5 text-xs text-faint">
              Analyzed {formatDate(a.analyzedAt)}
            </p>
          </div>
          {a.primaryLanguage ? (
            <Badge className="shrink-0 border-accent/25 bg-accent-soft text-accent">
              {a.primaryLanguage}
            </Badge>
          ) : null}
        </div>

        <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
          {snippet(a.summary, 200)}
        </p>

        <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-faint">
          {hasStats ? (
            <>
              <span>
                <span className="font-medium text-muted">
                  {compactNumber(a.totalFiles)}
                </span>{" "}
                files
              </span>
              <span>
                <span className="font-medium text-muted">
                  {compactNumber(a.totalLoc)}
                </span>{" "}
                LOC
              </span>
            </>
          ) : null}
          {a.tourSteps > 0 ? (
            <OnboardingProgressBadge
              analysisId={a.id}
              totalTourSteps={a.tourSteps}
              taskCount={a.firstTaskCount}
              progress={a.onboardingProgress}
            />
          ) : null}
          {count > 1 ? (
            <Badge className="border-border bg-surface-2 text-muted">
              {count} versions
            </Badge>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 font-medium text-accent opacity-0 transition group-hover:opacity-100">
            Explore
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M6 3.5 10.5 8 6 12.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </Link>
    </li>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m10.5 10.5 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
