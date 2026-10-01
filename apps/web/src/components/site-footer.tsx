import Link from "next/link";
import { appUrl, docsUrl, independenceNote, kitUrl, npmUrl, productName } from "~/site";

// The muted version stamp at the end of the legal row: the commit this build came from (Vercel sets
// VERCEL_GIT_COMMIT_SHA) and the build date. The footer is a server component, so this runs at build.
const commit = (process.env["VERCEL_GIT_COMMIT_SHA"] ?? "local").slice(0, 7);
const buildStamp = `build ${commit} · ${new Date().toISOString().slice(0, 10)}`;

type FooterLink = { label: string; href: string; mono?: boolean };

const columns: ReadonlyArray<{ title: string; links: readonly FooterLink[] }> = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Calculator", href: "/#calculator" },
      { label: "Templates", href: "/#templates" },
      { label: "Early access", href: "/#early-access" },
    ],
  },
  {
    title: "Docs",
    links: [
      { label: "Docs home", href: docsUrl },
      { label: "Quickstart", href: `${docsUrl}/docs/quickstart` },
      { label: "CLI reference", href: `${docsUrl}/docs/cli` },
      { label: "Find decisions", href: `${docsUrl}/docs/find-decisions` },
    ],
  },
  {
    title: "Agents",
    links: [
      { label: "llms.txt", href: "/llms.txt", mono: true },
      { label: "openapi.json", href: `${appUrl}/api/v1/openapi.json`, mono: true },
      { label: "MCP", href: `${docsUrl}/docs/agents-and-mcp`, mono: true },
    ],
  },
  {
    title: "Kit",
    links: [
      { label: "bandwise-kit on GitHub", href: kitUrl },
      { label: "@bandwise/cli on npm", href: npmUrl("@bandwise/cli") },
      { label: "Docs for LLMs", href: `${docsUrl}/llms.txt` },
    ],
  },
];

function FooterAnchor({ link }: { link: FooterLink }) {
  const className = link.mono ? "data" : undefined;
  return link.href.startsWith("/") && !link.href.endsWith(".txt") ? (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  ) : (
    <a href={link.href} className={className}>
      {link.label}
    </a>
  );
}

/** Link columns first, then the supplied horizontal lockup across the full content width, then the legal row. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <nav aria-label="Footer" className="footer-cols">
          {columns.map((c) => (
            <div key={c.title} className="footer-col">
              <h2 className="label">{c.title}</h2>
              <ul>
                {c.links.map((l) => (
                  <li key={l.label}>
                    <FooterAnchor link={l} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <Link href="/" className="footer-lockup" aria-label={`${productName} home`}>
          {/* The supplied horizontal lockup with mark C (Scout), light or dark. viewBox 1926 by 744. */}
          <picture>
            <source srcSet="/brand/bandwise-lockup-horizontal-C-dark.svg" media="(prefers-color-scheme: dark)" />
            <img src="/brand/bandwise-lockup-horizontal-C-light.svg" alt="" width={1926} height={744} />
          </picture>
        </Link>

        <div className="footer-notes">
          <p className="independence">{independenceNote}</p>
          <p className="footer-meta">Jev and System One are names of TypeSafe models.</p>
        </div>

        <div className="footer-legal">
          <p>&copy; 2026 {productName}</p>
          <ul>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/terms">Terms</Link>
            </li>
          </ul>
          <p className="footer-stamp data">{buildStamp}</p>
        </div>
      </div>
    </footer>
  );
}
