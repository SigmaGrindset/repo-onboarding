import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Repo Onboarding",
  description:
    "Interactive onboarding for any codebase — architecture, guided tour, dependency graph, hotspots and setup, rendered from a single analysis.json.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-bg text-text">
        {children}
      </body>
    </html>
  );
}
