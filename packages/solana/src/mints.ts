// Tokens every part of the app knows by heart. Each mint was checked on mainnet: owned by the
// SPL Token program, with these decimals. Never add one without checking it the same way.

export type KnownToken = {
  readonly mint: string;
  readonly symbol: string;
  // Raw amounts are whole units of 10^-decimals: 1 USDC is 1,000,000 raw.
  readonly decimals: number;
};

export const USDC: KnownToken = {
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  symbol: "USDC",
  decimals: 6,
};

// Native SOL and wrapped SOL share the wSOL mint in our tables.
export const SOL: KnownToken = {
  mint: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  decimals: 9,
};
