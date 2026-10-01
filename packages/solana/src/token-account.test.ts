import { describe, expect, test } from "bun:test";
import { address } from "@solana/kit";
import { USDC } from "./mints";
import { associatedTokenAddress } from "./token-account";

describe("associatedTokenAddress", () => {
  // Real wallets and the USDC accounts mainnet lists for them (public data).
  test.each([
    [
      "ExYDCa8Gvw8VynhG9SWNKK9k5gg4FpYtf1cF3BUhiDgo",
      "54Y5XFzz2bfCKvziXnKuMs1Apv4wGBzoHV1V7WCNib8H",
    ],
    [
      "AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51",
      "7VRD4eLZVU8qGwTUjfCRTCvkMTzAiTbSZ8CzU9zWBDU6",
    ],
  ])("finds the USDC account of %s as mainnet has it", async (owner, account) => {
    expect(
      await associatedTokenAddress({ owner, mint: USDC.mint, tokenProgram: "spl-token" }),
    ).toBe(address(account));
  });

  test("gives another address under Token-2022, since the program is part of it", async () => {
    const owner = "ExYDCa8Gvw8VynhG9SWNKK9k5gg4FpYtf1cF3BUhiDgo";
    const legacy = await associatedTokenAddress({
      owner,
      mint: USDC.mint,
      tokenProgram: "spl-token",
    });
    const t22 = await associatedTokenAddress({
      owner,
      mint: USDC.mint,
      tokenProgram: "token-2022",
    });
    expect(t22).not.toBe(legacy);
  });
});
