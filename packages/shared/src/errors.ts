// Error codes the API returns. Codes and statuses are part of the public /v1 contract: add new
// codes freely, but never change or remove one that has shipped. Messages are for people and
// may be reworded, so clients must never branch on them.
import { USERNAME_CHANGE_DAYS } from "./constants";

export const ERRORS = {
  VALIDATION_FAILED: { status: 400, message: "Check the highlighted fields." },
  UNAUTHORIZED: { status: 401, message: "Sign in again to continue." },
  NOT_FOUND: { status: 404, message: "We couldn't find that." },
  // Privy creates the wallet right after sign-in, so the first request can arrive before it.
  WALLET_NOT_READY: {
    status: 409,
    message: "Your wallet is still being set up. Try again in a moment.",
  },
  USERNAME_TAKEN: { status: 409, message: "That username is taken." },
  USERNAME_RESERVED: { status: 409, message: "That username isn't available." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "This request is too large. Send less data." },
  // Only on the WebSocket: the user already has the most live connections allowed.
  TOO_MANY_CONNECTIONS: {
    status: 429,
    message: "Live updates are open in too many windows. Close one to get them here.",
  },
  // The date of the next allowed change is on GET /v1/me, so the message stays one sentence.
  USERNAME_CHANGE_TOO_SOON: {
    status: 429,
    message: `You can change your username once every ${USERNAME_CHANGE_DAYS} days.`,
  },
  // Trading. The app shows the token's name and the current limits around these messages.
  // Not listed, or marked high risk.
  TOKEN_NOT_SUPPORTED: { status: 400, message: "This token isn't available to trade." },
  AMOUNT_TOO_SMALL: { status: 400, message: "The minimum trade is $1." },
  AMOUNT_TOO_LARGE: {
    status: 400,
    message: "This trade is above the maximum per trade right now.",
  },
  INSUFFICIENT_BALANCE: { status: 400, message: "You don't have enough for this trade." },
  // A trade needs a little SOL for the network fee, whatever is being traded.
  INSUFFICIENT_SOL_FOR_FEES: { status: 400, message: "Add a little SOL to pay network fees." },
  // The swap provider didn't answer in time: worth trying again.
  QUOTE_BUSY: { status: 503, message: "Getting a price took too long. Try again." },
  // No route for this trade, or none that fits in one transaction.
  QUOTE_UNAVAILABLE: { status: 502, message: "No price is available for this trade right now." },
  // Sent again with acceptHighImpact, the quote goes ahead.
  PRICE_IMPACT_TOO_HIGH: {
    status: 400,
    message: "This trade would move the price by 5% or more.",
  },
  // The trade failed when tried without sending it, so sending it would only cost a fee.
  TX_SIMULATION_FAILED: {
    status: 400,
    message: "This trade would fail right now, so nothing was sent.",
  },
  INTERNAL: { status: 500, message: "Something went wrong on our side. Try again." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERRORS;

export const ERROR_CODES = Object.keys(ERRORS) as ErrorCode[];
