import { createRoute, z } from "@hono/zod-openapi";
import { CANDLE_TIMEFRAMES, type CandleTimeframe } from "@repo/db";
import { AppError } from "@repo/server";
import { isSolanaAddress } from "@repo/solana";
import { ErrorBodySchema } from "../../lib/errors";
import { createRouter } from "../../lib/router";
import { MAX_CANDLES, type TokenService } from "../../services/tokens";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const CANDLE_MS: Record<CandleTimeframe, number> = {
  "15m": 15 * MINUTE_MS,
  "1h": 60 * MINUTE_MS,
  "4h": 4 * 60 * MINUTE_MS,
  "1d": DAY_MS,
};

// Without `from`, a chart shows this much history.
const DEFAULT_RANGE_MS: Record<CandleTimeframe, number> = {
  "15m": DAY_MS,
  "1h": 7 * DAY_MS,
  "4h": 30 * DAY_MS,
  "1d": 365 * DAY_MS,
};

// Public, and the same for everyone: shared caches such as Cloudflare may keep them this long.
const TOKENS_CACHE = "public, max-age=10";
const CANDLES_CACHE = "public, max-age=30";

const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

const decimal = (description: string, example: string) =>
  z.string().openapi({ description, example });
const nullableDecimal = (description: string, example: string | null) =>
  z.string().nullable().openapi({ description, example });

const TokenFields = {
  mint: z.string().openapi({ description: "The token's mint address.", example: JUP }),
  symbol: z.string().openapi({ example: "JUP" }),
  name: z.string().openapi({ example: "Jupiter" }),
  decimals: z.number().int().openapi({
    description: "How many of a raw amount's digits come after the decimal point.",
    example: 6,
  }),
  logoUrl: z.string().nullable().openapi({ example: "https://static.jup.ag/jup/icon.png" }),
  priceUsd: nullableDecimal(
    "Dollars per whole token, as a decimal string. Null before the token's first price.",
    "0.3253799780422554",
  ),
  change24hPct: nullableDecimal(
    "The price change over the last 24 hours, in percent: -4.82 means down 4.82%.",
    "-4.8212",
  ),
  priceUpdatedAt: z.iso
    .datetime()
    .nullable()
    .openapi({
      description:
        "When the price was last confirmed; prices refresh about every 15 seconds, so an " +
        "older time means the price is stale.",
      example: "2026-09-30T12:00:00.000Z",
    }),
};

const TokenListItemSchema = z
  .object({
    ...TokenFields,
    rank: z.number().int().openapi({ description: "Place in the list, from 1.", example: 2 }),
    sparkline7d: z.array(z.string()).openapi({
      description:
        "Closing prices every 4 hours over the last 7 days, oldest first, as decimal " +
        "strings. Shorter for a token listed recently.",
      example: ["0.3312", "0.3290", "0.3254"],
    }),
  })
  .openapi("TokenListItem");

const TokenListSchema = z
  .object({
    items: z.array(TokenListItemSchema),
    nextCursor: z.null().openapi({
      description: "Always null: the whole list comes in one page.",
    }),
  })
  .openapi("TokenList");

const TokenSafetySchema = z
  .object({
    level: z
      .string()
      .nullable()
      .openapi({
        description:
          "`ok`, `caution` or `high_risk`, or null before the token is checked. A string, " +
          "not a list: treat a level you don't know as `caution`.",
        example: "ok",
      }),
    note: z.string().nullable().openapi({
      description: "The reviewed reason behind the level, to show on the token page.",
      example: null,
    }),
  })
  .openapi("TokenSafety");

const TokenStatsSchema = z
  .object({
    marketCapUsd: nullableDecimal("Market cap in dollars; null when unknown.", null),
    liquidityUsd: nullableDecimal("Dollars in the token's pools; null when unknown.", null),
    volume24hUsd: nullableDecimal("Dollars traded in the last 24 hours; null when unknown.", null),
  })
  .openapi("TokenStats");

const TokenDetailSchema = z
  .object({
    ...TokenFields,
    isListed: z.boolean().openapi({
      description: "Whether the token can be traded. USDC, which you pay with, isn't.",
      example: true,
    }),
    rank: z.number().int().nullable().openapi({
      description: "Place in the list, from 1; null for a token that isn't listed.",
      example: 2,
    }),
    safety: TokenSafetySchema,
    stats: TokenStatsSchema,
  })
  .openapi("TokenDetail");

const CandleSchema = z
  .object({
    start: z.iso.datetime().openapi({
      description: "When the candle's period starts. The newest candle is still open.",
      example: "2026-09-30T08:00:00.000Z",
    }),
    open: decimal("Dollars per whole token when the period opened.", "0.3312"),
    high: decimal("The highest price in the period.", "0.3330"),
    low: decimal("The lowest price in the period.", "0.3251"),
    close: decimal("The latest price in the period.", "0.3254"),
    volumeUsd: decimal("Dollars traded in the token's main pool in the period.", "26262.57"),
  })
  .openapi("Candle");

const CandleListSchema = z
  .object({
    mint: z.string().openapi({ example: JUP }),
    timeframe: z.enum(CANDLE_TIMEFRAMES).openapi({ example: "1h" }),
    items: z.array(CandleSchema),
  })
  .openapi("CandleList");

const mintParam = z.object({
  mint: z
    .string()
    .refine(isSolanaAddress, { error: "must be a Solana address" })
    .openapi({
      param: { name: "mint", in: "path" },
      description: "The token's mint address.",
      example: JUP,
    }),
});

const errorContent = { "application/json": { schema: ErrorBodySchema } };
const notFound = {
  description: "`NOT_FOUND`: no token with this mint address is known.",
  content: errorContent,
};

const listRoute = createRoute({
  method: "get",
  path: "/tokens",
  tags: ["Tokens"],
  summary: "List tokens",
  description:
    "The tokens you can trade, in list order, with their latest prices. No sign-in needed. " +
    "For live prices, subscribe to the WebSocket `prices` channel.",
  responses: {
    200: {
      description: "The tradable tokens.",
      content: { "application/json": { schema: TokenListSchema } },
    },
  },
});

const detailRoute = createRoute({
  method: "get",
  path: "/tokens/{mint}",
  tags: ["Tokens"],
  summary: "Get a token",
  description:
    "One token, tradable or not, with its price, safety and stats. No sign-in needed. " +
    "Safety and stats are null until the token has been checked.",
  request: { params: mintParam },
  responses: {
    200: {
      description: "The token.",
      content: { "application/json": { schema: TokenDetailSchema } },
    },
    400: {
      description: "`VALIDATION_FAILED`: the mint isn't a Solana address.",
      content: errorContent,
    },
    404: notFound,
  },
});

const candlesRoute = createRoute({
  method: "get",
  path: "/tokens/{mint}/candles",
  tags: ["Tokens"],
  summary: "Get a token's price candles",
  description:
    "Price candles for a chart, oldest first, from the token's main pool on GeckoTerminal. " +
    'Show "Chart data: GeckoTerminal" under every chart. Without `from`, the answer covers ' +
    "1 day of `15m`, 7 days of `1h`, 30 days of `4h` or 365 days of `1d` candles, up to `to` " +
    `(now by default). A range may hold at most ${MAX_CANDLES} candles. No sign-in needed.`,
  request: {
    params: mintParam,
    query: z.object({
      tf: z.enum(CANDLE_TIMEFRAMES).openapi({
        param: { name: "tf", in: "query" },
        description: "How long each candle lasts.",
        example: "1h",
      }),
      from: z.iso
        .datetime({ offset: true })
        .optional()
        .openapi({
          param: { name: "from", in: "query" },
          description: "The earliest candle start to include.",
          example: "2026-09-23T12:00:00Z",
        }),
      to: z.iso
        .datetime({ offset: true })
        .optional()
        .openapi({
          param: { name: "to", in: "query" },
          description: "Candles must start before this time.",
          example: "2026-09-30T12:00:00Z",
        }),
    }),
  },
  responses: {
    200: {
      description: "The candles; an empty list when there are none in the range.",
      content: { "application/json": { schema: CandleListSchema } },
    },
    400: {
      description:
        "`VALIDATION_FAILED`: the mint isn't a Solana address, `tf` is missing or unknown, a " +
        `time isn't ISO 8601, \`from\` isn't before \`to\`, or the range holds more than ${MAX_CANDLES} candles.`,
      content: errorContent,
    },
    404: notFound,
  },
});

export type TokenDeps = {
  tokens: TokenService;
  now?: () => Date;
};

export function tokenRoutes({ tokens, now = () => new Date() }: TokenDeps) {
  return createRouter()
    .openapi(listRoute, async (c) => {
      const items = await tokens.listed();
      c.header("Cache-Control", TOKENS_CACHE);
      return c.json(
        {
          items: items.map((token) => ({
            ...token,
            priceUpdatedAt: token.priceUpdatedAt?.toISOString() ?? null,
          })),
          nextCursor: null,
        },
        200,
      );
    })
    .openapi(detailRoute, async (c) => {
      const token = await tokens.detail(c.req.valid("param").mint);
      if (token === null) {
        throw new AppError("NOT_FOUND");
      }
      c.header("Cache-Control", TOKENS_CACHE);
      return c.json({ ...token, priceUpdatedAt: token.priceUpdatedAt?.toISOString() ?? null }, 200);
    })
    .openapi(candlesRoute, async (c) => {
      const { mint } = c.req.valid("param");
      const { tf, from, to } = c.req.valid("query");
      const end = to === undefined ? now() : new Date(to);
      const start =
        from === undefined ? new Date(end.getTime() - DEFAULT_RANGE_MS[tf]) : new Date(from);
      if (start >= end || (end.getTime() - start.getTime()) / CANDLE_MS[tf] > MAX_CANDLES) {
        throw new AppError("VALIDATION_FAILED");
      }
      const items = await tokens.candles(mint, tf, start, end);
      if (items === null) {
        throw new AppError("NOT_FOUND");
      }
      c.header("Cache-Control", CANDLES_CACHE);
      return c.json(
        {
          mint,
          timeframe: tf,
          items: items.map((point) => ({ ...point, start: point.start.toISOString() })),
        },
        200,
      );
    });
}
