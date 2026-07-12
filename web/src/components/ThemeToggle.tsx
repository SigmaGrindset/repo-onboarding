"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function resolvedTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/* The <html data-theme> attribute is the single source of truth (stamped
   before paint by the inline script in layout.tsx), so the component reads it
   as an external store and re-renders whenever it changes. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

/**
 * Sun/moon theme switch. Flips <html data-theme> and persists the explicit
 * choice; until the user makes one, the page keeps following the OS
 * preference. The icon renders only after hydration — the server can't know
 * the resolved theme.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    resolvedTheme,
    (): Theme | null => null,
  );

  useEffect(() => {
    // Follow live OS changes only while there is no explicit choice. The
    // attribute mutation re-renders this (and re-renders Mermaid diagrams).
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOsChange = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem("theme");
      } catch {}
      if (stored === "light" || stored === "dark") return;
      applyTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onOsChange);

    // A toggle in another tab updates this one too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "theme") return;
      if (e.newValue === "light" || e.newValue === "dark") {
        applyTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mq.removeEventListener("change", onOsChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = () => {
    const next: Theme = resolvedTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-text"
    >
      {theme === "dark" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : theme === "light" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : null}
    </button>
  );
}
