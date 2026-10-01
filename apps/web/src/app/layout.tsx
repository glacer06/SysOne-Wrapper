import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { productName, siteUrl, tagline } from "~/site";
// Brand tokens first, then the system dark bridge, then the site's own rules (ADR-022).
import "@bandwise/brand/tokens.css";
import "@bandwise/brand/theme.css";
import "./global.css";

// Archivo needs its width axis for the 125% display stretch.
const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const body = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-schibsted",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${productName}: small model, heavy lifting`,
    template: `%s | ${productName}`,
  },
  description: tagline,
  applicationName: productName,
  openGraph: {
    type: "website",
    siteName: productName,
    url: siteUrl,
    title: `${productName}: small model, heavy lifting`,
    description: tagline,
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

// The page background in each theme: --bw-bg from the brand tokens. Metadata cannot read CSS
// variables, so the two values are restated here.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F5F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1417" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
