import { fileURLToPath } from "node:url";
import { defineBandwiseVitestConfig } from "@bandwise/config/vitest";

export default defineBandwiseVitestConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
});
