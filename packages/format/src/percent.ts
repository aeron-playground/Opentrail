import { type DecimalString, formatWithTrueMinus } from "./decimal";

export type PercentOptions = { locale?: string; decimals?: number };

const SIGNED_DECIMAL = /^-?\d+(?:\.\d+)?$/;

/** A change as a ratio ("0.0421") to a signed percent: "+4.21%", "−0.87%", "0.00%". */
export function formatPercent(
  ratio: string,
  { locale, decimals = 2 }: PercentOptions = {},
): string {
  if (!SIGNED_DECIMAL.test(ratio)) {
    throw new RangeError(`Not a decimal number: "${ratio}".`);
  }
  const format = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: "exceptZero",
  });
  return formatWithTrueMinus(format, ratio as DecimalString);
}

export type Change = {
  // Signed, like "+4.82%", "−0.87%" or "0.00%".
  text: string;
  // Read from the text, so a change that rounds to zero is flat: no arrow, no color.
  direction: "up" | "down" | "flat";
};

/**
 * A change given in percent ("-4.82" is −4.82%) as signed text and a direction. The point moves
 * in the text, so no digit is lost on the way to a ratio.
 */
export function formatChangePercent(percent: string, options: PercentOptions = {}): Change {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(percent);
  if (!match) {
    throw new RangeError(`Not a decimal number: "${percent}".`);
  }
  const [, sign = "", whole = "", fraction = ""] = match;
  const digits = (whole + fraction).padStart(fraction.length + 3, "0");
  const point = digits.length - fraction.length - 2;
  const ratio = `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
  const text = formatPercent(ratio, options);
  return {
    text,
    direction: text.startsWith("+") ? "up" : text.startsWith("−") ? "down" : "flat",
  };
}
