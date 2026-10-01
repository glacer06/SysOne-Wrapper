import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { docsUrl, productName, tagline } from "~/site";
import "./global.css";

const body = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
const heading = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-heading", display: "swap" });
const code = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-code", display: "swap" });

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
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
