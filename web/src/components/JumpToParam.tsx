"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Scrolls to `#<prefix><value>` whenever the `param` query value changes and
 * flashes the target. Lets the command palette deep-link into server-rendered
 * lists (architecture sections, codebase-map entries) with a plain query
 * param — same-page jumps work because useSearchParams re-fires on push.
 */
export function JumpToParam({
  param,
  prefix = "",
}: {
  param: string;
  prefix?: string;
}) {
  const value = useSearchParams().get(param);

  useEffect(() => {
    if (!value) return;
    const el = document.getElementById(`${prefix}${value}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("jump-flash");
    const t = setTimeout(() => el.classList.remove("jump-flash"), 1600);
    return () => clearTimeout(t);
  }, [value, prefix]);

  return null;
}
