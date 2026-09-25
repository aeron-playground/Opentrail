import { describe, expect, test } from "bun:test";
import { formatPnl, formatUsd } from "./money";
import { formatPercent } from "./percent";

const en = { locale: "en-US" };

describe("formatUsd", () => {
  test.each([
    ["a balance", 12_345_670_000n, {}, "$12,345.67"],
    ["zero", 0n, {}, "$0.00"],
    ["a loss, with the real minus sign", -3_000_000n, {}, "−$3.00"],
    ["half a cent rounds up", 5_000n, {}, "$0.01"],
    ["just under $100K stays in full", 99_999_990_000n, {}, "$99,999.99"],
    ["$100K and up are compact", 100_000_000_000n, {}, "$100K"],
    ["$1.2M", 1_200_000_000_000n, {}, "$1.2M"],
    ["$3.45B", 3_450_000_000_000_000n, {}, "$3.45B"],
    ["a large loss is compact too", -1_234_567_000_000n, {}, "−$1.23M"],
    ["full asks for every digit", 1_234_567_890_000n, { full: true }, "$1,234,567.89"],
    ["a signed gain", 42_100_000n, { signed: true }, "+$42.10"],
    ["a signed loss", -42_100_000n, { signed: true }, "−$42.10"],
    ["a signed zero has no sign", 0n, { signed: true }, "$0.00"],
    [
      "past a JavaScript number's precision",
      12_345_678_901_234_567_895_000n,
      { full: true },
      "$12,345,678,901,234,567.90",
    ],
  ] as const)("%s", (_, micro, options, expected) => {
    expect(formatUsd(micro, { ...en, ...options })).toBe(expected);
  });

  test("uses the reader's locale", () => {
    expect(formatUsd(1_234_500_000n, { locale: "de-DE" })).toBe("1.234,50 $");
  });
});

describe("formatPercent", () => {
  test.each([
    ["0.0421", "+4.21%"],
    ["-0.0087", "−0.87%"],
    ["0", "0.00%"],
    ["1.5", "+150.00%"],
    ["0.000049", "0.00%"],
    ["0.00005", "+0.01%"],
  ])("%s → %s", (ratio, expected) => {
    expect(formatPercent(ratio, en)).toBe(expected);
  });

  test("can show fewer decimals", () => {
    expect(formatPercent("0.0321", { ...en, decimals: 1 })).toBe("+3.2%");
  });

  test.each(["", "4%", "1e-3", "+0.1", "abc"])('refuses "%s"', (ratio) => {
    expect(() => formatPercent(ratio, en)).toThrow(RangeError);
  });
});

describe("formatPnl", () => {
  test.each([
    ["a gain", 42_100_000n, 1_315_630_000n, "+$42.10 (+3.2%)"],
    ["a loss", -250_000_000n, 1_000_000_000n, "−$250.00 (−25.0%)"],
    ["break-even", 0n, 1_000_000n, "$0.00 (0.0%)"],
    ["no cost to compare with", 5_000_000n, 0n, "+$5.00"],
  ])("%s", (_, pnl, cost, expected) => {
    expect(formatPnl(pnl, cost, en)).toBe(expected);
  });
});
