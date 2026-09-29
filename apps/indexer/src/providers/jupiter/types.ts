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
