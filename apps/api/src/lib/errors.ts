import { z } from "@hono/zod-openapi";
import type { ErrorBody } from "@repo/server";

// The OpenAPI description of the shared error shape. `satisfies` keeps the two in step.
export const ErrorBodySchema = z
  .object({
    error: z.object({
      // A string, not an enum: new codes are added over time, and clients must accept them.
      code: z.string().openapi({
        description:
          "Stable, machine-readable code. Handle codes you don't know as a generic error.",
        example: "NOT_FOUND",
      }),
      message: z.string().openapi({
        description: "A sentence you can show to the user.",
        example: "We couldn't find that.",
      }),
      requestId: z.string().openapi({
        description: "The same id as the x-request-id header. Quote it when you report a problem.",
        example: "0192b6f0-7c1e-7a3b-9d7e-3f5c1a2b4d6e",
      }),
    }),
  })
  .openapi("Error") satisfies z.ZodType<ErrorBody>;
