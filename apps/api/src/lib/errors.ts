import { z } from "@hono/zod-openapi";
import { ERRORS, type ErrorCode } from "@repo/shared";

export type ErrorStatus = (typeof ERRORS)[ErrorCode]["status"];

// Throw this for any failure the client should see. The code decides the HTTP status and the
// message, so the same problem looks the same on every route.
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorStatus;

  constructor(code: ErrorCode, options?: ErrorOptions) {
    super(ERRORS[code].message, options);
    this.name = "AppError";
    this.code = code;
    this.status = ERRORS[code].status;
  }
}

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
  .openapi("Error");

export type ErrorBody = z.infer<typeof ErrorBodySchema>;
