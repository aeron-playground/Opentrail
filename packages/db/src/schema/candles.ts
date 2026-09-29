// Writer: indexer (the refresh-candles job; the daily cleanup deletes old ones).
import { sql } from "drizzle-orm";
import { check, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { tokens } from "./tokens";

export const CANDLE_TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
export type CandleTimeframe = (typeof CANDLE_TIMEFRAMES)[number];

const timeframeList = sql.raw(CANDLE_TIMEFRAMES.map((timeframe) => `'${timeframe}'`).join(", "));
const price = (name: string) => numeric(name, { precision: 38, scale: 18 }).notNull();

// Price candles for charts: the token's price in dollars over each period, from its main pool.
// The newest candle of a timeframe is still open and gets updated until its period ends.
export const candles = pgTable(
  "candles",
  {
    mint: text("mint")
      .notNull()
      .references(() => tokens.mint),
    timeframe: text("timeframe", { enum: CANDLE_TIMEFRAMES }).notNull(),
    // When the candle's period starts.
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    open: price("open"),
    high: price("high"),
    low: price("low"),
    close: price("close"),
    volumeUsd: numeric("volume_usd", { precision: 38, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.mint, table.timeframe, table.bucketStart] }),
    check("candles_timeframe_check", sql`${table.timeframe} in (${timeframeList})`),
    check(
      "candles_prices_check",
      sql`${table.open} > 0 and ${table.high} > 0 and ${table.low} > 0 and ${table.close} > 0`,
    ),
    check("candles_range_check", sql`${table.high} >= ${table.low}`),
    check("candles_volume_check", sql`${table.volumeUsd} >= 0`),
  ],
);

export type Candle = typeof candles.$inferSelect;
export type NewCandle = typeof candles.$inferInsert;
