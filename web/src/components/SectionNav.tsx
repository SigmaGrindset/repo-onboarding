"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ANALYSIS_SECTIONS } from "@/lib/sections";

const ICONS: Record<string, ReactNode> = {
  "": <IconOverview />,
  architecture: <IconArchitecture />,
  graph: <IconGraph />,
  map: <IconMap />,
  guide: <IconGuide />,
  tour: <IconTour />,
  hotspots: <IconHotspots />,
  setup: <IconSetup />,
  tasks: <IconTasks />,
  versions: <IconVersions />,
};

export function SectionNav({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/analysis/${id}`;
  const navRef = useRef<HTMLElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  const updateScrollEdges = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;

    const maxScrollLeft = Math.max(0, nav.scrollWidth - nav.clientWidth);
    const next = {
      left: nav.scrollLeft > 1,
      right: nav.scrollLeft < maxScrollLeft - 1,
    };
    setScrollEdges((current) =>
      current.left === next.left && current.right === next.right ? current : next,
    );
  }, []);

  const scrollLinkIntoView = useCallback(
    (link: HTMLAnchorElement, behavior: ScrollBehavior) => {
      const nav = navRef.current;
      if (!nav || nav.scrollWidth <= nav.clientWidth) {
        updateScrollEdges();
        return;
      }

      const maxScrollLeft = nav.scrollWidth - nav.clientWidth;
      const centeredLeft = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2;
      nav.scrollTo({
        left: Math.min(maxScrollLeft, Math.max(0, centeredLeft)),
        behavior,
      });
    },
    [updateScrollEdges],
  );

  const preferredScrollBehavior = useCallback((): ScrollBehavior => {
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return reduceMotion ? "auto" : "smooth";
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (activeLinkRef.current) {
        scrollLinkIntoView(activeLinkRef.current, preferredScrollBehavior());
      }
      updateScrollEdges();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, preferredScrollBehavior, scrollLinkIntoView, updateScrollEdges]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const handleResize = () => {
      if (activeLinkRef.current) {
        scrollLinkIntoView(activeLinkRef.current, "auto");
      }
      updateScrollEdges();
    };
    nav.addEventListener("scroll", updateScrollEdges, { passive: true });
    window.addEventListener("resize", handleResize);
    updateScrollEdges();

    return () => {
      nav.removeEventListener("scroll", updateScrollEdges);
      window.removeEventListener("resize", handleResize);
    };
  }, [scrollLinkIntoView, updateScrollEdges]);

  return (
    <div className="relative min-w-0">
      <nav
        ref={navRef}
        aria-label="Analysis sections"
        className="flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {ANALYSIS_SECTIONS.map((s) => {
          const href = s.slug ? `${base}/${s.slug}` : base;
          const active =
            s.slug === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              ref={active ? activeLinkRef : undefined}
              key={s.slug || "overview"}
              href={href}
              aria-current={active ? "page" : undefined}
              onFocus={(event) =>
                scrollLinkIntoView(event.currentTarget, preferredScrollBehavior())
              }
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <span
                className={`shrink-0 ${active ? "text-accent" : "text-faint"}`}
              >
                {ICONS[s.slug]}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
            </Link>
          );
        })}
      </nav>

      <span
        aria-hidden
        data-scroll-edge="left"
        data-visible={scrollEdges.left}
        className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-bg to-transparent transition-opacity lg:hidden ${
          scrollEdges.left ? "opacity-100" : "opacity-0"
        }`}
      />
      <span
        aria-hidden
        data-scroll-edge="right"
        data-visible={scrollEdges.right}
        className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-bg to-transparent transition-opacity lg:hidden ${
          scrollEdges.right ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/* -- inline icons (16px, currentColor) --------------------------------- */

function svg(children: ReactNode) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}
function IconOverview() {
  return svg(
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>,
  );
}
function IconArchitecture() {
  return svg(
    <>
      <rect x="5.5" y="1.5" width="5" height="4" rx="1" />
      <rect x="1.5" y="10.5" width="5" height="4" rx="1" />
      <rect x="9.5" y="10.5" width="5" height="4" rx="1" />
      <path d="M8 5.5v2M8 7.5H4v3M8 7.5h4v3" />
    </>,
  );
}
function IconGraph() {
  return svg(
    <>
      <circle cx="3.5" cy="3.5" r="2" />
      <circle cx="12.5" cy="4" r="2" />
      <circle cx="8" cy="12.5" r="2" />
      <path d="M5 4.5 11 4M4.5 5.5 7 10.5M11.5 6 9 11" />
    </>,
  );
}
function IconMap() {
  return svg(
    <>
      <path d="M2 3.5 6 2l4 1.5L14 2v10l-4 1.5L6 12l-4 1.5z" />
      <path d="M6 2v10M10 3.5v10" />
    </>,
  );
}
function IconTour() {
  return svg(
    <>
      <path d="M8 2v9" />
      <circle cx="8" cy="13" r="1.3" />
      <path d="M8 3.5h4.5v3H8" />
    </>,
  );
}
function IconGuide() {
  return svg(
    <>
      <path d="M3 2.5h7.5A1.5 1.5 0 0 1 12 4v9.5H4.5A1.5 1.5 0 0 1 3 12z" />
      <path d="M3 12a1.5 1.5 0 0 1 1.5-1.5H12M6 5h3M6 7.5h3" />
    </>,
  );
}
function IconHotspots() {
  return svg(
    <>
      <path d="M8 1.5c1.5 2 3.5 3.2 3.5 6a3.5 3.5 0 1 1-7 0c0-1.4.6-2.4 1.4-3.4.3 1 1 1.5 1.6 1.7-.4-2 .2-3.5.5-4.3z" />
    </>,
  );
}
function IconSetup() {
  return svg(
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
    </>,
  );
}
function IconTasks() {
  return svg(
    <>
      <rect x="2.5" y="2" width="11" height="12" rx="1.5" />
      <path d="M5 5.5l1 1 2-2M5 10l1 1 2-2M10 5h1.5M10 10h1.5" />
    </>,
  );
}
function IconVersions() {
  return svg(
    <>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M2.5 2v2.5H5" />
      <path d="M8 5v3l2 1.2" />
    </>,
  );
}
