import { describe, expect, test } from "bun:test";
import { SOL, USDC } from "@repo/solana";
import { loadFixture } from "../testing";
import { findDeposits } from "./classify";
import { type NormalizedTx, normalizeRpcTransaction } from "./normalize-rpc";

// Real mainnet accounts from the fixtures (public data).
const RELAYER = "AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51";
const USDC_SENDER = "2yhXwyfiELyF336sY6JTWcPxGb3MFuFsQmZbXA6W2upZ";
const USDC_RECEIVER = "7uTT8Xi5RWXzy7h9XL244GRgEycDYDhLjr3ZyNdXi8pZ";
const SOL_SENDER = "AxiomRXZAq1Jgjj9pHmNqVP7Lhu67wLXZJZbaK87TTSk";
const SOL_RECEIVER = "CaSoKH6ivzKpV5rZ2WHrhwAesDiVktA9FNADSNrpFJj2";
const SWAPPER = "ExYDCa8Gvw8VynhG9SWNKK9k5gg4FpYtf1cF3BUhiDgo";
const POOL = "8R5qdXKMn2KcfHBy9rEpi43KScHewqvRAcpFyqoL3wap";

const fixture = async (name: string) => normalizeRpcTransaction(await loadFixture(name));
const watching = (...wallets: string[]) => new Set(wallets);

describe("findDeposits on real transactions", () => {
  test("a USDC transfer is a deposit for the receiver, naming the sender", async () => {
    expect(findDeposits(await fixture("transfer-usdc"), watching(USDC_RECEIVER))).toEqual([
      {
        wallet: USDC_RECEIVER,
        mint: USDC.mint,
        decimals: 6,
        amountRaw: 50_000_000n,
        counterparty: USDC_SENDER,
      },
    ]);
  });

  test("a SOL transfer is a deposit for the receiver, naming the sender", async () => {
    expect(findDeposits(await fixture("transfer-sol"), watching(SOL_RECEIVER))).toEqual([
      {
        wallet: SOL_RECEIVER,
        mint: SOL.mint,
        decimals: 9,
        amountRaw: 9_402_371n,
        counterparty: SOL_SENDER,
      },
    ]);
  });

  test.each([
    ["the USDC sender (a withdrawal, later)", "transfer-usdc", USDC_SENDER],
    ["a relayer that only paid the fee", "transfer-usdc", RELAYER],
    ["the SOL sender", "transfer-sol", SOL_SENDER],
    ["a wallet that swapped", "external-swap-usdc", SWAPPER],
    ["the pool on the other side of the swap", "external-swap-usdc", POOL],
    ["the payer of a failed transaction", "failed", "CA59n4oZNMEdzRPJWjjVEN5SL2kvhkasRMP73SNYh6x4"],
    [
      "a wallet that only paid a fee, in a version 1 transaction",
      "version-1",
      "AXmnRBrNtYYyyo82cLBBhnWJ7o1iqNLZbuEVpDB3V666",
    ],
  ])("finds nothing for %s", async (_, name, wallet) => {
    expect(findDeposits(await fixture(name), watching(wallet))).toEqual([]);
  });

  test("finds nothing when none of the wallets is ours", async () => {
    expect(findDeposits(await fixture("transfer-usdc"), watching())).toEqual([]);
  });
});

describe("findDeposits on made-up cases", () => {
  const base: NormalizedTx = {
    signature: "made-up",
    slot: 1n,
    blockTime: new Date(0),
    failed: false,
    feePayer: "made-up-sender",
    networkFeeLamports: 5000n,
    tokenDeltas: [],
    solDeltas: [],
  };

  test("adds native and wrapped SOL into one deposit", () => {
    const tx: NormalizedTx = {
      ...base,
      tokenDeltas: [{ owner: "made-up-me", mint: SOL.mint, decimals: 9, deltaRaw: 300n }],
      solDeltas: [
        { owner: "made-up-me", deltaLamports: 700n, exact: true },
        { owner: "made-up-sender", deltaLamports: -6000n, exact: true },
      ],
    };
    expect(findDeposits(tx, watching("made-up-me"))).toEqual([
      {
        wallet: "made-up-me",
        mint: SOL.mint,
        decimals: 9,
        amountRaw: 1000n,
        counterparty: "made-up-sender",
      },
    ]);
  });

  test("names no sender when several accounts sent the same token", () => {
    const tx: NormalizedTx = {
      ...base,
      tokenDeltas: [
        { owner: "made-up-me", mint: USDC.mint, decimals: 6, deltaRaw: 2n },
        { owner: "made-up-a", mint: USDC.mint, decimals: 6, deltaRaw: -1n },
        { owner: "made-up-b", mint: USDC.mint, decimals: 6, deltaRaw: -1n },
      ],
    };
    expect(findDeposits(tx, watching("made-up-me"))[0]?.counterparty).toBeNull();
  });

  test("records nothing for a failed transaction, even with changes", () => {
    const tx: NormalizedTx = {
      ...base,
      failed: true,
      tokenDeltas: [{ owner: "made-up-me", mint: USDC.mint, decimals: 6, deltaRaw: 2n }],
    };
    expect(findDeposits(tx, watching("made-up-me"))).toEqual([]);
  });

  test("refuses a watched balance too large to read exactly", () => {
    const tx: NormalizedTx = {
      ...base,
      solDeltas: [{ owner: "made-up-me", deltaLamports: 1n, exact: false }],
    };
    expect(() => findDeposits(tx, watching("made-up-me"))).toThrow("too large");
  });
});
