import { OpenAPIHono } from "@hono/zod-openapi";
import { AppError, type RequestIdEnv } from "@repo/server";
import type { Env } from "hono";

export type AppEnv = RequestIdEnv;

// Every router turns input that fails its zod schema into the same VALIDATION_FAILED error.
// Routers behind middleware that adds variables pass their own env, such as AuthEnv.
export function createRouter<E extends Env = AppEnv>(): OpenAPIHono<E> {
  return new OpenAPIHono<E>({
    defaultHook: (result) => {
      if (!result.success) {
        throw new AppError("VALIDATION_FAILED", { cause: result.error });
      }
    },
  });
}
