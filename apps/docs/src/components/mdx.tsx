import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";

/**
 * Wide tables scroll sideways on a phone. The scroll box takes focus so a keyboard can scroll it
 * too (WCAG 2.1.1, axe scrollable-region-focusable). The global focus ring covers [tabindex].
 */
function Table(props: ComponentProps<"table">) {
  return (
    <div className="relative overflow-auto prose-no-margin my-6" tabIndex={0} role="region" aria-label="Table">
      <table {...props} />
    </div>
  );
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    table: Table,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
