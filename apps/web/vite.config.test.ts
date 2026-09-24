import { expect, test } from "bun:test";
import { APP_NAME } from "@repo/shared";
import { fillProductName } from "./vite.config";

test("fills the product name from @repo/shared into the page", () => {
  expect(fillProductName("<title>%APP_NAME%</title>")).toBe(`<title>${APP_NAME}</title>`);
  expect(fillProductName("<p>no placeholder</p>")).toBe("<p>no placeholder</p>");
});
