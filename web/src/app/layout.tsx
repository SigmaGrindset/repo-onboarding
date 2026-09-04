import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { isCloudMode } from "@/lib/mode";
import { siteUrl } from "@/lib/site";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

// Variable faces, so the 400/500/600/700 steps the UI uses are all drawn
// rather than synthesised. Exposed as CSS vars consumed by @theme in
// globals.css; `swap` keeps first paint readable on a cold cache.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const description =
  "Interactive onboarding for any codebase — architecture, guided tour, dependency graph, hotspots and setup, rendered from a single analysis.json.";

export const metadata: Metadata = {
  // Absolute base so file-convention OG/Twitter image URLs are fetchable by
  // social crawlers (Slack, Discord, X). Per-analysis routes override the rest.
  metadataBase: new URL(siteUrl()),
  title: "Repo Onboarding",
  description,
  openGraph: {
    title: "Repo Onboarding",
    description,
    siteName: "Repo Onboarding",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Repo Onboarding",
    description,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Stamps the resolved theme on <html> before first paint so a stored choice
  // never flashes the wrong palette. Runs before hydration, hence
  // suppressHydrationWarning on <html>.
  const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})()`;

  const tree = (
    <html
      lang="en"
      className={`h-full antialiased ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <a
          href="#content"
          className="skip-link rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text shadow-float"
        >
          Skip to content
        </a>
        <SiteHeader />
        <div id="content" className="flex-1">
          {children}
        </div>
        <SiteFooter />
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
