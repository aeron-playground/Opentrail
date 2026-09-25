import { APP_NAME } from "@repo/shared";

// Pages write %APP_NAME% instead of the product name, so a rename stays a one-line change in
// packages/shared. The web app fills the same placeholder in its page title.
export const PRODUCT_NAME_PLACEHOLDER = "%APP_NAME%";

export function fillProductName(text: string): string {
  return text.replaceAll(PRODUCT_NAME_PLACEHOLDER, APP_NAME);
}

// The parts of a Markdown syntax tree this plugin needs.
type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] };

function fillTextNodes(node: MarkdownNode): void {
  if (node.type === "text" && node.value !== undefined) {
    node.value = fillProductName(node.value);
  }
  for (const child of node.children ?? []) {
    fillTextNodes(child);
  }
}

// A remark plugin for page text, headings and link labels. Code keeps the placeholder as
// written, so a page can show it.
export function remarkProductName() {
  return (tree: MarkdownNode) => {
    fillTextNodes(tree);
  };
}
