import { CANDLE_TIMEFRAMES, type CandleTimeframe } from "@repo/db";
import type { Logger } from "@repo/server";
import type { ChartBook } from "../chart-book";
import { MAX_CANDLES_PER_CALL } from "../providers/geckoterminal/geckoterminal";
import { type GeckoTerminal, RateLimitedError } from "../providers/geckoterminal/types";
import type { Job } from "./scheduler";

const MINUTE_MS = 60 * 1000;

// One GeckoTerminal call per run, 4 a minute at most. Its free limit is about 10 a minute but it
// varies: at 7.5 a minute a real run still got "too many requests" five times in seven minutes.
export const CANDLES_EVERY_MS = 15_000;

// How long each chart may go without a refresh.
export const CANDLE_REFRESH_MS: Record<CandleTimeframe, number> = {
  "15m": 5 * MINUTE_MS,
  "1h": 15 * MINUTE_MS,
  "4h": 60 * MINUTE_MS,
  "1d": 6 * 60 * MINUTE_MS,
};

// How long one candle of each timeframe lasts.
const CANDLE_MS: Record<CandleTimeframe, number> = {
  "15m": 15 * MINUTE_MS,
  "1h": 60 * MINUTE_MS,
  "4h": 4 * 60 * MINUTE_MS,
  "1d": 24 * 60 * MINUTE_MS,
};

// After a rate-limit answer, GeckoTerminal gets a minute's rest.
export const RATE_LIMIT_PAUSE_MS = MINUTE_MS;

export type RefreshCandlesDeps = {
  chartBook: Pick<ChartBook, "listedTokens" | "newestBucket" | "saveCandles">;
  gecko: Pick<GeckoTerminal, "candles">;
  logger: Logger;
  now?: () => number;
};

// Each run fetches the one chart that is most overdue, so charts stay fresh with few tokens and
// refresh less often with many, without ever breaking the rate limit.
export function refreshCandlesJob({
  chartBook,
  gecko,
  logger,
  now = Date.now,
}: RefreshCandlesDeps): Job {
  const triedAt = new Map<string, number>();
  let pausedUntil = 0;

  return {
    name: "refresh-candles",
    everyMs: CANDLES_EVERY_MS,
    run: async () => {
      const time = now();
      if (time < pausedUntil) {
        return;
      }
      let next: { mint: string; pool: string; timeframe: CandleTimeframe; overdue: number } | null =
        null;
      for (const { mint, primaryPoolAddress: pool } of await chartBook.listedTokens()) {
        if (pool === null) {
          continue;
        }
        for (const timeframe of CANDLE_TIMEFRAMES) {
          const lastTry = triedAt.get(`${mint}/${timeframe}`) ?? Number.NEGATIVE_INFINITY;
          const overdue = time - lastTry - CANDLE_REFRESH_MS[timeframe];
          if (overdue >= 0 && (next === null || overdue > next.overdue)) {
            next = { mint, pool, timeframe, overdue };
          }
        }
      }
      if (next === null) {
        return;
      }
      const { mint, pool, timeframe } = next;
      const key = `${mint}/${timeframe}`;
      // Noted before the call, so a chart that keeps failing waits its turn.
      triedAt.set(key, time);

      // Enough candles to fill the gap since the newest one stored, or all we may ask for.
      const newest = await chartBook.newestBucket(mint, timeframe);
      const missing =
        newest === null
          ? MAX_CANDLES_PER_CALL
          : Math.ceil((time - newest.getTime()) / CANDLE_MS[timeframe]) + 1;
      try {
        const quotes = await gecko.candles(
          pool,
          mint,
          timeframe,
          Math.min(missing, MAX_CANDLES_PER_CALL),
        );
        const saved = await chartBook.saveCandles(mint, timeframe, quotes);
        logger.debug({ mint, timeframe, saved }, "candles refreshed");
      } catch (error) {
        if (error instanceof RateLimitedError) {
          pausedUntil = now() + RATE_LIMIT_PAUSE_MS;
          // First in line once the pause ends.
          triedAt.delete(key);
          logger.warn("GeckoTerminal is rate limiting us; candles pause for a minute");
          return;
        }
        throw error;
      }
    },
  };
}
