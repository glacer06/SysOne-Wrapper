import { createFromSource } from "fumadocs-core/search/server";
import { source } from "~/lib/source";

// Fumadocs built-in search over every page, including the generated API pages.
export const { GET } = createFromSource(source);
