import { describe, expect, test } from "bun:test";
import { mulDiv, parseDecimal, plainDecimal, pow10 } from "./math";

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
});
