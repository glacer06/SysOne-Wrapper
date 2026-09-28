import Link from "next/link";
import { docsUrl, kitUrl, productName } from "~/site";

/** The mark: a short measuring staff with its top range filled, drawn in the ink and signal colors. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="20" height="20" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.75" y="1.75" width="18.5" height="7" fill="var(--signal)" />
      <path d="M1 8.75h20M1 13.5h20" stroke="currentColor" strokeWidth="1.25" />
      <path d="M6 13.5v7.5M11 13.5v7.5M16 13.5v7.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="wordmark" aria-label={`${productName} home`}>
          <Mark />
          {productName}
        </Link>
        <nav className="site-nav" aria-label="Main">
          <Link href="/#how">How it works</Link>
          <Link href="/#calculator">Calculator</Link>
          <Link href="/#templates">Templates</Link>
          <a href={kitUrl}>Free kit</a>
          <a href={docsUrl}>Docs</a>
        </nav>
        <Link href="/#early-access" className="btn btn-primary btn-small">
          Request early access
        </Link>
      </div>
    </header>
  );
}
