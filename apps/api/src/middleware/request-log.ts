import type { MiddlewareHandler } from "hono";
import type { Logger } from "../lib/logger";
import type { AppEnv } from "../lib/router";

// One line per request. Only the path: query strings and headers can carry tokens or personal
// data, and IP addresses are never logged.
export function requestLog(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const startedAt = performance.now();
    await next();
    logger.info(
      {
        requestId: c.var.requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "request",
    );
  };
}
