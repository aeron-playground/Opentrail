import { createRoute, z } from "@hono/zod-openapi";
import type { User } from "@repo/db";
import { USERNAME_CHANGE_DAYS } from "@repo/shared";
import { ErrorBodySchema } from "../../lib/errors";
import { createRouter } from "../../lib/router";
import { type AuthEnv, BEARER_AUTH, requireAuth } from "../../middleware/auth";
import type { PrivyProvider } from "../../providers/privy/types";
import type { BalanceService } from "../../services/balances";
import type { UsernameService } from "../../services/usernames";
import type { UserService } from "../../services/users";

const MeSchema = z
  .object({
    id: z.uuid().openapi({
      description: "Your account id.",
      example: "0192b6f0-7c1e-7a3b-9d7e-3f5c1a2b4d6e",
    }),
    username: z.string().openapi({
      description: "Your public name. New accounts get a random one, such as calm_otter_42.",
      example: "calm_otter_42",
    }),
    usernameChosen: z.boolean().openapi({
      description:
        "False until you choose a name or keep the random one, for example during onboarding.",
      example: false,
    }),
    usernameChangeableAt: z.iso
      .datetime()
      .nullable()
      .openapi({
        description: `When you can change your username again (once every ${USERNAME_CHANGE_DAYS} days), or null if you can change it now.`,
        example: null,
      }),
    walletAddress: z.string().openapi({
      description:
        "Your Solana wallet address, where you add funds. It comes from your sign-in on the " +
        "server, never from the request.",
    }),
    createdAt: z.iso.datetime().openapi({
      description: "When the account was created.",
      example: "2026-09-26T10:00:00.000Z",
    }),
  })
  .openapi("Me");

const MeUpdateSchema = z
  .object({
    username: z
      .string()
      .min(1)
      .max(64)
      .openapi({
        description:
          "Your new username: 3–20 characters, a–z, 0–9 and _, starting with a letter. It's " +
          "saved in lowercase. Send your current name to keep it.",
        example: "maya",
      }),
  })
  .openapi("MeUpdate");

const errorContent = { "application/json": { schema: ErrorBodySchema } };
const unauthorized = {
  description: "`UNAUTHORIZED`: the access token is missing, expired or not valid.",
  content: errorContent,
};

const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Account"],
  summary: "Get your account",
  description:
    "The first call creates your account: it reads your Solana wallet from your sign-in and " +
    "gives you a random username. Later calls return the same account.",
  security: [{ [BEARER_AUTH]: [] }],
  responses: {
    200: {
      description: "Your account.",
      content: { "application/json": { schema: MeSchema } },
    },
    401: unauthorized,
    409: {
      description:
        "`WALLET_NOT_READY`: your wallet is still being created right after sign-in. " +
        "Try again in a moment.",
      content: errorContent,
    },
  },
});

const updateMeRoute = createRoute({
  method: "patch",
  path: "/me",
  tags: ["Account"],
  summary: "Change your username",
  description:
    `Choosing a name, or keeping the random one, counts as a change: the next one is allowed ` +
    `${USERNAME_CHANGE_DAYS} days later. Sending the name you already chose changes nothing.`,
  security: [{ [BEARER_AUTH]: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: MeUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "Your account, with the new name.",
      content: { "application/json": { schema: MeSchema } },
    },
    400: {
      description: "`VALIDATION_FAILED`: the name breaks the format.",
      content: errorContent,
    },
    401: unauthorized,
    409: {
      description:
        "`USERNAME_TAKEN`: someone has the name. `USERNAME_RESERVED`: the name is blocked, or " +
        "too close to a blocked name. `WALLET_NOT_READY`: see GET /v1/me.",
      content: errorContent,
    },
    429: {
      description:
        "`USERNAME_CHANGE_TOO_SOON`: you changed it less than " +
        `${USERNAME_CHANGE_DAYS} days ago. \`usernameChangeableAt\` on GET /v1/me says when ` +
        "you can change it again.",
      headers: z.object({
        "Retry-After": z.string().openapi({
          description: "Seconds until you can change your username again.",
          example: "86400",
        }),
      }),
      content: errorContent,
    },
  },
});

const TokenSchema = z
  .object({
    mint: z.string().openapi({ example: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }),
    symbol: z.string().openapi({ example: "USDC" }),
    decimals: z.number().int().openapi({
      description: "How many of the raw amount's digits come after the decimal point.",
      example: 6,
    }),
  })
  .openapi("Token");

const BalancesSchema = z
  .object({
    balances: z.array(
      z
        .object({
          token: TokenSchema,
          amountRaw: z.string().openapi({
            description:
              "In the token's smallest unit, as a string so no digit is lost: 50 USDC is " +
              '"50000000".',
            example: "50000000",
          }),
        })
        .openapi("Balance"),
    ),
    updatedAt: z.iso.datetime().openapi({
      description: "When these amounts were read from Solana.",
      example: "2026-09-26T10:00:00.000Z",
    }),
  })
  .openapi("Balances");

const balancesRoute = createRoute({
  method: "get",
  path: "/me/balances",
  tags: ["Account"],
  summary: "Get your balances",
  description:
    "USDC and SOL in your wallet, read from Solana at the `confirmed` level. The answer can be " +
    "up to 5 seconds old. More tokens will be listed as they're added.",
  security: [{ [BEARER_AUTH]: [] }],
  responses: {
    200: {
      description: "Your balances.",
      content: { "application/json": { schema: BalancesSchema } },
    },
    401: unauthorized,
    409: {
      description: "`WALLET_NOT_READY`: see GET /v1/me.",
      content: errorContent,
    },
  },
});

export type MeDeps = {
  privy: Pick<PrivyProvider, "verifyAccessToken">;
  users: UserService;
  usernames: UsernameService;
  balances: BalanceService;
};

export function meRoutes({ privy, users, usernames, balances }: MeDeps) {
  const toMe = (user: User) => ({
    id: user.id,
    username: user.username,
    usernameChosen: user.usernameChangedAt !== null,
    usernameChangeableAt: usernames.changeableAt(user)?.toISOString() ?? null,
    walletAddress: user.walletAddress,
    createdAt: user.createdAt.toISOString(),
  });

  const router = createRouter<AuthEnv>();
  router.use(meRoute.path, requireAuth(privy));
  router.use(`${meRoute.path}/*`, requireAuth(privy));
  return router
    .openapi(meRoute, async (c) => {
      const user = await users.getOrCreate(c.var.privyDid);
      // Personal data: no browser or shared cache may keep a copy.
      c.header("Cache-Control", "no-store");
      return c.json(toMe(user), 200);
    })
    .openapi(updateMeRoute, async (c) => {
      const { username } = c.req.valid("json");
      const user = await usernames.change(await users.getOrCreate(c.var.privyDid), username);
      c.header("Cache-Control", "no-store");
      return c.json(toMe(user), 200);
    })
    .openapi(balancesRoute, async (c) => {
      // The wallet comes from the account, which got it from Privy: never from the request.
      const user = await users.getOrCreate(c.var.privyDid);
      const result = await balances.forWallet(user.walletAddress);
      c.header("Cache-Control", "no-store");
      return c.json(
        {
          balances: result.balances.map(({ token, amountRaw }) => ({
            token: { mint: token.mint, symbol: token.symbol, decimals: token.decimals },
            amountRaw: amountRaw.toString(),
          })),
          updatedAt: result.updatedAt.toISOString(),
        },
        200,
      );
    });
}
