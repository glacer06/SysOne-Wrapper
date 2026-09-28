import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Bandwise console",
  description: "Manage System One question sets, rollouts and savings.",
  // Nothing here is public content until Phase 2. The marketing site is www.bandwise.dev.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, system-ui, sans-serif", colorScheme: "light dark" }}>{children}</body>
    </html>
  );
}
