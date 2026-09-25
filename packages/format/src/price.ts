import { type DecimalString, parseDecimal, unitsToDecimal } from "./decimal";

const SIGNIFICANT_DIGITS = 4;
/** From this many zeros after the decimal point, they're counted instead of written out. */
const COUNT_ZEROS_FROM = 4;
const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function subscript(count: number) {
  return [...String(count)].map((digit) => SUBSCRIPT_DIGITS[Number(digit)]).join("");
}

function usd(locale: string | undefined, options: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", ...options });
}

/**
 * A price in dollars per token, given as a decimal string:
 * - $1 and up: 2 decimals ("$142.35")
 * - below $1: 4 significant digits ("$0.4521", "$0.001230")
 * - with 4 or more zeros after the point, the zeros are counted: "$0.0₄123" is $0.0000123
 */
export function formatPrice(price: string, { locale }: { locale?: string } = {}): string {
  let { digits, scale } = parseDecimal(price);
  if (digits === 0n) {
    return usd(locale, { minimumFractionDigits: 2 }).format(0n);
  }

  // Round to 4 significant digits first, so 0.99999 becomes $1.00 rather than $1.000.
  const length = digits.toString().length;
  if (digits < 10n ** BigInt(scale) && length > SIGNIFICANT_DIGITS) {
    const dropped = 10n ** BigInt(length - SIGNIFICANT_DIGITS);
    digits = digits / dropped + ((digits % dropped) * 2n >= dropped ? 1n : 0n);
    scale -= length - SIGNIFICANT_DIGITS;
  }

  const value = unitsToDecimal(digits, scale);
  if (digits >= 10n ** BigInt(scale)) {
    return usd(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }

  const zeros = scale - digits.toString().length;
  if (zeros < COUNT_ZEROS_FROM) {
    return usd(locale, {
      minimumSignificantDigits: SIGNIFICANT_DIGITS,
      maximumSignificantDigits: SIGNIFICANT_DIGITS,
    }).format(value);
  }

  // The locale's own layout of "$0.0", with the counted zeros and the digits after it.
  const significant = digits.toString().replace(/0+$/, "");
  return usd(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    .formatToParts("0.0" satisfies DecimalString)
    .map((part) => (part.type === "fraction" ? `0${subscript(zeros)}${significant}` : part.value))
    .join("");
}
