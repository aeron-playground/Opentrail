import { describe, expect, test } from "bun:test";
import {
  compareDecimals,
  mulDiv,
  parseDecimal,
  percentChange,
  plainDecimal,
  pow10,
  sumDecimals,
} from "./math";

describe("mulDiv", () => {
  const cases = [
    { a: 6n, b: 4n, divisor: 3n, expected: 8n, why: "exact" },
    { a: 10n, b: 1n, divisor: 4n, expected: 3n, why: "2.5 rounds half up" },
    { a: 10n, b: 1n, divisor: 3n, expected: 3n, why: "3.33 rounds down" },
    { a: 20n, b: 1n, divisor: 3n, expected: 7n, why: "6.67 rounds up" },
    { a: 0n, b: 999n, divisor: 7n, expected: 0n, why: "zero" },
    { a: 1n, b: 1n, divisor: 2n, expected: 1n, why: "0.5 rounds up" },
    { a: 1n, b: 1n, divisor: 3n, expected: 0n, why: "0.33 rounds down" },
    {
      a: 18_446_744_073_709_551_615n,
      b: 1_000_000_000n,
      divisor: 3n,
      expected: 6_148_914_691_236_517_205_000_000_000n,
      why: "past 64 bits, still exact",
    },
  ];

  for (const { a, b, divisor, expected, why } of cases) {
    test(`${a} × ${b} ÷ ${divisor} = ${expected} (${why})`, () => {
      expect(mulDiv(a, b, divisor)).toBe(expected);
    });
  }

  test("refuses a divisor of zero or less", () => {
    expect(() => mulDiv(1n, 1n, 0n)).toThrow(RangeError);
    expect(() => mulDiv(1n, 1n, -1n)).toThrow(RangeError);
  });

  test("refuses negative values", () => {
    expect(() => mulDiv(-1n, 1n, 1n)).toThrow(RangeError);
    expect(() => mulDiv(1n, -1n, 1n)).toThrow(RangeError);
  });
});

describe("pow10", () => {
  test.each([
    [0, 1n],
    [1, 10n],
    [6, 1_000_000n],
    [24, 1_000_000_000_000_000_000_000_000n],
  ])("10^%i", (exponent, expected) => {
    expect(pow10(exponent)).toBe(expected);
  });

  test.each([-1, 1.5, Number.NaN])("refuses %p", (exponent) => {
    expect(() => pow10(exponent)).toThrow(RangeError);
  });
});

describe("parseDecimal", () => {
  test.each([
    ["142.35", 14235n, 2],
    ["0.0000123", 123n, 7],
    ["7", 7n, 0],
    ["0", 0n, 0],
    ["1.50", 150n, 2],
    ["000.10", 10n, 2],
  ])("reads %s exactly", (text, digits, scale) => {
    expect(parseDecimal(text)).toEqual({ digits, scale });
  });

  test.each(["", "-1", "+1", "1.", ".5", "1e-5", "1,5", " 1", "NaN", "1.2.3"])(
    'refuses "%s"',
    (text) => {
      expect(() => parseDecimal(text)).toThrow(RangeError);
    },
  );
});

describe("plainDecimal", () => {
  test.each([
    // Plain decimals, as Jupiter sends most prices.
    ["0.0000037264429947363744", "0.0000037264429947363744"],
    ["120.83457314202052", "120.83457314202052"],
    ["-4.821237250067719", "-4.821237250067719"],
    ["42", "42"],
    // Exponents move the point, in either direction.
    ["1e-9", "0.000000001"],
    ["2.5e-7", "0.00000025"],
    ["-0.5e-2", "-0.005"],
    ["1.5E+3", "1500"],
    ["12.5e1", "125"],
    ["1e21", "1000000000000000000000"],
    ["3.14e0", "3.14"],
    // Leading and trailing zeros go.
    ["0.05e2", "5"],
    ["1.500", "1.5"],
    ["007.10", "7.1"],
    // Zero has no sign.
    ["0", "0"],
    ["-0", "0"],
    ["-0.000e5", "0"],
  ])("writes %s as %s", (text, expected) => {
    expect(plainDecimal(text)).toBe(expected);
  });

  test.each(["", "abc", "1.", ".5", "+1", "1e", "0x10", "1,5", " 1"])("refuses %p", (text) => {
    expect(() => plainDecimal(text)).toThrow(RangeError);
  });

  test.each(["1e101", "1e-101", "1e999999999"])(
    "refuses %s, whose exponent is too large",
    (text) => {
      expect(() => plainDecimal(text)).toThrow("out of range");
    },
  );

  test("keeps the limit itself", () => {
    expect(plainDecimal("1e-100")).toBe(`0.${"0".repeat(99)}1`);
  });

  test("refuses text longer than 200 characters, and takes 200", () => {
    expect(() => plainDecimal(`0.${"0".repeat(198)}1`)).toThrow("too long");
    expect(plainDecimal(`0.${"0".repeat(197)}1`)).toBe(`0.${"0".repeat(197)}1`);
  });

  test("trims long runs of zeros quickly", () => {
    const started = performance.now();
    expect(plainDecimal(`${"0".repeat(99)}1.${"0".repeat(98)}`)).toBe("1");
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe("compareDecimals", () => {
  test.each([
    ["37848514.3069", "30996438.12", 1],
    ["30996438.12", "37848514.3069", -1],
    ["1.5", "1.50", 0],
    ["0.000003726442994736", "0.0000037264429947363744", -1],
    ["120", "119.999999999999999999", 1],
    ["0", "0.0", 0],
  ])("compares %s with %s as %i", (a, b, expected) => {
    expect(compareDecimals(a, b)).toBe(expected);
  });

  test("refuses text that isn't a decimal of zero or more", () => {
    expect(() => compareDecimals("-1", "1")).toThrow(RangeError);
  });
});

describe("percentChange", () => {
  // Expected values worked out with exact decimal math.
  const cases: [string, string, string, number, string][] = [
    ["a rise", "100", "110", 4, "10"],
    ["a fall", "100", "90", 4, "-10"],
    ["no change", "100", "100", 4, "0"],
    ["a third, rounded down", "3", "4", 4, "33.3333"],
    ["a fall of a third", "3", "2", 4, "-33.3333"],
    ["two thirds, rounded up", "3", "5", 4, "66.6667"],
    ["prices of different lengths", "1.5", "3", 4, "100"],
    ["a fall too small to show: 0, not -0", "100", "99.999999", 4, "0"],
    ["JUP", "0.3249568595792189", "0.3314", 4, "1.9828"],
    ["SOL", "118.92690462188556", "121.5", 4, "2.1636"],
    ["a tiny price, trailing zeros dropped", "0.000003863", "0.000003854", 4, "-0.233"],
    ["no digits after the point", "3", "4", 0, "33"],
    ["two digits", "3", "4", 2, "33.33"],
    ["fewer digits than asked", "8", "9", 1, "12.5"],
    ["exactly half rounds up", "8", "9", 0, "13"],
    ["and away from zero when falling", "8", "7", 0, "-13"],
  ];

  test.each(cases)("%s: %p to %p, %p digits", (_, from, to, digits, expected) => {
    expect(percentChange(from, to, digits)).toBe(expected);
  });

  test("keeps 4 digits by default", () => {
    expect(percentChange("3", "4")).toBe("33.3333");
  });

  test("is null from zero, where no percent exists", () => {
    expect(percentChange("0", "1")).toBeNull();
    expect(percentChange("0.000", "0")).toBeNull();
  });

  test.each([
    ["-1", "1"],
    ["1", "abc"],
  ])("refuses %p to %p", (from, to) => {
    expect(() => percentChange(from, to)).toThrow(RangeError);
  });

  test.each([-1, 1.5])("refuses %p digits", (digits) => {
    expect(() => percentChange("1", "2", digits)).toThrow(RangeError);
  });
});

describe("sumDecimals", () => {
  // Expected values worked out with exact decimal math.
  const cases: [string, string[], string][] = [
    ["nothing", [], "0"],
    ["zeros", ["0", "0.000"], "0"],
    ["different lengths", ["1.5", "2.25"], "3.75"],
    ["trailing zeros dropped", ["1", "2.000"], "3"],
    [
      "JUP's 24-hour buys and sells",
      ["8596409.843694884", "8493909.989855358"],
      "17090319.833550242",
    ],
    ["USDC's", ["1140306708.9927025", "1139766373.4764175"], "2280073082.46912"],
    ["three at once", ["0.1", "0.2", "0.3"], "0.6"],
  ];

  test.each(cases)("adds %s", (_, values, expected) => {
    expect(sumDecimals(values)).toBe(expected);
  });

  test.each([["-1"], ["abc"], ["1e5"]])("refuses %p", (value) => {
    expect(() => sumDecimals(["1", value])).toThrow(RangeError);
  });
});
