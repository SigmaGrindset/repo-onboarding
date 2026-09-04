"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";
/** What the user picked. "system" means "no stored choice — follow the OS". */
type Choice = Theme | "system";

const STORAGE_KEY = "theme";

function osTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readChoice(): Choice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/* localStorage fires no event in the tab that wrote it, so writes go through
   this tiny notifier; `storage` covers the other tabs. */
let listeners: (() => void)[] = [];
function notify() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.push(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
    window.removeEventListener("storage", onChange);
  };
}

const OPTIONS: { value: Choice; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <IconSun /> },
  { value: "system", label: "System", icon: <IconSystem /> },
  { value: "dark", label: "Dark", icon: <IconMoon /> },
];

/**
 * Three-state theme control — light / follow the system / dark — instead of a
 * two-state sun-moon flip. "Follow the system" already existed as the implicit
 * default (no stored key); this makes it a state the reader can actually
 * return to once they have picked a side.
 *
 * The <html data-theme> attribute stays the single source of truth for the
 * resolved palette (stamped before paint by the inline script in layout.tsx);
 * this component only writes the *choice* and derives the attribute from it.
 * Nothing renders as selected until hydration — the server cannot know.
 */
export function ThemeToggle() {
  const choice = useSyncExternalStore(
    subscribe,
    readChoice,
    (): Choice | null => null,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    // Live OS changes apply only while the choice is "system".
    const onOsChange = () => {
      if (readChoice() !== "system") return;
      applyTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onOsChange);

    // A change in another tab updates this one too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      applyTheme(
        e.newValue === "light" || e.newValue === "dark"
          ? e.newValue
          : mq.matches
            ? "dark"
            : "light",
      );
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mq.removeEventListener("change", onOsChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const select = useCallback((next: Choice) => {
    applyTheme(next === "system" ? osTheme() : next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    notify();
  }, []);

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
    >
      {OPTIONS.map((option) => {
        const selected = choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            aria-pressed={selected}
            title={`${option.label} theme`}
            aria-label={`${option.label} theme`}
            className={`press flex h-6 w-7 items-center justify-center rounded-md ${
              selected
                ? "bg-surface text-accent shadow-soft"
                : "text-faint hover:text-text"
            }`}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}

/* -- icons (14px, currentColor, uniform 1.5 stroke) -------------------- */

function icon(children: React.ReactNode) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function IconSun() {
  return icon(
    <>
      <circle cx="8" cy="8" r="2.6" />
      <path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
    </>,
  );
}

function IconSystem() {
  return icon(
    <>
      <rect x="1.8" y="3" width="12.4" height="8" rx="1.4" />
      <path d="M6 13.5h4" />
    </>,
  );
}

function IconMoon() {
  return icon(<path d="M13.5 9.4A5.8 5.8 0 0 1 6.6 2.5a5.8 5.8 0 1 0 6.9 6.9z" />);
}
