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
