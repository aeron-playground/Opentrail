import { createRoute, z } from "@hono/zod-openapi";
import { isSolanaAddress } from "@repo/solana";
import { ErrorBodySchema } from "../../lib/errors";
import { createRouter } from "../../lib/router";
import { type AuthEnv, BEARER_AUTH, requireAuth } from "../../middleware/auth";
import type { PrivyProvider } from "../../providers/privy/types";
import { HIGH_IMPACT_BPS, QUOTE_TTL_MS, type Quote, type SwapService } from "../../services/swaps";
import type { UserService } from "../../services/users";

// A whole number above zero with no leading zeros, up to 40 digits like the database column.
const RAW_AMOUNT = /^[1-9]\d{0,39}$/;

const rawAmount = (description: string, example: string) =>
  z.string().openapi({
    description: `${description} In raw units, as a string so no digit is lost.`,
    example,
  });

const QuoteRequestSchema = z
  .object({
    side: z.enum(["buy", "sell"]).openapi({
      description: "`buy` spends USDC on the token; `sell` sells the token for USDC.",
      example: "buy",
    }),
    mint: z.string().refine(isSolanaAddress, { error: "must be a Solana address" }).openapi({
      description: "The token to buy or sell. USDC is always the other side.",
      example: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    }),
    amountRaw: z
      .string()
      .regex(RAW_AMOUNT, { error: "must be a whole number above zero" })
      .openapi({
        description:
          'A buy: the micro-USDC to spend, the fee included ("25000000" is $25). ' +
          "A sell: the token's raw units to sell.",
        example: "25000000",
      }),
    slippageBps: z
      .number()
      .int()
      .min(10)
      .max(300)
      .default(50)
      .openapi({
        description:
          "How far the price may move before the trade fails, in basis points (50 is 0.5%). " +
          "From 10 to 300.",
        example: 50,
      }),
    acceptHighImpact: z
      .boolean()
      .default(false)
      .openapi({
        description: `Send true to go ahead after a \`PRICE_IMPACT_TOO_HIGH\` refusal (impact of ${HIGH_IMPACT_BPS / 100}% or more).`,
        example: false,
      }),
  })
  .openapi("SwapQuoteRequest");

const QuoteSchema = z
  .object({
    id: z.uuid().openapi({
      description: "The intent to submit the signed transaction to.",
      example: "0192b6f0-7c1e-7a3b-9d7e-3f5c1a2b4d6e",
    }),
    side: z.enum(["buy", "sell"]),
    mint: z.string().openapi({ description: "The token bought or sold." }),
    inputMint: z.string().openapi({ description: "The token the swap spends." }),
    outputMint: z.string().openapi({ description: "The token the swap brings." }),
    inAmountRaw: rawAmount("What you spend, as asked; for a buy, the fee included.", "25000000"),
    expectedOutRaw: rawAmount(
      "What the swap expects to bring. On a sell, the fee comes out of it after the swap.",
      "79230250",
    ),
    minOutRaw: rawAmount(
      "The least the swap may bring before it fails, after slippage. On a sell, the fee comes out of it after the swap.",
      "78834099",
    ),
    feeBps: z
      .number()
      .int()
      .openapi({ description: "The platform fee rate; 0 with fees off.", example: 10 }),
    feeUsdcMicro: rawAmount("The platform fee, in micro-USDC.", "25000"),
    slippageBps: z.number().int().openapi({ example: 50 }),
    priceImpactBps: z.number().int().openapi({
      description: "How much this trade moves the price, rounded up. Show a warning from 100.",
      example: 3,
    }),
    routeLabel: z.string().openapi({
      description: "The venues the swap goes through.",
      example: "GoonFi V2 → PancakeSwap → Raydium CLMM",
    }),
    providerFeeBps: z.number().int().openapi({
      description:
        "The swap provider's own fee; 0 when it takes none. Show it as its own line above 0.",
      example: 0,
    }),
    networkFeeLamports: rawAmount(
      "The most the network can take: the signature fee plus the priority fee.",
      "58095",
    ),
    transaction: z.string().openapi({
      description:
        "The unsigned transaction, base64. Sign it in the wallet and submit it unchanged.",
    }),
    expiresAt: z.iso.datetime().openapi({
      description: `When this quote stops being accepted: ${QUOTE_TTL_MS / 1000} seconds after it was made.`,
      example: "2026-10-02T09:00:45.000Z",
    }),
  })
  .openapi("SwapQuote");

const errorContent = { "application/json": { schema: ErrorBodySchema } };

const quoteRoute = createRoute({
  method: "post",
  path: "/swaps/quote",
  tags: ["Trading"],
  summary: "Quote a trade",
  description:
    "Checks the trade, finds a route, and builds one transaction with the swap and the platform " +
    "fee, simulated before it's returned. Nothing is signed or sent: sign the transaction in your " +
    "wallet before `expiresAt`. Ask again for a fresh price.",
  security: [{ [BEARER_AUTH]: [] }],
  request: {
    body: { required: true, content: { "application/json": { schema: QuoteRequestSchema } } },
  },
  responses: {
    200: {
      description: "The quote and the transaction to sign.",
      content: { "application/json": { schema: QuoteSchema } },
    },
    400: {
      description:
        "`VALIDATION_FAILED`, `TOKEN_NOT_SUPPORTED`, `AMOUNT_TOO_SMALL`, `AMOUNT_TOO_LARGE`, " +
        "`INSUFFICIENT_BALANCE`, `INSUFFICIENT_SOL_FOR_FEES`, `PRICE_IMPACT_TOO_HIGH` (send " +
        "again with `acceptHighImpact`), or `TX_SIMULATION_FAILED`.",
      content: errorContent,
    },
    401: {
      description: "`UNAUTHORIZED`: the access token is missing, expired or not valid.",
      content: errorContent,
    },
    409: { description: "`WALLET_NOT_READY`: see GET /v1/me.", content: errorContent },
    502: {
      description: "`QUOTE_UNAVAILABLE`: no route for this trade right now.",
      content: errorContent,
    },
    503: {
      description: "`QUOTE_BUSY`: getting a price took too long. Try again.",
      content: errorContent,
    },
  },
});

export type SwapDeps = {
  privy: Pick<PrivyProvider, "verifyAccessToken">;
  users: UserService;
  swaps: SwapService;
};

export function swapRoutes({ privy, users, swaps }: SwapDeps) {
  const toJson = (quote: Quote) => ({
    ...quote,
    inAmountRaw: quote.inAmountRaw.toString(),
    expectedOutRaw: quote.expectedOutRaw.toString(),
    minOutRaw: quote.minOutRaw.toString(),
    feeUsdcMicro: quote.feeUsdcMicro.toString(),
    networkFeeLamports: quote.networkFeeLamports.toString(),
    expiresAt: quote.expiresAt.toISOString(),
  });

  const router = createRouter<AuthEnv>();
  router.use("/swaps/*", requireAuth(privy));
  return router.openapi(quoteRoute, async (c) => {
    const body = c.req.valid("json");
    // The wallet comes from the account, which got it from Privy: never from the request.
    const user = await users.getOrCreate(c.var.privyDid);
    const quote = await swaps.quote({
      userId: user.id,
      wallet: user.walletAddress,
      side: body.side,
      mint: body.mint,
      amountRaw: BigInt(body.amountRaw),
      slippageBps: body.slippageBps,
      acceptHighImpact: body.acceptHighImpact,
    });
    // Built for one person, and it expires: no cache may keep it.
    c.header("Cache-Control", "no-store");
    return c.json(toJson(quote), 200);
  });
}
