"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Top-bar link that knows whether it is the page you are on. Without this the
 * header gives no sense of place — every destination looks equally unvisited.
 * The current page is marked for assistive tech (`aria-current`) and drawn with
 * a hairline underline rather than a filled pill, so it stays quiet.
 */
export function HeaderLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`press relative py-1 text-[0.8rem] font-medium ${
        active ? "text-text" : "text-muted hover:text-text"
      }`}
    >
      {children}
      <span
        aria-hidden
        className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-accent transition-transform duration-200 ${
          active ? "scale-x-100" : "scale-x-0"
        }`}
      />
    </Link>
  );
}
