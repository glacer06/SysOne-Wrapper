import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { githubUrl, productName } from "~/site";

/**
 * The nav title is the header logo (Nick, 2026-10-01): the supplied primary lockup, mark A (the
 * loaded ant on its trail, carrying the B) with the lowercase wordmark, kit v1.7. One file per
 * theme, switched with the docs `dark` class in global.css. The viewBox is 1798 by 408. The hidden
 * image is out of the accessibility tree, so the shown one's alt names the home link.
 */
function HeaderLogo() {
  return (
    <span className="bw-header-logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bw-header-logo-light" src="/brand/bandwise-lockup-horizontal-A-light.svg" alt={`${productName} docs`} width={1798} height={408} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bw-header-logo-dark" src="/brand/bandwise-lockup-horizontal-A-dark.svg" alt={`${productName} docs`} width={1798} height={408} />
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <HeaderLogo />,
    },
    ...(githubUrl === null ? {} : { githubUrl }),
  };
}
