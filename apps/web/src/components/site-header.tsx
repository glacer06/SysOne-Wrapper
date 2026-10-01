import Link from "next/link";
import { docsUrl, kitUrl, productName } from "~/site";

/** The typed wordmark: lowercase Archivo display. The ant marks appear at size elsewhere. */
export function Wordmark() {
  return <span className="wordmark">bandwise</span>;
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
