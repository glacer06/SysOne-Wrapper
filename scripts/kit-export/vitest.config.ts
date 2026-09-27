import { defineBandwiseVitestConfig } from "@bandwise/config/vitest";

export default defineBandwiseVitestConfig({
  test: {
    // The export test writes the whole kit tree to a temp folder and parses every source file.
    testTimeout: 60_000,
  },
});
