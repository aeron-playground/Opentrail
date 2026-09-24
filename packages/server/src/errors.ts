import { ERRORS, type ErrorCode } from "@repo/shared";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Logger } from "./logger";
import type { RequestIdEnv } from "./request-id";

type ErrorStatus = (typeof ERRORS)[ErrorCode]["status"];

// The one error shape every service answers with.
export type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

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

// Hono and its validators throw HTTPException for protocol problems. These are the ones a
// client can cause; anything else is our bug.
const HTTP_EXCEPTION_CODES: Partial<Record<number, ErrorCode>> = {
  400: "VALIDATION_FAILED", // malformed JSON body
  404: "NOT_FOUND",
  413: "PAYLOAD_TOO_LARGE",
  415: "VALIDATION_FAILED", // body sent with the wrong content type
};

export function errorResponse(c: Context<RequestIdEnv>, code: ErrorCode): Response {
  const { status, message } = ERRORS[code];
  const body: ErrorBody = { error: { code, message, requestId: c.var.requestId } };
  return c.json(body, status);
}

export const notFound: NotFoundHandler<RequestIdEnv> = (c) => errorResponse(c, "NOT_FOUND");

export function errorHandler(logger: Logger): ErrorHandler<RequestIdEnv> {
  return (error, c) => {
    const code = errorCode(error);
    if (ERRORS[code].status >= 500) {
      // The details go to our logs only. The client gets the generic message and the request id.
      logger.error({ err: error, requestId: c.var.requestId }, "request failed");
    }
    return errorResponse(c, code);
  };
}

function errorCode(error: Error): ErrorCode {
  if (error instanceof AppError) {
    return error.code;
  }
  if (error instanceof HTTPException) {
    return HTTP_EXCEPTION_CODES[error.status] ?? "INTERNAL";
  }
  return "INTERNAL";
}
