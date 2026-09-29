import { type CandleTimeframe, candles, type Database, tokens } from "@repo/db";
import { and, asc, eq, lt, max, sql } from "drizzle-orm";
import type { CandleQuote } from "./providers/geckoterminal/types";

export type ChartToken = { mint: string; primaryPoolAddress: string | null };

// The indexer's only way into candles, and its only write to tokens.primary_pool_address.
export type ChartBook = {
  // The tradable tokens and their main pools, in list order.
  listedTokens(): Promise<ChartToken[]>;
  setPrimaryPool(mint: string, address: string): Promise<void>;
  // The start of the newest stored candle of one chart, or null before its first fetch.
  newestBucket(mint: string, timeframe: CandleTimeframe): Promise<Date | null>;
  // Saves candles; one already stored (usually the one still open) is updated. Resolves to how
  // many were saved.
  saveCandles(
    mint: string,
    timeframe: CandleTimeframe,
    quotes: readonly CandleQuote[],
  ): Promise<number>;
  // Deletes a timeframe's candles that started before the cutoff. Resolves to how many.
  deleteCandlesBefore(timeframe: CandleTimeframe, cutoff: Date): Promise<number>;
};

export function createChartBook(db: Database): ChartBook {
  return {
    listedTokens: () =>
      db
        .select({ mint: tokens.mint, primaryPoolAddress: tokens.primaryPoolAddress })
        .from(tokens)
        .where(eq(tokens.isListed, true))
        .orderBy(asc(tokens.sortRank)),

    async setPrimaryPool(mint, address) {
      await db.update(tokens).set({ primaryPoolAddress: address }).where(eq(tokens.mint, mint));
    },

    async newestBucket(mint, timeframe) {
      const [row] = await db
        .select({ newest: max(candles.bucketStart) })
        .from(candles)
        .where(and(eq(candles.mint, mint), eq(candles.timeframe, timeframe)));
      return row?.newest ?? null;
    },

    async saveCandles(mint, timeframe, quotes) {
      if (quotes.length === 0) {
        return 0;
      }
      const saved = await db
        .insert(candles)
        .values(quotes.map((quote) => ({ mint, timeframe, ...quote })))
        .onConflictDoUpdate({
          target: [candles.mint, candles.timeframe, candles.bucketStart],
          set: {
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            close: sql`excluded.close`,
            volumeUsd: sql`excluded.volume_usd`,
          },
        })
        .returning({ mint: candles.mint });
      return saved.length;
    },

    async deleteCandlesBefore(timeframe, cutoff) {
      const deleted = await db
        .delete(candles)
        .where(and(eq(candles.timeframe, timeframe), lt(candles.bucketStart, cutoff)))
        .returning({ mint: candles.mint });
      return deleted.length;
    },
  };
}
