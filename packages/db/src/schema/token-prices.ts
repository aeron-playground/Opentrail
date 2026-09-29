// Writer: indexer (the refresh-prices job).
import { sql } from "drizzle-orm";
import { check, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tokens } from "./tokens";

// The latest price of each listed token. A row keeps its last price when Jupiter skips the token,
// so an old updated_at means a stale price.
export const tokenPrices = pgTable(
  "token_prices",
  {
    mint: text("mint")
      .primaryKey()
      .references(() => tokens.mint),
    // Dollars per whole token, as a decimal string: tiny prices like BONK's need the 18 places.
    priceUsd: numeric("price_usd", { precision: 38, scale: 18 }).notNull(),
    // Percent over the last 24 hours: 1.5 means up 1.5%.
    change24hPct: numeric("change_24h_pct", { precision: 12, scale: 4 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("token_prices_price_check", sql`${table.priceUsd} > 0`)],
);

export type TokenPrice = typeof tokenPrices.$inferSelect;
export type NewTokenPrice = typeof tokenPrices.$inferInsert;
