import { metaSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { pageFrontmatter } from "./lib/page-frontmatter";
import { remarkProductName } from "./lib/product-name";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageFrontmatter,
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: (plugins) => [remarkProductName, ...plugins],
  },
});
