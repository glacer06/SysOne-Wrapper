import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { productName, siteUrl, tagline } from "~/site";
// Brand tokens first, then the system dark bridge, then the site's own rules (ADR-022).
import "@bandwise/brand/tokens.css";
import "@bandwise/brand/theme.css";
import "./global.css";

// The brand's three faces (DESIGN.md), OFL, bundled from @fontsource-variable so the build never
// fetches fonts over the network. Archivo carries its width axis for the 125% display stretch.
const display = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2",
  weight: "100 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-archivo",
  display: "swap",
});
const body = localFont({
  src: "../../node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2",
  weight: "400 900",
  style: "normal",
  variable: "--font-schibsted",
  display: "swap",
});
const mono = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
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
