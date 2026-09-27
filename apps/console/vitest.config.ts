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
});
