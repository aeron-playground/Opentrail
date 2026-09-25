import { describe, expect, test } from "bun:test";
import { microToDecimal, parseDecimal, ratioToDecimal, unitsToDecimal } from "./decimal";

describe("unitsToDecimal", () => {
  test.each([
    [1_234_500n, 3, "1234.5"],
    [5n, 6, "0.000005"],
    [0n, 6, "0"],
    [-2_500_000n, 6, "-2.5"],
    [42n, 0, "42"],
    [100n, 2, "1"],
  ])("%p with %i decimals → %s", (units, decimals, expected) => {
    expect(unitsToDecimal(units, decimals)).toBe(expected as `${number}`);
  });

  test.each([-1, 1.5])("refuses %p decimals", (decimals) => {
    expect(() => unitsToDecimal(1n, decimals)).toThrow(RangeError);
  });

  test("micro-USDC to dollars", () => {
    expect(microToDecimal(12_345_670_000n)).toBe("12345.67");
  });
});

describe("ratioToDecimal", () => {
  test.each([
    [1n, 3n, 4, "0.3333"],
    [2n, 3n, 4, "0.6667"],
    [1n, 8n, 2, "0.13"],
    [-1n, 8n, 2, "-0.13"],
    [1n, -8n, 2, "-0.13"],
    [-1n, -8n, 2, "0.13"],
    [0n, -5n, 2, "0"],
    [1n, 1_000n, 2, "0"],
  ])("%p ÷ %p to %i decimals → %s", (numerator, denominator, decimals, expected) => {
    expect(ratioToDecimal(numerator, denominator, decimals)).toBe(expected as `${number}`);
  });

  test("refuses to divide by zero", () => {
    expect(() => ratioToDecimal(1n, 0n, 2)).toThrow(RangeError);
  });
});

describe("parseDecimal", () => {
  test.each([
    ["0.0000123", 123n, 7],
    ["142", 142n, 0],
  ])("%s", (text, digits, scale) => {
    expect(parseDecimal(text)).toEqual({ digits, scale });
  });
});
