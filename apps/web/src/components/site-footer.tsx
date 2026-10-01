import Link from "next/link";
import { docsUrl, independenceNote, kitUrl, productName } from "~/site";
import { MarkA, Wordmark } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <MarkA width={120} className="footer-mark" />
          <div className="footer-brand-text">
            <Link href="/" className="home-link" aria-label={`${productName} home`}>
              <Wordmark />
            </Link>
            <p className="independence">{independenceNote}</p>
            <p className="footer-meta">Jev and System One are names of TypeSafe models.</p>
          </div>
        </div>
        <nav aria-label="Footer">
          <ul className="footer-links">
            <li>
              <a href={docsUrl}>Docs</a>
            </li>
            <li>
              <a href={kitUrl}>Free kit on GitHub</a>
            </li>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/terms">Terms</Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
