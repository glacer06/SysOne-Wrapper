import Link from "next/link";
import { docsUrl, kitUrl, productName } from "~/site";

/**
 * The header pairing (Nick, 2026-10-01): the unloaded side-view ant facing right, then the typed
 * wordmark in lowercase Archivo display. The ant is the supplied file for light or dark, cropped by
 * its box to the ant above its trail (the drawing's units 236 to 1250 across, 518 to 875 down).
 * It is decorative: the home link carries the name.
 */
export function Wordmark() {
  return (
    <span className="wordmark-pair">
      <span className="header-ant" aria-hidden="true">
        <picture>
          <source srcSet="/brand/bandwise-ant-unloaded-A-r4-right-dark.svg" media="(prefers-color-scheme: dark)" />
          <img src="/brand/bandwise-ant-unloaded-A-r4-right-light.svg" alt="" width={74} height={74} />
        </picture>
      </span>
      <span className="wordmark">bandwise</span>
    </span>
  );
}

/** Mark A (Ascent), the supplied file for light or dark. Its viewBox is 1104.72 by 1044.77. */
export function MarkA({ width, className, alt = "" }: { width: number; className?: string; alt?: string }) {
  const height = Math.round((width * 1044.77) / 1104.72);
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
          <Wordmark />
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
