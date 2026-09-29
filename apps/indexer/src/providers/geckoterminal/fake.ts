// A GeckoTerminal for tests: pools and candles live in memory, and nothing touches the network.
import type { CandleTimeframe } from "@repo/db";
import type { CandleQuote, GeckoTerminal, Pool } from "./types";

export type CandleCall = { pool: string; mint: string; timeframe: CandleTimeframe; limit: number };

export type FakeGeckoTerminal = GeckoTerminal & {
  /** The pools the fake answers with, by mint. */
  poolsByMint: Map<string, Pool[]>;
  /** The candles the fake answers with, by "pool/timeframe". */
  candlesBySeries: Map<string, CandleQuote[]>;
  poolCalls: string[];
  candleCalls: CandleCall[];
  /** Makes the next calls fail; null makes them work again. */
  failWith(error: Error | null): void;
};

export function createFakeGeckoTerminal(): FakeGeckoTerminal {
  const poolsByMint = new Map<string, Pool[]>();
  const candlesBySeries = new Map<string, CandleQuote[]>();
  const poolCalls: string[] = [];
  const candleCalls: CandleCall[] = [];
  let failure: Error | null = null;
  return {
    poolsByMint,
    candlesBySeries,
    poolCalls,
    candleCalls,
    async pools(mint) {
      poolCalls.push(mint);
      if (failure) throw failure;
      return poolsByMint.get(mint) ?? [];
    },
    async candles(pool, mint, timeframe, limit) {
      candleCalls.push({ pool, mint, timeframe, limit });
      if (failure) throw failure;
      return (candlesBySeries.get(`${pool}/${timeframe}`) ?? []).slice(0, limit);
    },
    failWith(error) {
      failure = error;
    },
  };
}
