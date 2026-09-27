import type { Metadata } from "next";
import type { ReactNode } from "react";
import { productName, siteUrl, tagline } from "~/site";
import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: productName,
  description: tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
