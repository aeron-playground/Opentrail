import { OpenAPIHono } from "@hono/zod-openapi";
import { AppError } from "./errors";

// Values that middleware puts on the request context, read as c.var.<name>.
export type AppEnv = {
  Variables: {
    requestId: string;
  };
};

// Every router turns input that fails its zod schema into the same VALIDATION_FAILED error.
export function createRouter(): OpenAPIHono<AppEnv> {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        throw new AppError("VALIDATION_FAILED", { cause: result.error });
      }
    },
  });
}
