// Error codes the API returns. Codes, statuses and messages are part of the public /v1 contract:
// add new codes freely, but never change or remove one that has shipped.
export const ERRORS = {
  VALIDATION_FAILED: { status: 400, message: "Check the highlighted fields." },
  NOT_FOUND: { status: 404, message: "We couldn't find that." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "This request is too large. Send less data." },
  INTERNAL: { status: 500, message: "Something went wrong on our side. Try again." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERRORS;

export const ERROR_CODES = Object.keys(ERRORS) as ErrorCode[];
