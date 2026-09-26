// Error codes the API returns. Codes and statuses are part of the public /v1 contract: add new
// codes freely, but never change or remove one that has shipped. Messages are for people and
// may be reworded, so clients must never branch on them.
export const ERRORS = {
  VALIDATION_FAILED: { status: 400, message: "Check the highlighted fields." },
  UNAUTHORIZED: { status: 401, message: "Sign in again to continue." },
  NOT_FOUND: { status: 404, message: "We couldn't find that." },
  // Privy creates the wallet right after sign-in, so the first request can arrive before it.
  WALLET_NOT_READY: {
    status: 409,
    message: "Your wallet is still being set up. Try again in a moment.",
  },
  PAYLOAD_TOO_LARGE: { status: 413, message: "This request is too large. Send less data." },
  INTERNAL: { status: 500, message: "Something went wrong on our side. Try again." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERRORS;

export const ERROR_CODES = Object.keys(ERRORS) as ErrorCode[];
