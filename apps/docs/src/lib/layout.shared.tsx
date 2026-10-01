import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { githubUrl, productName } from "~/site";

/**
 * The nav title is the header pairing (Nick, 2026-10-01): the unloaded side-view ant facing right
 * (brand/unloaded, one file per theme, cropped above its trail in global.css), then the typed
 * wordmark, lowercase Archivo expanded 800. The ant is decorative.
 */
function Wordmark() {
  return (
    <span className="bw-wordmark-pair" aria-label={`${productName} docs`}>
      <span className="bw-header-ant" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bw-header-ant-light" src="/brand/bandwise-ant-unloaded-A-r4-right-light.svg" alt="" width={64} height={64} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bw-header-ant-dark" src="/brand/bandwise-ant-unloaded-A-r4-right-dark.svg" alt="" width={64} height={64} />
      </span>
      <span className="bw-wordmark">bandwise</span>
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Wordmark />,
    },
    ...(githubUrl === null ? {} : { githubUrl }),
  };
}
