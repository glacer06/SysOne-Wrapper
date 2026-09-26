import { defineSysoneVitestConfig } from "@sysone/config/vitest";

// Each test file boots its own PGlite database and applies migration 0001, which takes a few
// seconds and more under a parallel turbo run. The longer hook timeout covers that start-up.
export default defineSysoneVitestConfig({
  test: {
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
