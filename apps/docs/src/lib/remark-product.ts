// Pages write the product name as %product%. This remark plugin swaps in productName from
// src/site.ts, in the rendered page, the search index and llms.txt alike, so a rename is one edit.

import { productName } from "../site";

export const PRODUCT_TOKEN = "%product%";

interface Node {
  type: string;
  value?: unknown;
  children?: Node[];
}

function replaceIn(node: Node, name: string): void {
  if ((node.type === "text" || node.type === "inlineCode" || node.type === "code") && typeof node.value === "string") {
    node.value = node.value.split(PRODUCT_TOKEN).join(name);
  }
  for (const child of node.children ?? []) replaceIn(child, name);
}

/** Replace the token in a plain string, for titles and descriptions. */
export function withProductName(text: string, name: string = productName): string {
  return text.split(PRODUCT_TOKEN).join(name);
}

export function remarkProductName(name: string = productName) {
  return (tree: Node): void => replaceIn(tree, name);
}
