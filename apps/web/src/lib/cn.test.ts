import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cn, TOKEN_NAMES } from "./cn";

describe("cn", () => {
  const cases: { name: string; input: string[]; expected: string }[] = [
    {
      name: "keeps a size and a color together",
      input: ["text-title", "text-ink-2"],
      expected: "text-title text-ink-2",
    },
    { name: "lets the later color win", input: ["text-ink", "text-ink-2"], expected: "text-ink-2" },
    { name: "lets the later size win", input: ["text-body", "text-meta"], expected: "text-meta" },
    {
      name: "lets the later radius win",
      input: ["rounded-control", "rounded-sheet"],
      expected: "rounded-sheet",
    },
    {
      name: "lets the later background win",
      input: ["bg-paper", "bg-paper-2"],
      expected: "bg-paper-2",
    },
    {
      name: "keeps a font and a size together",
      input: ["font-condensed", "text-hero"],
      expected: "font-condensed text-hero",
    },
    { name: "lets the later padding win", input: ["px-4", "px-6"], expected: "px-6" },
  ];

  for (const { name, input, expected } of cases) {
    test(name, () => {
      expect(cn(...input)).toBe(expected);
    });
  }
});

test("knows exactly the token names defined in theme.css", async () => {
  const css = await Bun.file(join(import.meta.dir, "../styles/theme.css")).text();
  const inline = css.slice(css.indexOf("@theme inline"));
  const names = (prefix: string) =>
    [...inline.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+?)(?:--[a-z-]+)?:`, "g"))]
      .map((match) => match[1])
      .filter((name, index, all) => all.indexOf(name) === index);

  expect({
    color: names("color"),
    text: names("text"),
    font: names("font"),
    radius: names("radius"),
    shadow: names("shadow"),
    container: names("container"),
  }).toEqual(TOKEN_NAMES);
});
