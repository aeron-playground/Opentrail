import { describe, expect, test } from "bun:test";
import { formatPrice } from "./price";

const en = { locale: "en-US" };

describe("formatPrice", () => {
  test.each([
    ["$1 and up: 2 decimals", "142.35", "$142.35"],
    ["rounded half up", "142.345", "$142.35"],
    ["a large price", "68123.4", "$68,123.40"],
    ["below $1: 4 significant digits", "0.4521", "$0.4521"],
    ["padded to 4 digits", "0.45", "$0.4500"],
    ["rounded to 4 digits", "0.123456", "$0.1235"],
    ["rounding up to a dollar", "0.99999", "$1.00"],
    ["a small price with 2 zeros", "0.00123", "$0.001230"],
    ["3 zeros are still written out", "0.000789", "$0.0007890"],
    ["4 zeros are counted", "0.0000123", "$0.0₄123"],
    ["counted zeros, rounded to 4 digits", "0.000012345678", "$0.0₄1235"],
    ["counted zeros drop trailing zeros", "0.00000120", "$0.0₅12"],
    ["many zeros", "0.000000000000042", "$0.0₁₃42"],
    ["rounding can end the counting", "0.000099999", "$0.0001000"],
    ["zero", "0", "$0.00"],
    ["zero with decimals", "0.000", "$0.00"],
  ])("%s: %s → %s", (_, price, expected) => {
    expect(formatPrice(price, en)).toBe(expected);
  });

  test("counted zeros follow the reader's locale", () => {
    expect(formatPrice("0.0000123", { locale: "de-DE" })).toBe("0,0₄123 $");
  });

  test.each(["-1", "1e-7", "", "0.0.1"])('refuses "%s"', (price) => {
    expect(() => formatPrice(price, en)).toThrow(RangeError);
  });
});
