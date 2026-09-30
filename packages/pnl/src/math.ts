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

/** Compares two decimals of zero or more exactly: below 0 when a < b, 0 when equal, above 0 when a > b. */
export function compareDecimals(a: string, b: string): number {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  const scale = Math.max(x.scale, y.scale);
  const left = x.digits * pow10(scale - x.scale);
  const right = y.digits * pow10(scale - y.scale);
  return left === right ? 0 : left > right ? 1 : -1;
}

/**
 * How far `to` moved from `from`, in percent of `from`: "-4.8212" is down 4.8212%. Rounded half
 * away from zero to `fractionDigits` places, without trailing zeros. Null when `from` is zero,
 * where no percent exists.
 */
export function percentChange(from: string, to: string, fractionDigits = 4): string | null {
  const unit = pow10(fractionDigits);
  const a = parseDecimal(from);
  const b = parseDecimal(to);
  const scale = Math.max(a.scale, b.scale);
  const start = a.digits * pow10(scale - a.scale);
  const end = b.digits * pow10(scale - b.scale);
  if (start === 0n) {
    return null;
  }
  const change = end - start;
  // Percent × 10^fractionDigits, as a whole number.
  const size = mulDiv(change < 0n ? -change : change, 100n * unit, start);
  if (size === 0n) {
    return "0";
  }
  const sign = change < 0n ? "-" : "";
  const whole = (size / unit).toString();
  const fraction = (size % unit).toString().padStart(fractionDigits, "0");
  return plainDecimal(fractionDigits === 0 ? sign + whole : `${sign}${whole}.${fraction}`);
}

const JSON_NUMBER = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
// Far beyond any price or percent; more would only make a huge string out of outside data.
const MAX_EXPONENT = 100;
const MAX_LENGTH = 200;

/**
 * Writes a number's text, such as "1e-9" or "-1.5E+3" from an outside JSON answer, as a plain
 * decimal: "0.000000001", "-1500". It moves the point in the text, so no digit is lost, and drops
 * leading and trailing zeros.
 */
export function plainDecimal(text: string): string {
  if (text.length > MAX_LENGTH) {
    throw new RangeError(`A number of ${text.length} characters is too long.`);
  }
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
  const tidyInteger = withoutLeadingZeros(integer);
  const tidyDecimals = withoutTrailingZeros(decimals);
  const plain = tidyDecimals === "" ? tidyInteger : `${tidyInteger}.${tidyDecimals}`;
  return plain === "0" ? plain : sign + plain;
}

// Plain loops, not /^0+/ and /0+$/: a pattern like /0+$/ takes time that grows with the square
// of a long run of zeros, which outside data could use to stall us.
function withoutLeadingZeros(text: string): string {
  let start = 0;
  while (start < text.length - 1 && text[start] === "0") {
    start += 1;
  }
  return text.slice(start);
}

function withoutTrailingZeros(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === "0") {
    end -= 1;
  }
  return text.slice(0, end);
}
