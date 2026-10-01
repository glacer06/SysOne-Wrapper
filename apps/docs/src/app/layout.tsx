import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { docsUrl, productName, tagline } from "~/site";
import "./global.css";

// The brand's three faces (DESIGN.md), OFL, bundled from @fontsource-variable so the build never
// fetches fonts over the network. Archivo carries its width axis for the 125% display stretch.
const heading = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2",
  weight: "100 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-heading",
  display: "swap",
});
const body = localFont({
  src: "../../node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2",
  weight: "400 900",
  style: "normal",
  variable: "--font-body",
  display: "swap",
});
const code = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
  variable: "--font-code",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(docsUrl),
  title: { default: `${productName} docs`, template: `%s | ${productName} docs` },
  description: tagline,
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon-180.png",
  },
  openGraph: { images: ["/opengraph-image.png"] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} ${code.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        {/* The toggle sets the fumadocs `dark` class and the brand `data-theme` together. */}
        <RootProvider theme={{ attribute: ["class", "data-theme"] }}>{children}</RootProvider>
      </body>
    </html>
  );
}
