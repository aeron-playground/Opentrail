import {
  AppError,
  errorHandler,
  type Logger,
  notFound,
  REQUEST_ID_HEADER,
  requestId,
  requestLog,
} from "@repo/server";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { ErrorBodySchema } from "./lib/errors";
import { createRouter } from "./lib/router";
import { BEARER_AUTH, BEARER_AUTH_SCHEME } from "./middleware/auth";
import { OPENAPI_CONFIG, OPENAPI_PATH } from "./openapi";
import type { PrivyProvider } from "./providers/privy/types";
import { healthRoutes } from "./routes/v1/health";
import { meRoutes } from "./routes/v1/me";
import { usernameRoutes } from "./routes/v1/usernames";
import type { BalanceService } from "./services/balances";
import type { UsernameService } from "./services/usernames";
import type { UserService } from "./services/users";

export const MAX_BODY_BYTES = 64 * 1024;

export type AppDeps = {
  logger: Logger;
  // Exact browser origins that may call the API, such as https://example.com.
  corsOrigins: string[];
  // Resolves when the database answers, rejects when it doesn't.
  checkDatabase: () => Promise<void>;
  // Checks the sign-in token on protected routes.
  privy: Pick<PrivyProvider, "verifyAccessToken">;
  users: UserService;
  usernames: UsernameService;
  balances: BalanceService;
};

export type App = ReturnType<typeof createApp>;

// Builds the app from its dependencies and reads no settings itself, so tests can build one
// with fakes.
export function createApp({
  logger,
  corsOrigins,
  checkDatabase,
  privy,
  users,
  usernames,
  balances,
}: AppDeps) {
  const app = createRouter();

  app.use(
    requestId(),
    requestLog(logger),
    // The API serves only JSON, so its responses may load nothing and appear in no frame.
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      xFrameOptions: "DENY",
    }),
    // Bearer tokens, not cookies, so credentials stay off.
    cors({
      origin: corsOrigins,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowHeaders: ["Authorization", "Content-Type"],
      exposeHeaders: [REQUEST_ID_HEADER],
      maxAge: 600,
    }),
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new AppError("PAYLOAD_TOO_LARGE");
      },
    }),
  );

  app.route("/v1", healthRoutes({ checkDatabase, logger }));
  app.route("/v1", meRoutes({ privy, users, usernames, balances }));
  app.route("/v1", usernameRoutes({ usernames }));

  // Listed first: every error on every route uses this shape.
  app.openAPIRegistry.register("Error", ErrorBodySchema);
  app.openAPIRegistry.registerComponent("securitySchemes", BEARER_AUTH, BEARER_AUTH_SCHEME);
  app.doc31(OPENAPI_PATH, OPENAPI_CONFIG);

  app.notFound(notFound);
  app.onError(errorHandler(logger));
  return app;
}
