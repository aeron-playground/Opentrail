// Exact integer math for money. Amounts are bigint in the smallest unit: raw token units, and
// micro-USDC for dollars (1 USD = 1_000_000n). A JavaScript number never touches them.

/** a × b ÷ divisor, rounded half up. Every input must be non-negative, and the divisor positive. */
export function mulDiv(a: bigint, b: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) {
    throw new RangeError("The divisor must be greater than zero.");
  }
  if (a < 0n || b < 0n) {
    throw new RangeError("mulDiv works on values of zero or more.");
  }
  const product = a * b;
  const quotient = product / divisor;
  return (product % divisor) * 2n >= divisor ? quotient + 1n : quotient;
}

/** 10 to the power of a whole number of zero or more. */
export function pow10(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new RangeError("The exponent must be a whole number of zero or more.");
  }
  return 10n ** BigInt(exponent);
}

/** A decimal number held exactly: its value is digits ÷ 10^scale. */
export type Decimal = { digits: bigint; scale: number };

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/** Reads a price like "142.35" or "0.0000123" exactly. Signs and exponents aren't prices. */
export function parseDecimal(text: string): Decimal {
  const match = DECIMAL.exec(text);
  if (!match) {
    throw new RangeError(`Not a decimal number of zero or more: "${text}".`);
  }
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  return { digits: BigInt(whole + fraction), scale: fraction.length };
}

const JSON_NUMBER = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
// Far beyond any price or percent; a larger exponent would only build a huge string.
const MAX_EXPONENT = 100;

/**
 * Writes a number's text, such as "1e-9" or "-1.5E+3" from an outside JSON answer, as a plain
 * decimal: "0.000000001", "-1500". It moves the point in the text, so no digit is lost, and drops
 * leading and trailing zeros.
 */
export function plainDecimal(text: string): string {
  const match = JSON_NUMBER.exec(text);
  if (!match) {
    throw new RangeError(`Not a number: "${text}".`);
  }
  const [, sign = "", whole = "", fraction = "", exponentText = "0"] = match;
  const exponent = Number(exponentText);
  if (Math.abs(exponent) > MAX_EXPONENT) {
    throw new RangeError(`The exponent of "${text}" is out of range.`);
  }
  const digits = whole + fraction;
  const point = whole.length + exponent;
  const padded =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [integer = "", decimals = ""] = padded.split(".");
  const tidyInteger = integer.replace(/^0+(?=\d)/, "");
  const tidyDecimals = decimals.replace(/0+$/, "");
  const plain = tidyDecimals === "" ? tidyInteger : `${tidyInteger}.${tidyDecimals}`;
  return plain === "0" ? plain : sign + plain;
}
