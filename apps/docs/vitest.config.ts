import { fileURLToPath } from "node:url";
import { defineBandwiseVitestConfig } from "@bandwise/config/vitest";
import { fumadocsMdx } from "fumadocs-mdx/vite";

// The Fumadocs MDX plugin compiles the defineDocs() macro and the MDX pages, so tests load the
// same content source the site builds from.
export default defineBandwiseVitestConfig({
  plugins: [fumadocsMdx()],
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    testTimeout: 60_000,
  },
});
