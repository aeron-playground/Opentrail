import { AppError } from "@repo/server";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../lib/router";
import type { PrivyProvider } from "../providers/privy/types";

export type AuthEnv = AppEnv & {
  Variables: {
    // The signed-in person's Privy user id, from a verified access token.
    privyDid: string;
  };
};

// Privy's access tokens are a few hundred characters. Anything far longer isn't one, so it's
// refused before any signature work.
const MAX_TOKEN_LENGTH = 4096;
const BEARER = /^Bearer ([\w.~+/-]+=*)$/i;

// Lets a request through only with a valid `Authorization: Bearer <Privy access token>`.
// The token is never logged or stored; only the user id it proves moves on.
export function requireAuth(
  privy: Pick<PrivyProvider, "verifyAccessToken">,
): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const token = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
    if (token === undefined || token.length > MAX_TOKEN_LENGTH) {
      throw new AppError("UNAUTHORIZED");
    }
    const privyDid = await privy.verifyAccessToken(token);
    if (privyDid === null) {
      throw new AppError("UNAUTHORIZED");
    }
    c.set("privyDid", privyDid);
    await next();
  };
}
