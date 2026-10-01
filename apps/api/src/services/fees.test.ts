import { describe, expect, test } from "bun:test";
import { USDC } from "@repo/solana";
import { address } from "@solana/kit";
import { createFakeSolana } from "../providers/solana/fake";
import type { TokenAccount } from "../providers/solana/types";
import { buyFee, checkFeeWallet, type FeeSettings, feeOn, feeSettings, sellFee } from "./fees";

// A real wallet and the USDC account mainnet lists for it (public data), standing in for the fee
// wallet.
const WALLET = "AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51";
const WALLET_USDC = address("7VRD4eLZVU8qGwTUjfCRTCvkMTzAiTbSZ8CzU9zWBDU6");
const OTHER_WALLET = "ExYDCa8Gvw8VynhG9SWNKK9k5gg4FpYtf1cF3BUhiDgo";

const OFF: FeeSettings = { enabled: false };
const ON = await feeSettings({
  FEES_ENABLED: true,
  PLATFORM_FEE_BPS: 10,
  FEE_WALLET_ADDRESS: WALLET,
});

describe("feeOn", () => {
  test.each([
    ["$100 at 10 bps is $0.10", 100_000_000n, 10, 100_000n],
    ["$50 at 10 bps is $0.05", 50_000_000n, 10, 50_000n],
    ["rounds down: 999 micro-USDC at 10 bps is nothing", 999n, 10, 0n],
    ["rounds down: $1.000001 at 100 bps is $0.01", 1_000_001n, 100, 10_000n],
    ["a rate of 0 is nothing", 1_000_000n, 0, 0n],
    ["nothing at any rate is nothing", 0n, 10, 0n],
    ["the whole amount at 10,000 bps", 1_000_000n, 10_000, 1_000_000n],
  ])("%s", (_, base, bps, fee) => {
    expect(feeOn(base, bps)).toBe(fee);
  });

  test.each([
    ["a negative amount", -1n, 10],
    ["a negative rate", 1_000_000n, -1],
    ["a fractional rate", 1_000_000n, 1.5],
    ["a rate above the whole amount", 1_000_000n, 10_001],
  ])("refuses %s", (_, base, bps) => {
    expect(() => feeOn(base, bps)).toThrow(RangeError);
  });
});

describe("buyFee", () => {
  test("takes the fee off the top and swaps the rest: $100 pays $0.10 and swaps $99.90", () => {
    expect(buyFee(ON, 100_000_000n)).toEqual({ feeMicro: 100_000n, swapInMicro: 99_900_000n });
  });

  test("with fees off, swaps the whole amount", () => {
    expect(buyFee(OFF, 100_000_000n)).toEqual({ feeMicro: 0n, swapInMicro: 100_000_000n });
  });
});

describe("sellFee", () => {
  test("charges the least USDC the sale is sure to bring: $50 pays $0.05", () => {
    expect(sellFee(ON, 50_000_000n)).toBe(50_000n);
  });

  test("with fees off, charges nothing", () => {
    expect(sellFee(OFF, 50_000_000n)).toBe(0n);
  });
});

describe("feeSettings", () => {
  test("with fees on, finds the fee wallet's USDC account", () => {
    expect(ON).toEqual({ enabled: true, bps: 10, wallet: WALLET, usdcAccount: WALLET_USDC });
  });

  test("with fees off, is off whatever else is set", async () => {
    expect(
      await feeSettings({ FEES_ENABLED: false, PLATFORM_FEE_BPS: 10, FEE_WALLET_ADDRESS: WALLET }),
    ).toEqual(OFF);
  });

  test("refuses fees on without a fee wallet", async () => {
    await expect(feeSettings({ FEES_ENABLED: true, PLATFORM_FEE_BPS: 10 })).rejects.toThrow(
      "FEE_WALLET_ADDRESS",
    );
  });
});

describe("checkFeeWallet", () => {
  const usdcAccount: TokenAccount = { mint: USDC.mint, owner: WALLET, frozen: false };

  test("passes when the fee wallet's USDC account can receive", async () => {
    const solana = createFakeSolana();
    solana.setTokenAccount(WALLET_USDC, usdcAccount);
    await checkFeeWallet(ON, solana);
    expect(solana.reads).toBe(1);
  });

  test("with fees off, doesn't look", async () => {
    const solana = createFakeSolana();
    await checkFeeWallet(OFF, solana);
    expect(solana.reads).toBe(0);
  });

  test.each<[string, TokenAccount | null, string]>([
    ["there's no account", null, "has no USDC account"],
    [
      "the account holds another token",
      { ...usdcAccount, mint: "So11111111111111111111111111111111111111112" },
      "doesn't hold USDC",
    ],
    [
      "the account belongs to another wallet",
      { ...usdcAccount, owner: OTHER_WALLET },
      "belongs to another wallet",
    ],
    ["the account is frozen", { ...usdcAccount, frozen: true }, "is frozen"],
  ])("refuses to go on when %s", async (_, account, message) => {
    const solana = createFakeSolana();
    if (account) {
      solana.setTokenAccount(WALLET_USDC, account);
    }
    await expect(checkFeeWallet(ON, solana)).rejects.toThrow(message);
  });

  test("refuses to go on when Solana doesn't answer, without repeating Solana's error", async () => {
    const solana = createFakeSolana();
    solana.fail(new Error("fetch failed for https://rpc.example.com/?api-key=secret"));
    const error = await checkFeeWallet(ON, solana).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Couldn't read");
    expect((error as Error).message).not.toContain("secret");
  });
});
