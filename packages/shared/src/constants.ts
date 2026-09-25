// Limits and rules every app agrees on. Money is bigint in micro-USDC (ADR 0009).

/** One dollar in micro-USDC. */
export const MICRO_USDC_PER_USD = 1_000_000n;

/** The smallest trade: $1. The largest is a server setting, so it can change without a release. */
export const MIN_TRADE_MICRO_USDC = MICRO_USDC_PER_USD;

/** Basis points in a whole: 1 bp is 0.01%. */
export const BPS_PER_WHOLE = 10_000n;

/** The platform fee: 10 bps, which is 0.1% of each trade (ADR 0005). */
export const FEE_BPS = 10n;

/**
 * Usernames: 3–20 characters of a–z, 0–9 and _, starting with a letter. They're compared
 * without case, so check the lowercased name.
 */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;
