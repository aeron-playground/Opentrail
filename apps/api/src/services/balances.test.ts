import { describe, expect, test } from "bun:test";
import { SOL, USDC } from "@repo/solana";
import { createFakeSolana } from "../providers/solana/fake";
import { createBalanceService } from "./balances";

const WALLET = "made-up-wallet-a";
const OTHER = "made-up-wallet-b";

function setup(options: { maxWallets?: number } = {}) {
  const solana = createFakeSolana();
  let clock = new Date("2026-09-26T10:00:00.000Z");
  const service = createBalanceService({ solana, now: () => clock, ...options });
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  return { solana, service, advance };
}

const amounts = async (service: ReturnType<typeof setup>["service"], wallet = WALLET) =>
  (await service.forWallet(wallet)).balances.map((b) => [b.token.symbol, b.amountRaw]);

describe("forWallet", () => {
  test("reads USDC and SOL, in that order, with the time", async () => {
    const { solana, service } = setup();
    solana.setToken(WALLET, USDC.mint, 50_000_000n);
    solana.setSol(WALLET, 20_000_000n);

    const result = await service.forWallet(WALLET);
    expect(result.balances).toEqual([
      { token: USDC, amountRaw: 50_000_000n },
      { token: SOL, amountRaw: 20_000_000n },
    ]);
    expect(result.updatedAt).toEqual(new Date("2026-09-26T10:00:00.000Z"));
  });

  test("gives 0 for a wallet with nothing yet", async () => {
    expect(await amounts(setup().service)).toEqual([
      ["USDC", 0n],
      ["SOL", 0n],
    ]);
  });

  test("answers from the cache for 5 seconds, then reads again", async () => {
    const { solana, service, advance } = setup();
    await service.forWallet(WALLET);
    solana.setSol(WALLET, 1n);
    advance(4_999);
    expect(await amounts(service)).toEqual([
      ["USDC", 0n],
      ["SOL", 0n],
    ]);
    expect(solana.reads).toBe(2);

    advance(1);
    expect(await amounts(service)).toEqual([
      ["USDC", 0n],
      ["SOL", 1n],
    ]);
    expect(solana.reads).toBe(4);
  });

  test("shares one read between requests that arrive together", async () => {
    const { solana, service } = setup();
    await Promise.all([service.forWallet(WALLET), service.forWallet(WALLET)]);
    expect(solana.reads).toBe(2);
  });

  test("keeps each wallet apart", async () => {
    const { solana, service } = setup();
    solana.setSol(OTHER, 5n);
    expect(await amounts(service, WALLET)).toEqual([
      ["USDC", 0n],
      ["SOL", 0n],
    ]);
    expect(await amounts(service, OTHER)).toEqual([
      ["USDC", 0n],
      ["SOL", 5n],
    ]);
  });

  test("doesn't keep a failed read", async () => {
    const { solana, service } = setup();
    solana.fail(new Error("RPC down"));
    await expect(service.forWallet(WALLET)).rejects.toThrow("RPC down");

    solana.fail(null);
    solana.setSol(WALLET, 7n);
    expect(await amounts(service)).toEqual([
      ["USDC", 0n],
      ["SOL", 7n],
    ]);
  });

  test("forgets the oldest wallet when the cache is full", async () => {
    const { solana, service } = setup({ maxWallets: 1 });
    await service.forWallet(WALLET);
    await service.forWallet(OTHER);
    await service.forWallet(WALLET);
    expect(solana.reads).toBe(6);
  });
});
