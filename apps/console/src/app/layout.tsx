import "./globals.css";

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import tokens from "@bandwise/brand/tokens.json";

// The brand's three faces (DESIGN.md), OFL, bundled from @fontsource-variable so the build never
// fetches fonts over the network. Archivo carries its width axis for the 125% display stretch.
const archivo = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2",
  weight: "100 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-archivo",
  display: "swap",
});
const schibsted = localFont({
  src: "../../node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2",
  weight: "400 900",
  style: "normal",
  variable: "--font-schibsted",
  display: "swap",
});
const jetbrains = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
  variable: "--font-jetbrains",
  display: "swap",
});

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
