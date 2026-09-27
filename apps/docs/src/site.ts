// Brand, domain and links for the docs site. A rename is one edit here.
// Code identifiers the pages show (the `sysone` CLI, `@sysone/*` packages, SYSONE_* env vars)
// are the real names in the repo today and are not set here.

export const productName = "Bandwise";

/** Production docs origin. NEXT_PUBLIC_DOCS_URL overrides it; dev falls back to localhost. */
export const productionDocsUrl = "https://docs.bandwise.dev";

export const docsUrl = (
  process.env["NEXT_PUBLIC_DOCS_URL"] ??
  (process.env.NODE_ENV === "production" ? productionDocsUrl : "http://localhost:3001")
).replace(/\/+$/, "");

/** The source repository. Leave null to hide the GitHub link. */
export const githubUrl: string | null = null;

/** TypeSafe's own docs for the System One models. */
export const typesafeDocsUrl = "https://docs.typesafe.ai";

export const tagline = "Versioned question sets over TypeSafe's System One models, with confidence bands, rollout and a cost ledger.";

/** Shown in the footer of every page. */
export const independenceNote = `${productName} is an independent product built on TypeSafe's System One models. It is not TypeSafe's documentation.`;

/** The phase the HTTP API goes live in. */
export const apiLivePhase = 3;
