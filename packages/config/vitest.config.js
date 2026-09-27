// @ts-check
import { defineBandwiseVitestConfig } from "./vitest/index.js";

export default defineBandwiseVitestConfig({
  test: {
    // The boundary test runs ESLint over real files, which takes a few seconds on a cold cache.
    testTimeout: 60_000,
  },
});
