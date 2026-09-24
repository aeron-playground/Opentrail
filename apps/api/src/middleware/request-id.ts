import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../lib/router";

export const REQUEST_ID_HEADER = "x-request-id";

// Every request gets a fresh UUIDv7. An id sent by the client is ignored, so nobody can
// choose what appears in our logs.
export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = Bun.randomUUIDv7();
    c.set("requestId", id);
    await next();
    // Set after the rest of the chain, so error, not-found and preflight responses carry it too.
    c.header(REQUEST_ID_HEADER, id);
  };
}
