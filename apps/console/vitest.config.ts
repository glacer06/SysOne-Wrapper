import { fileURLToPath } from "node:url";
import { defineBandwiseVitestConfig } from "@bandwise/config/vitest";

export default defineBandwiseVitestConfig({
  resolve: {
    alias: {
      // server-only throws outside a React Server Component bundle. Tests run in plain Node.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    server: {
      deps: {
        // The auth library loads this package's ESM build, which uses directory imports that
        // plain Node refuses. Vite resolves them when it transforms the package itself.
        inline: [/better-auth/, /@opentelemetry\/semantic-conventions/],
      },
    },
  },
});
