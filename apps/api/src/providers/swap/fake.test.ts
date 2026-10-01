import { describe, expect, test } from "bun:test";
import { USDC } from "@repo/solana";
import { AccountRole, address } from "@solana/kit";
import { createFakeSwapProvider, fakeRoute } from "./fake";
import { SwapProviderError, type SwapRequest } from "./types";

const REQUEST: SwapRequest = {
  inputMint: USDC.mint,
  outputMint: "So11111111111111111111111111111111111111112",
  amountRaw: 1_000_000n,
  slippageBps: 50,
  userPublicKey: "ExYDCa8Gvw8VynhG9SWNKK9k5gg4FpYtf1cF3BUhiDgo",
  maxAccounts: 54,
};

describe("createFakeSwapProvider", () => {
  test("by default, routes one for one with the slippage as the minimum, signed by the wallet", async () => {
    const swaps = createFakeSwapProvider();
    const route = await swaps.getSwapInstructions(REQUEST);
    expect(route.expectedOutRaw).toBe(1_000_000n);
    expect(route.minOutRaw).toBe(995_000n);
    expect(route.parts.swap.accounts).toEqual([
      { address: address(REQUEST.userPublicKey), role: AccountRole.WRITABLE_SIGNER },
    ]);
    expect(swaps.requests).toEqual([REQUEST]);
  });

  test("answers as told, for example a wide route until fewer accounts are asked for", async () => {
    const swaps = createFakeSwapProvider();
    swaps.respond((request) =>
      fakeRoute(request, { extraAccounts: request.maxAccounts > 40 ? 60 : 10 }),
    );
    const wide = await swaps.getSwapInstructions(REQUEST);
    const narrow = await swaps.getSwapInstructions({ ...REQUEST, maxAccounts: 40 });
    expect(wide.parts.swap.accounts).toHaveLength(61);
    expect(new Set((wide.parts.swap.accounts ?? []).map((a) => a.address)).size).toBe(61);
    expect(narrow.parts.swap.accounts).toHaveLength(11);
  });

  test("throws the error it's given", async () => {
    const swaps = createFakeSwapProvider();
    swaps.respond(() => new SwapProviderError("no_route", "no route"));
    await expect(swaps.getSwapInstructions(REQUEST)).rejects.toThrow(SwapProviderError);
  });
});
