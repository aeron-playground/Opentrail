import type { MiddlewareHandler } from "hono";

export const REQUEST_ID_HEADER = "x-request-id";

// What the request id middleware puts on the context, read as c.var.requestId.
export type RequestIdEnv = {
  Variables: {
    requestId: string;
  };
};

// Every request gets a fresh UUIDv7. An id sent by the client is ignored, so nobody can
// choose what appears in our logs.
export function requestId(): MiddlewareHandler<RequestIdEnv> {
  return async (c, next) => {
    const id = Bun.randomUUIDv7();
    c.set("requestId", id);
    await next();
    // Set after the rest of the chain, so error, not-found and preflight responses carry it too.
    c.header(REQUEST_ID_HEADER, id);
  };
}
