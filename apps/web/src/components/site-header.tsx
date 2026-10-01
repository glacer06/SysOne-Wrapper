import Link from "next/link";
import { docsUrl, kitUrl, productName } from "~/site";

/** The supplied horizontal lockup A (brand/marks), light or dark to match the theme. */
export function Lockup({ width = 168 }: { width?: number }) {
  // The lockup's viewBox is 2168 by 744.
  const height = Math.round((width * 744) / 2168);
  return (
    <picture className="lockup">
      <source srcSet="/brand/bandwise-lockup-horizontal-A-dark.svg" media="(prefers-color-scheme: dark)" />
      <img src="/brand/bandwise-lockup-horizontal-A-light.svg" alt={productName} width={width} height={height} />
    </picture>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="home-link" aria-label={`${productName} home`}>
          <Lockup width={160} />
        </Link>
        <nav className="site-nav" aria-label="Main">
          <Link href="/#how">How it works</Link>
          <Link href="/#calculator">Calculator</Link>
          <Link href="/#templates">Templates</Link>
          <a href={kitUrl}>Free kit</a>
          <a href={docsUrl}>Docs</a>
        </nav>
        <Link href="/#early-access" className="btn btn-primary btn-small">
          <span className="cta-long">Request early access</span>
          <span className="cta-short">Early access</span>
        </Link>
      </div>
    </header>
  );
}
