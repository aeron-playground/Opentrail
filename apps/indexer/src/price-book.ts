import { type Database, PRICE_UPDATED_CHANNEL, tokenPrices, tokens } from "@repo/db";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { PriceQuote } from "./providers/jupiter/types";

// Postgres limits a notification to 8000 bytes; this many mints stay well under it.
const MINTS_PER_NOTIFICATION = 100;

// The indexer's only way into token_prices.
export type PriceBook = {
  // The tradable tokens, in list order.
  listedMints(): Promise<string[]>;
  // Saves the quotes and marks each price as just confirmed. Sends price_updated with the mints
  // whose price or 24-hour change changed, in the same transaction. Resolves to those mints.
  save(quotes: ReadonlyMap<string, PriceQuote>): Promise<string[]>;
};

export function createPriceBook(db: Database): PriceBook {
  return {
    async listedMints() {
      const rows = await db
        .select({ mint: tokens.mint })
        .from(tokens)
        .where(eq(tokens.isListed, true))
        .orderBy(asc(tokens.sortRank));
      return rows.map((row) => row.mint);
    },

    async save(quotes) {
      if (quotes.size === 0) {
        return [];
      }
      const rows = [...quotes].map(([mint, quote]) => ({
        mint,
        priceUsd: quote.priceUsd,
        change24hPct: quote.change24hPct,
      }));
      return db.transaction(async (tx) => {
        // Postgres rounds to the columns' places before comparing, so a wobble in the 19th
        // decimal isn't a change. Rows it skips here aren't returned.
        const changed = await tx
          .insert(tokenPrices)
          .values(rows)
          .onConflictDoUpdate({
            target: tokenPrices.mint,
            set: {
              priceUsd: sql`excluded.price_usd`,
              change24hPct: sql`excluded.change_24h_pct`,
            },
            setWhere: sql`${tokenPrices.priceUsd} is distinct from excluded.price_usd
              or ${tokenPrices.change24hPct} is distinct from excluded.change_24h_pct`,
          })
          .returning({ mint: tokenPrices.mint });
        // Every quote confirms its price, changed or not, so an old updated_at means stale.
        await tx
          .update(tokenPrices)
          .set({ updatedAt: sql`now()` })
          .where(inArray(tokenPrices.mint, [...quotes.keys()]));

        const mints = changed.map((row) => row.mint);
        for (let start = 0; start < mints.length; start += MINTS_PER_NOTIFICATION) {
          const payload = mints.slice(start, start + MINTS_PER_NOTIFICATION).join(",");
          await tx.execute(sql`select pg_notify(${PRICE_UPDATED_CHANNEL}, ${payload})`);
        }
        return mints;
      });
    },
  };
}
