// The MDX collection. Fumadocs MDX evaluates this module on its own to find the collection, so
// it imports only packages and relative paths (no "~" alias) and nothing heavy.

import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { applyMdxPreset } from "fumadocs-mdx/config";
import { defineDocs } from "fumadocs-mdx/macro";
import { remarkProductName, withProductName } from "./remark-product";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema.transform((page) => ({
      ...page,
      title: withProductName(page.title),
      description: page.description === undefined ? undefined : withProductName(page.description),
    })),
    // Keep the Fumadocs preset (headings, structured data for search, code blocks) and run the
    // product name plugin before it.
    mdxOptions: applyMdxPreset({
      remarkPlugins: (defaults) => [remarkProductName, ...defaults],
    }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});
