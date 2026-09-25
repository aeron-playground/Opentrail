import { formatWithTrueMinus, unitsToDecimal } from "./decimal";

export type TokenOptions = { locale?: string; symbol?: string };

function withSymbol(text: string, symbol: string | undefined) {
  return symbol === undefined ? text : `${text} ${symbol}`;
}

/**
 * A token amount for lists: up to 6 significant digits, but whole units are never rounded away.
 * 1_234_500_000n with 5 decimals → "12,345"; 123_450_000n → "1,234.5".
 */
export function formatTokenAmount(
  units: bigint,
  decimals: number,
  { locale, symbol }: TokenOptions = {},
): string {
  const format = new Intl.NumberFormat(locale, {
    maximumSignificantDigits: 6,
    maximumFractionDigits: 0,
    roundingPriority: "morePrecision",
  });
  return withSymbol(formatWithTrueMinus(format, unitsToDecimal(units, decimals)), symbol);
}

/** Every digit of a token amount, for a tooltip: "1,234.56789 BONK". */
export function formatTokenAmountExact(
  units: bigint,
  decimals: number,
  { locale, symbol }: TokenOptions = {},
): string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals });
  return withSymbol(formatWithTrueMinus(format, unitsToDecimal(units, decimals)), symbol);
}
