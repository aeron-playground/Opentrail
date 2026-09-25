import { expect, test } from "bun:test";
import { APP_NAME } from "@repo/shared";
import { fillProductName, remarkProductName } from "./product-name";

test("fills every placeholder in a line", () => {
  expect(fillProductName("What is %APP_NAME%? %APP_NAME% is open source.")).toBe(
    `What is ${APP_NAME}? ${APP_NAME} is open source.`,
  );
  expect(fillProductName("No placeholder here.")).toBe("No placeholder here.");
});

test("the remark plugin fills text, headings and link labels, and leaves code alone", () => {
  const tree = {
    type: "root",
    children: [
      { type: "heading", children: [{ type: "text", value: "About %APP_NAME%" }] },
      {
        type: "paragraph",
        children: [
          { type: "link", children: [{ type: "text", value: "%APP_NAME% on GitHub" }] },
          { type: "inlineCode", value: "%APP_NAME%" },
        ],
      },
      { type: "code", value: "echo %APP_NAME%" },
    ],
  };

  remarkProductName()(tree);

  expect(tree).toEqual({
    type: "root",
    children: [
      { type: "heading", children: [{ type: "text", value: `About ${APP_NAME}` }] },
      {
        type: "paragraph",
        children: [
          { type: "link", children: [{ type: "text", value: `${APP_NAME} on GitHub` }] },
          { type: "inlineCode", value: "%APP_NAME%" },
        ],
      },
      { type: "code", value: "echo %APP_NAME%" },
    ],
  });
});
