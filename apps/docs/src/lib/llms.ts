// llms.txt and llms-full.txt, generated from the same page tree as the site.

import { llms } from "fumadocs-core/source";
import { docsUrl, independenceNote, productName, tagline, typesafeDocsUrl } from "~/site";
import { apiPageOperations, source } from "./source";

export const docsLlms = llms(source, {
  renderPage: async (page) => {
    if (page.type === "openapi") {
      const { label, lines } = apiPageOperations(page);
      return `# ${page.data.title} (${page.url})

Not live yet. This part of the HTTP API is available from ${label}.

${lines.join("\n")}`;
    }
    return `# ${page.data.title} (${page.url})

${await page.data.getText("processed")}`;
  },
});

function header(): string {
  return `# ${productName} docs

> ${tagline}

${independenceNote} For the System One models themselves, see ${typesafeDocsUrl}/llms.txt.`;
}

/** Turn site-relative links such as (/docs/quickstart) into absolute ones. */
export function absolutize(markdown: string): string {
  return markdown.replace(/\]\((\/[^)\s]*)\)/g, (_m, path: string) => `](${docsUrl}${path})`);
}

export async function llmsIndex(): Promise<string> {
  return `${header()}\n\n${absolutize(await docsLlms.index())}\n`;
}

export async function llmsFull(): Promise<string> {
  return `${header()}\n\n${await docsLlms.full()}\n`;
}
