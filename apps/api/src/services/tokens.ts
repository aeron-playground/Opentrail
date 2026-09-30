import { type CandleTimeframe, candles, type Database, tokenPrices, tokens } from "@repo/db";
import { and, asc, eq, gte, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/** Most candles one answer may hold. */
export const MAX_CANDLES = 1_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TokenPrice = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string | null;
  // Decimal strings without padding zeros; null before the first price.
  priceUsd: string | null;
  change24hPct: string | null;
  // When the price was last confirmed; an old one means the price is stale.
  priceUpdatedAt: Date | null;
};

export type ListedToken = TokenPrice & {
  rank: number;
  // Closing prices every 4 hours over the last 7 days, oldest first.
  sparkline7d: string[];
};

export type TokenDetail = TokenPrice & {
  isListed: boolean;
  rank: number | null;
  safety: { level: string | null; note: string | null };
  // Filled by the token safety job every 10 minutes; null before its first check.
  stats: { marketCapUsd: string | null; liquidityUsd: string | null; volume24hUsd: string | null };
};

export type CandlePoint = {
  start: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volumeUsd: string;
};

export type TokenService = {
  /** The tradable tokens in rank order, with prices and sparklines. */
  listed(): Promise<ListedToken[]>;
  /** One token, listed or not, or null when it isn't known. */
  detail(mint: string): Promise<TokenDetail | null>;
  /** Candles starting in [from, to), oldest first, at most MAX_CANDLES; null for an unknown token. */
  candles(
    mint: string,
    timeframe: CandleTimeframe,
    from: Date,
    to: Date,
  ): Promise<CandlePoint[] | null>;
};

// A fixed-scale column pads with zeros (1.500000000000000000); trim_scale drops them.
const plain = (column: AnyPgColumn): SQL<string> => sql<string>`trim_scale(${column})::text`;

export function createTokenService({
  db,
  now = () => new Date(),
}: {
  db: Database;
  now?: () => Date;
}): TokenService {
  const priced = {
    mint: tokens.mint,
    symbol: tokens.symbol,
    name: tokens.name,
    decimals: tokens.decimals,
    logoUrl: tokens.logoUrl,
    priceUsd: sql<string | null>`trim_scale(${tokenPrices.priceUsd})::text`,
    change24hPct: sql<string | null>`trim_scale(${tokenPrices.change24hPct})::text`,
    priceUpdatedAt: tokenPrices.updatedAt,
  };

  return {
    async listed() {
      // A left join: a token without a price yet is still listed, with a null price.
      const rows = await db
        .select({ ...priced, rank: tokens.sortRank })
        .from(tokens)
        .leftJoin(tokenPrices, eq(tokenPrices.mint, tokens.mint))
        .where(eq(tokens.isListed, true))
        .orderBy(asc(tokens.sortRank));
      if (rows.length === 0) {
        return [];
      }
      // One query for every sparkline, not one per token.
      const points = await db
        .select({ mint: candles.mint, close: plain(candles.close) })
        .from(candles)
        .where(
          and(
            inArray(
              candles.mint,
              rows.map((row) => row.mint),
            ),
            eq(candles.timeframe, "4h"),
            gte(candles.bucketStart, new Date(now().getTime() - 7 * DAY_MS)),
          ),
        )
        .orderBy(asc(candles.mint), asc(candles.bucketStart));
      const sparklines = new Map<string, string[]>();
      for (const { mint, close } of points) {
        const line = sparklines.get(mint);
        if (line) {
          line.push(close);
        } else {
          sparklines.set(mint, [close]);
        }
      }
      return rows.map((row) => ({
        ...row,
        // Listed tokens always have a rank; 0 only guards against a row seeded by hand.
        rank: row.rank ?? 0,
        sparkline7d: sparklines.get(row.mint) ?? [],
      }));
    },

    async detail(mint) {
      const [row] = await db
        .select({
          ...priced,
          isListed: tokens.isListed,
          rank: tokens.sortRank,
          safetyLevel: tokens.safetyLevel,
          safetyNote: tokens.safetyNote,
          liquidityUsd: sql<string | null>`trim_scale(${tokens.liquidityUsd})::text`,
          marketCapUsd: sql<string | null>`trim_scale(${tokens.marketCapUsd})::text`,
          volume24hUsd: sql<string | null>`trim_scale(${tokens.volume24hUsd})::text`,
        })
        .from(tokens)
        .leftJoin(tokenPrices, eq(tokenPrices.mint, tokens.mint))
        .where(eq(tokens.mint, mint));
      if (row === undefined) {
        return null;
      }
      const { safetyLevel, safetyNote, liquidityUsd, marketCapUsd, volume24hUsd, ...token } = row;
      return {
        ...token,
        safety: { level: safetyLevel, note: safetyNote },
        stats: { marketCapUsd, liquidityUsd, volume24hUsd },
      };
    },

    async candles(mint, timeframe, from, to) {
      const [known] = await db
        .select({ mint: tokens.mint })
        .from(tokens)
        .where(eq(tokens.mint, mint));
      if (known === undefined) {
        return null;
      }
      return db
        .select({
          start: candles.bucketStart,
          open: plain(candles.open),
          high: plain(candles.high),
          low: plain(candles.low),
          close: plain(candles.close),
          volumeUsd: plain(candles.volumeUsd),
        })
        .from(candles)
        .where(
          and(
            eq(candles.mint, mint),
            eq(candles.timeframe, timeframe),
            gte(candles.bucketStart, from),
            lt(candles.bucketStart, to),
          ),
        )
        .orderBy(asc(candles.bucketStart))
        .limit(MAX_CANDLES);
    },
  };
}
