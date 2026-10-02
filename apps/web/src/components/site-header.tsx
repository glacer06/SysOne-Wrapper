import Link from "next/link";
import { docsUrl, kitUrl, productName } from "~/site";

/**
 * The header logo (Nick, 2026-10-01): the supplied primary lockup, mark A (the loaded ant on its
 * trail, carrying the B) with the lowercase wordmark, kit v1.7. One file per theme, switched in
 * global.css. The viewBox is 1798 by 408. The images are decorative: the home link carries the name.
 */
export function HeaderLockup() {
  return (
    <span className="header-lockup" aria-hidden="true">
      <img className="header-lockup-light" src="/brand/bandwise-lockup-horizontal-A-light.svg" alt="" width={1798} height={408} />
      <img className="header-lockup-dark" src="/brand/bandwise-lockup-horizontal-A-dark.svg" alt="" width={1798} height={408} />
    </span>
  );
}

/** Mark A (Ascent), the supplied file for light or dark. Its viewBox is 1104.72 by 1155 (brand kit v1.6 and later). */
export function MarkA({ width, className, alt = "" }: { width: number; className?: string; alt?: string }) {
  const height = Math.round((width * 1155) / 1104.72);
  return (
    <picture className={className}>
      <source srcSet="/brand/bandwise-mark-A-dark.svg" media="(prefers-color-scheme: dark)" />
      <img src="/brand/bandwise-mark-A-light.svg" alt={alt} width={width} height={height} />
    </picture>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="home-link" aria-label={`${productName} home`}>
          <HeaderLockup />
        </Link>
        <nav className="site-nav" aria-label="Main">
          <Link href="/#how">How it works</Link>
          <Link href="/#calculator">Calculator</Link>
          <Link href="/#templates">Templates</Link>
          <a href={kitUrl}>Free kit</a>
          <a href={docsUrl}>Docs</a>
        </nav>
        <span className="focus-poly">
          <Link href="/#early-access" className="btn btn-primary btn-small">
            <span className="cta-long">Request early access</span>
            <span className="cta-short">Early access</span>
          </Link>
        </span>
      </div>
    </header>
  );
}
