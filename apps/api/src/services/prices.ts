import { type Database, tokenPrices } from "@repo/db";
import { asc, inArray, sql } from "drizzle-orm";

export type CurrentPrice = { mint: string; priceUsd: string; change24hPct: string | null };

export type PriceReader = {
  /** The stored price of each of these mints that has one, in mint order. */
  current(mints: readonly string[]): Promise<CurrentPrice[]>;
};

export function createPriceReader(db: Database): PriceReader {
  return {
    async current(mints) {
      if (mints.length === 0) {
        return [];
      }
      // A fixed-scale column pads with zeros (1.500000000000000000); trim_scale drops them.
      return db
        .select({
          mint: tokenPrices.mint,
          priceUsd: sql<string>`trim_scale(${tokenPrices.priceUsd})::text`,
          change24hPct: sql<string | null>`trim_scale(${tokenPrices.change24hPct})::text`,
        })
        .from(tokenPrices)
        .where(inArray(tokenPrices.mint, [...mints]))
        .orderBy(asc(tokenPrices.mint));
    },
  };
}
