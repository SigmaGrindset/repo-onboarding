import type { Metadata } from "next";
import "./globals.css";
import { isCloudMode } from "@/lib/mode";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Repo Onboarding",
  description:
    "Interactive onboarding for any codebase — architecture, guided tour, dependency graph, hotspots and setup, rendered from a single analysis.json.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tree = (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-bg text-text">
        <SiteHeader />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );

  // Local mode: no ClerkProvider, no Clerk keys, no network. Cloud mode wraps
  // the whole tree so auth context is available everywhere. `@clerk/nextjs` is
  // imported dynamically so local mode never evaluates it.
  if (!isCloudMode()) return tree;

  const { ClerkProvider } = await import("@clerk/nextjs");
  return <ClerkProvider>{tree}</ClerkProvider>;
}
