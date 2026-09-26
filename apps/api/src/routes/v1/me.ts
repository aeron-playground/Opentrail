import { createRoute, z } from "@hono/zod-openapi";
import { ErrorBodySchema } from "../../lib/errors";
import { createRouter } from "../../lib/router";
import { type AuthEnv, BEARER_AUTH, requireAuth } from "../../middleware/auth";
import type { PrivyProvider } from "../../providers/privy/types";
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

const errorContent = { "application/json": { schema: ErrorBodySchema } };

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
    401: {
      description: "`UNAUTHORIZED`: the access token is missing, expired or not valid.",
      content: errorContent,
    },
    409: {
      description:
        "`WALLET_NOT_READY`: your wallet is still being created right after sign-in. " +
        "Try again in a moment.",
      content: errorContent,
    },
  },
});

export type MeDeps = {
  privy: Pick<PrivyProvider, "verifyAccessToken">;
  users: UserService;
};

export function meRoutes({ privy, users }: MeDeps) {
  const router = createRouter<AuthEnv>();
  router.use(meRoute.path, requireAuth(privy));
  return router.openapi(meRoute, async (c) => {
    const user = await users.getOrCreate(c.var.privyDid);
    // Personal data: no browser or shared cache may keep a copy.
    c.header("Cache-Control", "no-store");
    return c.json(
      {
        id: user.id,
        username: user.username,
        walletAddress: user.walletAddress,
        createdAt: user.createdAt.toISOString(),
      },
      200,
    );
  });
}
