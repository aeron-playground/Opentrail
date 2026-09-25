import { pageSchema } from "fumadocs-core/source/schema";
import { fillProductName } from "./product-name";

// Every page needs a description: it shows under the title and in search results.
export const pageFrontmatter = pageSchema.required({ description: true }).transform((page) => ({
  ...page,
  title: fillProductName(page.title),
  description: fillProductName(page.description),
}));
