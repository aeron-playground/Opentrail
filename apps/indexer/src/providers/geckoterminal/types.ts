// What the indexer asks of GeckoTerminal. Everything else about its API stays behind this type,
// so tests can swap in the fake.
import type { CandleTimeframe } from "@repo/db";

export type Pool = {
  address: string;
  baseMint: string;
  quoteMint: string;
  // Dollars in the pool, both sides, as plain decimal text.
  liquidityUsd: string;
};

export type CandleQuote = {
  bucketStart: Date;
  // Dollars per whole token, as plain decimal text.
  open: string;
  high: string;
  low: string;
  close: string;
  volumeUsd: string;
};

export type GeckoTerminal = {
  /** The token's top pools on Solana (GeckoTerminal's first page). */
  pools(mint: string): Promise<Pool[]>;
  /** The newest `limit` candles of `pool`, priced in dollars as `mint`, newest first. */
  candles(
    pool: string,
    mint: string,
    timeframe: CandleTimeframe,
    limit: number,
  ): Promise<CandleQuote[]>;
};

/** GeckoTerminal answered 429: too many requests for now. */
export class RateLimitedError extends Error {
  override name = "RateLimitedError";
}
