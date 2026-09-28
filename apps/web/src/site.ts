// Product name and URLs in one place, so a rename or a new domain is one edit.
export const productName = "Bandwise";
export const siteUrl = process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://www.bandwise.dev";
export const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "https://app.bandwise.dev";
export const earlyAccessEndpoint = `${appUrl}/api/public/early-access`;
export const docsUrl = "https://docs.bandwise.dev";
export const kitUrl = "https://github.com/glacer06/bandwise-kit";
export const privacyEmail = "privacy@bandwise.dev";
export const npmPackages = [
  { name: "@bandwise/cli", what: "The bandwise command. Runs a spec on your machine with no key." },
  { name: "@bandwise/core", what: "Spec format, compiler, confidence router, cost and savings math." },
  { name: "@bandwise/templates", what: "Nine ready question sets with example and borderline states." },
] as const;
export const npmUrl = (pkg: string) => `https://www.npmjs.com/package/${pkg}`;
export const tagline = "Versioned decisions on TypeSafe's System One models, with confidence bands, rollout and a bill you can read.";
export const independenceNote =
  "Bandwise is an independent product built on TypeSafe's System One models. It is not made or endorsed by TypeSafe.";
