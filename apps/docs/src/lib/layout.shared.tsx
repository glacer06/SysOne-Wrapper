import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { githubUrl, productName } from "~/site";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: `${productName} docs`,
    },
    ...(githubUrl === null ? {} : { githubUrl }),
  };
}
