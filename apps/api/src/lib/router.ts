import { OpenAPIHono } from "@hono/zod-openapi";

// Values that middleware puts on the request context, read as c.var.<name>.
export type AppEnv = {
  Variables: {
    requestId: string;
  };
};

export function createRouter(): OpenAPIHono<AppEnv> {
  return new OpenAPIHono<AppEnv>();
}
