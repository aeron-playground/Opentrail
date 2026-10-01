// What the API asks of a swap provider (ADR 0019). Everything else about the provider's API stays
// behind this type, so tests can swap in the fake and a second provider can be added later.
import type { SwapParts } from "@repo/solana";

export type SwapRequest = {
  inputMint: string;
  outputMint: string;
  // Exact in: the raw amount of the input token that goes into the swap.
  amountRaw: bigint;
  slippageBps: number;
  // The person's wallet: it pays the network fee and signs.
  userPublicKey: string;
  // Fewer accounts make a smaller transaction, so ours keeps room for the fee instruction.
  maxAccounts: number;
};

export type SwapRoute = {
  // Raw units of the output token: what the route expects to give, and the least it may give
  // after slippage.
  expectedOutRaw: bigint;
  minOutRaw: bigint;
  // Rounded up, so a safety check never sees less impact than the provider reported.
  priceImpactBps: number;
  // The venues the route goes through, for the quote details.
  routeLabel: string;
  // The provider's own fee; 0 when it takes none. Shown as its own line when above 0.
  providerFeeBps: number;
  // The instructions for the swap itself, without any compute budget: the API sets its own.
  parts: SwapParts;
  addressLookupTableAddresses: string[];
};

// "no_route": the provider won't route this trade (an untradable token, no liquidity).
// "unavailable": the provider didn't answer, or answered in a way we can't trust; worth retrying.
export type SwapFailure = "no_route" | "unavailable";

export class SwapProviderError extends Error {
  readonly failure: SwapFailure;

  constructor(failure: SwapFailure, message: string) {
    super(message);
    this.name = "SwapProviderError";
    this.failure = failure;
  }
}

export type SwapProvider = {
  readonly name: "jupiter" | "fake";
  /** One route for the trade. Throws a SwapProviderError when there is none. */
  getSwapInstructions(request: SwapRequest): Promise<SwapRoute>;
};
