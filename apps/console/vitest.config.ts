import { fileURLToPath } from "node:url";
import { defineSysoneVitestConfig } from "@sysone/config/vitest";

export default defineSysoneVitestConfig({
  resolve: {
    alias: {
      // server-only throws outside a React Server Component bundle. Tests run in plain Node.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
