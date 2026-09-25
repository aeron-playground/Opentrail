import { formatWithTrueMinus, microToDecimal, ratioToDecimal } from "./decimal";
import { formatPercent } from "./percent";

export type MoneyOptions = {
  locale?: string;
  /** Show + for gains as well as − for losses: "+$42.10". */
  signed?: boolean;
  /** Every digit, even from $100K up: "$1,234,567.89" instead of "$1.23M". */
  full?: boolean;
};

/** From $100K, values are compact: "$1.2M". */
const COMPACT_FROM_MICRO = 100_000n * 1_000_000n;

/** Micro-USDC as dollars: "$12,345.67", "$1.2M", "+$42.10", "−$3.00". */
export function formatUsd(
  micro: bigint,
  { locale, signed = false, full = false }: MoneyOptions = {},
): string {
  const compact = !full && (micro < 0n ? -micro : micro) >= COMPACT_FROM_MICRO;
  const format = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    signDisplay: signed ? "exceptZero" : "auto",
    ...(compact
      ? { notation: "compact", maximumFractionDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  });
  return formatWithTrueMinus(format, microToDecimal(micro));
}

/** A result with its percent of the cost: "+$42.10 (+3.2%)". With no cost, just the money. */
export function formatPnl(
  pnlMicro: bigint,
  costMicro: bigint,
  { locale }: { locale?: string } = {},
): string {
  const money = formatUsd(pnlMicro, { locale, signed: true });
  if (costMicro <= 0n) {
    return money;
  }
  const percent = formatPercent(ratioToDecimal(pnlMicro, costMicro, 6), { locale, decimals: 1 });
  return `${money} (${percent})`;
}
