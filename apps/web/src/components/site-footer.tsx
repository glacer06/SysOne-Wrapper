import Link from "next/link";
import { docsUrl, independenceNote, kitUrl } from "~/site";
import { Lockup } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Lockup width={160} />
          <p className="independence">{independenceNote}</p>
          <p className="footer-meta">Jev and System One are names of TypeSafe models.</p>
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
