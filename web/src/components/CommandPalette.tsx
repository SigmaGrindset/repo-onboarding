"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchItem } from "@/lib/search-index";

const GROUP_ORDER: SearchItem["group"][] = [
  "Sections",
  "Architecture",
  "Codebase Map",
  "Guided Tour",
  "Hotspots",
];

/**
 * Rank an item against the query tokens. Every token must match somewhere;
 * label matches outrank hidden-keyword matches so "map" surfaces the
 * Codebase Map section before files that merely mention it. -1 = no match.
 */
function score(item: SearchItem, tokens: string[]): number {
  const label = item.label.toLowerCase();
  const rest = `${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  let total = 0;
  for (const t of tokens) {
    if (label.startsWith(t)) total += 3;
    else if (label.includes(t)) total += 2;
    else if (rest.includes(t)) total += 1;
    else return -1;
  }
  return total;
}

/**
 * Cmd+K / Ctrl+K search over everything in the current analysis: sections,
 * architecture sections, codebase-map entries, tour steps and hotspots.
 * Renders its own sidebar trigger button; the dialog is a portal-free fixed
 * overlay. Selecting an item pushes its deep-link href.
 */
export function CommandPalette({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // ⌘ on Apple platforms. Server-rendered as "Ctrl"; the hydration mismatch
  // on Macs is intentional, hence suppressHydrationWarning on the <kbd>.
  const modKey =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? "⌘"
      : "Ctrl";

  // Closing resets the query, so every open starts fresh.
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelected(0);
  }, []);

  // Global shortcut: Cmd/Ctrl+K toggles, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else setOpen(true);
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Lock page scroll behind the dialog.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const groups = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matched =
      tokens.length === 0
        ? items.map((item) => ({ item, s: 0 }))
        : items
            .map((item) => ({ item, s: score(item, tokens) }))
            .filter((m) => m.s >= 0);

    return GROUP_ORDER.map((group) => ({
      group,
      items: matched
        .filter((m) => m.item.group === group)
        .sort((a, b) => b.s - a.s)
        .map((m) => m.item),
    })).filter((g) => g.items.length > 0);
  }, [items, query]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Keep the keyboard cursor visible while arrowing through results.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const go = (item: SearchItem) => {
    close();
    router.push(item.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[selected];
      if (item) go(item);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-faint transition hover:border-border-strong hover:text-muted"
      >
        <SearchIcon />
        <span className="flex-1 text-left">Search analysis…</span>
        <kbd
          suppressHydrationWarning
          className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[0.65rem] font-medium text-faint"
        >
          {modKey} K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search this analysis"
            onClick={(e) => e.stopPropagation()}
            className="mx-auto mt-[10vh] w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <span className="text-faint">
                <SearchIcon />
              </span>
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Jump to a section, tour step, directory or hotspot…"
                aria-label="Search this analysis"
                className="w-full bg-transparent py-3.5 text-sm text-text outline-none placeholder:text-faint"
              />
              <kbd className="shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[0.65rem] font-medium text-faint">
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
              {flat.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-faint">
                  No matches for “{query}”.
                </p>
              ) : (
                groups.map((g) => {
                  // Index of this group's first item in the flattened list.
                  let idx = 0;
                  for (const other of groups) {
                    if (other === g) break;
                    idx += other.items.length;
                  }
                  return (
                    <div key={g.group} className="mb-1">
                      <div className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
                        {g.group}
                      </div>
                      {g.items.map((item, j) => {
                        const i = idx + j;
                        const active = i === selected;
                        return (
                          <button
                            key={item.href + item.label}
                            type="button"
                            data-idx={i}
                            onClick={() => go(item)}
                            onMouseMove={() => setSelected(i)}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                              active
                                ? "bg-accent-soft text-accent"
                                : "text-text"
                            }`}
                          >
                            <span
                              className={`min-w-0 flex-1 truncate ${
                                g.group === "Codebase Map" ||
                                g.group === "Hotspots"
                                  ? "font-mono text-[0.8rem]"
                                  : ""
                              }`}
                            >
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span
                                className={`shrink-0 text-xs ${
                                  active ? "text-accent/80" : "text-faint"
                                }`}
                              >
                                {item.hint}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m10.5 10.5 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
