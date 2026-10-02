// A trade after its quote. The API, the web app and the mobile app share these, so every screen
// says the same thing about the same trade.

/** built → submitted → confirmed | failed | expired, and never backwards. */
export const SWAP_STATUSES = ["built", "submitted", "confirmed", "failed", "expired"] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];

/** Why a trade that reached the network failed. */
export const SWAP_FAILURE_REASONS = ["slippage", "insufficient_sol", "frozen", "unknown"] as const;
export type SwapFailureReason = (typeof SWAP_FAILURE_REASONS)[number];

/** What to tell the person about each failure: what happened, and what it cost. */
export const SWAP_FAILURE_MESSAGES: Readonly<Record<SwapFailureReason, string>> = {
  slippage: "The price moved more than your slippage limit. Only the network fee was used.",
  insufficient_sol: "Not enough SOL for network fees.",
  frozen: "This token is frozen for your wallet by its issuer.",
  unknown: "The trade failed. Only the network fee was used.",
};

/** For a trade that never landed before its blockhash ran out. */
export const SWAP_EXPIRED_MESSAGE =
  "The network didn't pick up your trade in time. Nothing was spent.";
