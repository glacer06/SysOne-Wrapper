import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import tokens from "@bandwise/brand/tokens.json";

// The brand's three faces (DESIGN.md), self-hosted at build by next/font. Archivo needs the width
// axis for its 125% display stretch.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Bandwise console",
  description: "Manage System One question sets, rollouts and savings.",
  // Nothing here is public content. The marketing site is www.bandwise.dev.
  robots: { index: false, follow: false },
};

// The browser bar takes the page background: the brand's bg token, read from the kit's DTCG file.
const bg = tokens.color.semantic.bg;
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: bg.light.$value },
    { media: "(prefers-color-scheme: dark)", color: bg.dark.$value },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${schibsted.variable} ${jetbrains.variable}`}>
      <body className="bg-bw-bg text-bw-text antialiased">{children}</body>
    </html>
  );
}
