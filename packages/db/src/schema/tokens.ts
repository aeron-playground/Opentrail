// Writer: `bun run db:seed` for the list itself (entries checked with scripts/add-token.ts) and
// its reviewed safety notes, and the indexer's market-data jobs for pools, checks and stats.
import { TOKEN_PROGRAM_NAMES } from "@repo/solana";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const SAFETY_LEVELS = ["ok", "caution", "high_risk"] as const;
export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

const quoted = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

// The tokens the app knows: the ones people can trade, and a few it shows but doesn't trade,
// like USDC, which people pay with. A token never goes away; it's unlisted instead.
export const tokens = pgTable(
  "tokens",
  {
    mint: text("mint").primaryKey(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    // How many of a raw amount's digits come after the decimal point. Solana stores it in one byte.
    decimals: smallint("decimals").notNull(),
    tokenProgram: text("token_program", { enum: TOKEN_PROGRAM_NAMES }).notNull(),
    logoUrl: text("logo_url"),
    // Tradable in the app.
    isListed: boolean("is_listed").notNull().default(false),
    // Place in lists, lowest first.
    sortRank: integer("sort_rank"),
    // Filled by the market-data jobs: candles come from this pool (P2-3), the rest decide the
    // token's safety level (P2-7).
    primaryPoolAddress: text("primary_pool_address"),
    isJupiterVerified: boolean("is_jupiter_verified"),
    mintAuthorityRevoked: boolean("mint_authority_revoked"),
    freezeAuthorityRevoked: boolean("freeze_authority_revoked"),
    // Dollars, as decimal strings, so no cent is lost: what's in the token's pools, its market
    // cap, and what traded in the last 24 hours.
    liquidityUsd: numeric("liquidity_usd", { precision: 38, scale: 2 }),
    marketCapUsd: numeric("market_cap_usd", { precision: 38, scale: 2 }),
    volume24hUsd: numeric("volume_24h_usd", { precision: 38, scale: 2 }),
    safetyLevel: text("safety_level", { enum: SAFETY_LEVELS }),
    // Why a token passes a check it fails on paper, such as a stablecoin keeping its mint
    // authority. Written by a person and reviewed; shown on the token page.
    safetyNote: text("safety_note"),
    safetyCheckedAt: timestamp("safety_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Explore lists the tradable tokens in rank order.
    index("tokens_listed_rank_idx").on(table.isListed, table.sortRank),
    check("tokens_program_check", sql`${table.tokenProgram} in (${quoted(TOKEN_PROGRAM_NAMES)})`),
    check("tokens_decimals_check", sql`${table.decimals} between 0 and 255`),
    check("tokens_safety_level_check", sql`${table.safetyLevel} in (${quoted(SAFETY_LEVELS)})`),
  ],
);

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
