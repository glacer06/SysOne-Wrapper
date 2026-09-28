import type { MetadataRoute } from "next";
import { siteUrl } from "~/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-09-28");
  return [
    { url: `${siteUrl}/`, lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/privacy`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
  ];
}
