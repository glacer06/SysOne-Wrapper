import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { githubUrl, productName } from "~/site";

/** The nav title is the typed wordmark: lowercase, Archivo expanded 800. No ant beside it. */
function Wordmark() {
  return (
    <span className="bw-wordmark" aria-label={`${productName} docs`}>
      bandwise
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
