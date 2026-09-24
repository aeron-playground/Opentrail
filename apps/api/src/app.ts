import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { AppError } from "./lib/errors";
import type { Logger } from "./lib/logger";
import { createRouter } from "./lib/router";
import { errorHandler, notFound } from "./middleware/error-handler";
import { REQUEST_ID_HEADER, requestId } from "./middleware/request-id";
import { requestLog } from "./middleware/request-log";

export const MAX_BODY_BYTES = 64 * 1024;

export type AppDeps = {
  logger: Logger;
  // Exact browser origins that may call the API, such as https://example.com.
  corsOrigins: string[];
};

export type App = ReturnType<typeof createApp>;

// Builds the app from its dependencies and reads no settings itself, so tests can build one
// with fakes.
export function createApp({ logger, corsOrigins }: AppDeps) {
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

  app.notFound(notFound);
  app.onError(errorHandler(logger));
  return app;
}
