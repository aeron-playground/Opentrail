import { describe, expect, test } from "bun:test";
import { parseJsonKeepingNumbers } from "./json";

describe("parseJsonKeepingNumbers", () => {
  test.each([
    [
      "a price with more digits than a float keeps",
      '{"p":0.1234567890123456789}',
      { p: "0.1234567890123456789" },
    ],
    [
      "an amount above the largest safe integer",
      '{"a":9007199254740993}',
      { a: "9007199254740993" },
    ],
    ["numbers inside arrays", "[1, 2.50]", ["1", "2.50"]],
    [
      "strings, booleans and null as they are",
      '{"s":"1","b":true,"n":null}',
      { s: "1", b: true, n: null },
    ],
  ])("keeps %s", (_, text, expected) => {
    expect(parseJsonKeepingNumbers(text)).toEqual(expected);
  });

  test("throws on text that isn't JSON", () => {
    expect(() => parseJsonKeepingNumbers("{oops")).toThrow(SyntaxError);
  });
});
