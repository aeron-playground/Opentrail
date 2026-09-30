// What the indexer asks of Jupiter. Everything else about its API stays behind this type, so
// tests can swap in the fake.
export type PriceQuote = {
  // Dollars per whole token, as plain decimal text.
  priceUsd: string;
  // Percent over the last 24 hours, as plain decimal text; null when Jupiter has none.
  change24hPct: string | null;
};

export type JupiterPrices = {
  /**
   * The USD price of each mint. Like Jupiter, it leaves out a token without a reliable price.
   */
  getPrices(mints: readonly string[]): Promise<Map<string, PriceQuote>>;
};

// What Jupiter's token data says about a token, for its safety level and stats.
export type TokenMarket = {
  // Jupiter's own review of the token.
  isVerified: boolean;
  // Dollars, as plain decimal text; null when Jupiter has none.
  liquidityUsd: string | null;
  marketCapUsd: string | null;
  // Bought and sold over the last 24 hours, together.
  volume24hUsd: string | null;
};

export type JupiterTokens = {
  /** Jupiter's data for each mint. A mint Jupiter doesn't know is left out. */
  getTokens(mints: readonly string[]): Promise<Map<string, TokenMarket>>;
};
