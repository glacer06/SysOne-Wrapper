import { defineBandwiseVitestConfig } from "@bandwise/config/vitest";

export default defineBandwiseVitestConfig({
  test: {
    // The export test writes the whole kit tree to a temp folder and parses every source file.
    // The export runs in beforeAll, so the hook needs the same room as the tests on a busy runner.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
