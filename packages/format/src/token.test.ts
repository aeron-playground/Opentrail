import { describe, expect, test } from "bun:test";
import { formatTokenAmount, formatTokenAmountExact } from "./token";

const en = { locale: "en-US" };

describe("formatTokenAmount", () => {
  test.each([
    ["1,234.5 BONK (5 decimals)", 123_450_000n, 5, "BONK", "1,234.5 BONK"],
    ["6 significant digits", 1_234_567_890n, 6, undefined, "1,234.57"],
    ["whole units are never rounded away", 12_345_678_900_000n, 5, undefined, "123,456,789"],
    ["a tiny amount keeps its digits", 123_456_789n, 12, "SOL", "0.000123457 SOL"],
    ["no trailing zeros", 1_500_000_000n, 9, "SOL", "1.5 SOL"],
    ["zero", 0n, 6, "JUP", "0 JUP"],
    ["a negative change, with the real minus sign", -2_500_000n, 6, undefined, "−2.5"],
  ] as const)("%s", (_, units, decimals, symbol, expected) => {
    expect(formatTokenAmount(units, decimals, { ...en, symbol })).toBe(expected);
  });

  test("uses the reader's locale", () => {
    expect(formatTokenAmount(123_450_000n, 5, { locale: "de-DE", symbol: "BONK" })).toBe(
      "1.234,5 BONK",
    );
  });

  test("refuses negative decimals", () => {
    expect(() => formatTokenAmount(1n, -1, en)).toThrow(RangeError);
  });
});

describe("formatTokenAmountExact", () => {
  test.each([
    ["every digit, for a tooltip", 123_456_789n, 5, "BONK", "1,234.56789 BONK"],
    ["18 decimals", 1_000_000_000_000_000_001n, 18, undefined, "1.000000000000000001"],
    ["no decimals at all", 42n, 0, undefined, "42"],
  ] as const)("%s", (_, units, decimals, symbol, expected) => {
    expect(formatTokenAmountExact(units, decimals, { ...en, symbol })).toBe(expected);
  });
});
