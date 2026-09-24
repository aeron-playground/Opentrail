import type { MiddlewareHandler } from "hono";
import type { Logger } from "./logger";
import type { RequestIdEnv } from "./request-id";

// One line per request. Only the path: query strings and headers can carry tokens or personal
// data, and IP addresses are never logged.
export function requestLog(logger: Logger): MiddlewareHandler<RequestIdEnv> {
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
