// Exact conversions from integers to decimal strings. Intl.NumberFormat formats a decimal string
// exactly, without going through a JavaScript number, so money never loses a digit on screen.

/** A decimal string that Intl.NumberFormat accepts, like "-1234.5". */
export type DecimalString = `${number}`;

const TRUE_MINUS = "\u2212";

function pow10(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new RangeError("The number of decimals must be a whole number of zero or more.");
  }
  return 10n ** BigInt(exponent);
}

/** Raw units of a token with the given decimals, as an exact decimal string: 1234500n, 3 → "1234.5". */
export function unitsToDecimal(units: bigint, decimals: number): DecimalString {
  const base = pow10(decimals);
  const size = units < 0n ? -units : units;
  const fraction = (size % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const text = `${units < 0n ? "-" : ""}${size / base}${fraction === "" ? "" : `.${fraction}`}`;
  return text as DecimalString;
}

/** Micro-USDC as dollars: 12_345_670_000n → "12345.67". */
export function microToDecimal(micro: bigint): DecimalString {
  return unitsToDecimal(micro, 6);
}

/** numerator ÷ denominator with the given number of decimals, rounded half away from zero. */
export function ratioToDecimal(
  numerator: bigint,
  denominator: bigint,
  decimals: number,
): DecimalString {
  if (denominator === 0n) {
    throw new RangeError("Can't divide by zero.");
  }
  const negative = numerator < 0n !== denominator < 0n;
  const top = (numerator < 0n ? -numerator : numerator) * pow10(decimals);
  const bottom = denominator < 0n ? -denominator : denominator;
  const rounded = top / bottom + ((top % bottom) * 2n >= bottom ? 1n : 0n);
  return unitsToDecimal(negative ? -rounded : rounded, decimals);
}

/** A decimal number held exactly: its value is digits ÷ 10^scale. */
export type Decimal = { digits: bigint; scale: number };

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/** Reads a decimal string of zero or more, like "0.0000123", exactly. */
export function parseDecimal(text: string): Decimal {
  const match = DECIMAL.exec(text);
  if (!match) {
    throw new RangeError(`Not a decimal number of zero or more: "${text}".`);
  }
  const fraction = match[2] ?? "";
  return { digits: BigInt(`${match[1] ?? ""}${fraction}`), scale: fraction.length };
}

/** Formats with the real minus sign (−): many locales write a hyphen, which reads as a dash. */
export function formatWithTrueMinus(format: Intl.NumberFormat, value: DecimalString): string {
  return format
    .formatToParts(value)
    .map((part) => (part.type === "minusSign" ? TRUE_MINUS : part.value))
    .join("");
}
