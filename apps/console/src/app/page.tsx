// app.bandwise.dev before Phase 2 (ADR-018, decision 5): one page that sends visitors to the
// early-access form on www. The full console turns on when Phase 2 auth passes security review.

const EARLY_ACCESS_URL = "https://www.bandwise.dev/#early-access";

export default function HomePage() {
  return (
    <main style={{ maxWidth: "36rem", margin: "0 auto", padding: "6rem 1.25rem", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: "1.75rem", margin: "0 0 1rem" }}>The Bandwise console is in early access</h1>
      <p>
        Sign-in opens to early-access teams first. Ask for a spot and we will write to you when yours is ready.
      </p>
      <p>
        <a href={EARLY_ACCESS_URL} style={{ fontWeight: 600 }}>
          Request early access on www.bandwise.dev
        </a>
      </p>
    </main>
  );
}
