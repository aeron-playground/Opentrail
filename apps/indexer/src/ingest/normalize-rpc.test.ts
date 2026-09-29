import { describe, expect, test } from "bun:test";
import { SOL, USDC } from "@repo/solana";
import { loadFixture } from "../testing";
import { normalizeRpcTransaction } from "./normalize-rpc";

// Real mainnet accounts from the fixtures (public data).
const RELAYER = "AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51";
const USDC_SENDER = "2yhXwyfiELyF336sY6JTWcPxGb3MFuFsQmZbXA6W2upZ";
const USDC_RECEIVER = "7uTT8Xi5RWXzy7h9XL244GRgEycDYDhLjr3ZyNdXi8pZ";

// A small transaction in the RPC shape, for cases no fixture shows.
function rpcTransaction(
  overrides: { meta?: Record<string, unknown>; accountKeys?: string[] } = {},
) {
  return {
    slot: 7,
    blockTime: 1_790_000_000,
    meta: { err: null, fee: 5000, preBalances: [100, 0], postBalances: [95, 0], ...overrides.meta },
    transaction: {
      signatures: ["made-up-signature"],
      message: { accountKeys: overrides.accountKeys ?? ["made-up-payer", "made-up-other"] },
    },
  };
}

const tokenBalance = (accountIndex: number, owner: string | undefined, amount: string) => ({
  accountIndex,
  mint: USDC.mint,
  ...(owner === undefined ? {} : { owner }),
  uiTokenAmount: { amount, decimals: 6 },
});

describe("normalizeRpcTransaction", () => {
  test("reads a real USDC transfer paid for by a relayer", async () => {
    const tx = normalizeRpcTransaction(await loadFixture("transfer-usdc"));

    expect(tx).toMatchObject({
      signature:
        "3AeyuLVPMr53xVWnf1jLsnFCCAtRTUBCtF9yQMAK5iTTxBXZAXeg345HnGutQs6asRs7d1d9BaQrjnsH71ZAUrs4",
      slot: 450_787_941n,
      failed: false,
      feePayer: RELAYER,
      networkFeeLamports: 69_686n,
    });
    // On its own: Bun's toMatchObject treats any two dates as equal.
    expect(tx.blockTime).toEqual(new Date(1_790_456_075_000));
    expect(tx.tokenDeltas).toHaveLength(2);
    expect(tx.tokenDeltas).toContainEqual({
      owner: USDC_SENDER,
      mint: USDC.mint,
      decimals: 6,
      deltaRaw: -50_000_000n,
    });
    expect(tx.tokenDeltas).toContainEqual({
      owner: USDC_RECEIVER,
      mint: USDC.mint,
      decimals: 6,
      deltaRaw: 50_000_000n,
    });
    expect(tx.solDeltas).toEqual([{ owner: RELAYER, deltaLamports: -69_686n, exact: true }]);
  });

  test("reads a real SOL transfer", async () => {
    const tx = normalizeRpcTransaction(await loadFixture("transfer-sol"));
    expect(tx.tokenDeltas).toEqual([]);
    expect(tx.solDeltas).toEqual([
      {
        owner: "AxiomRXZAq1Jgjj9pHmNqVP7Lhu67wLXZJZbaK87TTSk",
        deltaLamports: -9_457_371n,
        exact: true,
      },
      {
        owner: "CaSoKH6ivzKpV5rZ2WHrhwAesDiVktA9FNADSNrpFJj2",
        deltaLamports: 9_402_371n,
        exact: true,
      },
    ]);
  });

  test("reads a real version 1 transaction", async () => {
    const tx = normalizeRpcTransaction(await loadFixture("version-1"));
    expect(tx.networkFeeLamports).toBe(5881n);
    expect(tx.solDeltas).toEqual([
      { owner: "AXmnRBrNtYYyyo82cLBBhnWJ7o1iqNLZbuEVpDB3V666", deltaLamports: -5881n, exact: true },
    ]);
  });

  test("marks a real failed transaction", async () => {
    expect(normalizeRpcTransaction(await loadFixture("failed")).failed).toBe(true);
  });

  test("counts a new token account from zero, and a closed one down to zero", () => {
    const tx = normalizeRpcTransaction(
      rpcTransaction({
        accountKeys: ["made-up-payer", "made-up-new", "made-up-closed"],
        meta: {
          preBalances: [100, 0, 0],
          postBalances: [95, 0, 0],
          preTokenBalances: [tokenBalance(2, "made-up-owner-b", "7")],
          postTokenBalances: [tokenBalance(1, "made-up-owner-a", "3")],
        },
      }),
    );
    expect(tx.tokenDeltas).toEqual([
      { owner: "made-up-owner-b", mint: USDC.mint, decimals: 6, deltaRaw: -7n },
      { owner: "made-up-owner-a", mint: USDC.mint, decimals: 6, deltaRaw: 3n },
    ]);
  });

  test("lines up balances with accounts loaded from lookup tables", () => {
    const tx = normalizeRpcTransaction(
      rpcTransaction({
        meta: {
          preBalances: [100, 0, 10, 20],
          postBalances: [95, 0, 12, 20],
          loadedAddresses: { writable: ["made-up-loaded"], readonly: ["made-up-program"] },
        },
      }),
    );
    expect(tx.solDeltas.map((delta) => [delta.owner, delta.deltaLamports])).toEqual([
      ["made-up-payer", -5n],
      ["made-up-loaded", 2n],
    ]);
  });

  test("flags a balance too large for a JSON number to hold exactly", () => {
    const tx = normalizeRpcTransaction(
      rpcTransaction({ meta: { preBalances: [2 ** 53 + 2, 0], postBalances: [95, 0] } }),
    );
    expect(tx.solDeltas[0]?.exact).toBe(false);
  });

  test("skips token balances without an owner", () => {
    const tx = normalizeRpcTransaction(
      rpcTransaction({ meta: { postTokenBalances: [tokenBalance(1, undefined, "5")] } }),
    );
    expect(tx.tokenDeltas).toEqual([]);
  });

  test.each([
    ["no block time yet", { ...rpcTransaction(), blockTime: null }, "no block time"],
    [
      "balances that don't match the accounts",
      rpcTransaction({ meta: { preBalances: [1], postBalances: [1] } }),
      "don't match",
    ],
    [
      "a balance with a fraction",
      rpcTransaction({ meta: { preBalances: [1.5, 0], postBalances: [95, 0] } }),
      "whole number",
    ],
    [
      "something that isn't a transaction",
      { hello: "world" },
      "Not a transaction in the RPC shape",
    ],
  ])("refuses %s", (_, input, message) => {
    expect(() => normalizeRpcTransaction(input)).toThrow(message);
  });

  test("keeps SOL's mint out of the token deltas of a plain SOL transfer", async () => {
    const tx = normalizeRpcTransaction(await loadFixture("transfer-sol"));
    expect(tx.tokenDeltas.some((delta) => delta.mint === SOL.mint)).toBe(false);
  });
});
