import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { docsUrl, productName, tagline } from "~/site";
import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL(docsUrl),
  title: { default: `${productName} docs`, template: `%s | ${productName} docs` },
  description: tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
