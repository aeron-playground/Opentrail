import { describe, expect, test } from "bun:test";
import { SOL, USDC } from "@repo/solana";
import type { ChartToken } from "../chart-book";
import { createFakeGeckoTerminal } from "../providers/geckoterminal/fake";
import { RateLimitedError } from "../providers/geckoterminal/types";
import { capturedLogger } from "../testing";
import { POOL_RECHECK_MS, refreshPoolsJob } from "./refresh-pools";

// Made-up tokens and pools, paired with the real USDC and SOL mints.
function setup(tokens: ChartToken[]) {
  const gecko = createFakeGeckoTerminal();
  const saved: [string, string][] = [];
  let time = 1_000_000;
  const { logger, lines } = capturedLogger();
  const job = refreshPoolsJob({
    chartBook: {
      listedTokens: async () => tokens,
      setPrimaryPool: async (mint, address) => {
        saved.push([mint, address]);
      },
    },
    gecko,
    logger,
    now: () => time,
  });
  const pool = (address: string, mint: string, pair: string, liquidityUsd: string) => ({
    address,
    baseMint: mint,
    quoteMint: pair,
    liquidityUsd,
  });
  return { job, gecko, saved, lines, pool, advance: (ms: number) => (time += ms) };
}

describe("refreshPoolsJob", () => {
  test("saves each token's most liquid USDC or SOL pool", async () => {
    const { job, gecko, saved, pool } = setup([
      { mint: "made-up-a", primaryPoolAddress: null },
      { mint: "made-up-b", primaryPoolAddress: null },
    ]);
    gecko.poolsByMint.set("made-up-a", [
      pool("made-up-a-usdc", "made-up-a", USDC.mint, "2000000"),
      pool("made-up-a-sol", "made-up-a", SOL.mint, "3000000"),
    ]);
    gecko.poolsByMint.set("made-up-b", [pool("made-up-b-usdc", "made-up-b", USDC.mint, "1")]);

    await job.run();

    expect(saved).toEqual([
      ["made-up-a", "made-up-a-sol"],
      ["made-up-b", "made-up-b-usdc"],
    ]);
  });

  test("writes nothing when the pool is already the one", async () => {
    const { job, gecko, saved, pool } = setup([
      { mint: "made-up-a", primaryPoolAddress: "made-up-p" },
    ]);
    gecko.poolsByMint.set("made-up-a", [pool("made-up-p", "made-up-a", USDC.mint, "5")]);
    await job.run();
    expect(saved).toEqual([]);
  });

  test("keeps the token's pool when no USDC or SOL pool is found", async () => {
    const { job, saved, lines } = setup([{ mint: "made-up-a", primaryPoolAddress: "made-up-p" }]);
    await job.run();
    expect(saved).toEqual([]);
    expect(lines).toContainEqual(expect.objectContaining({ level: "warn", mint: "made-up-a" }));
  });

  test("checks each token once a day", async () => {
    const { job, gecko, advance } = setup([{ mint: "made-up-a", primaryPoolAddress: null }]);
    await job.run();
    advance(POOL_RECHECK_MS - 1);
    await job.run();
    expect(gecko.poolCalls).toHaveLength(1);

    advance(1);
    await job.run();
    expect(gecko.poolCalls).toHaveLength(2);
  });

  test("stops at a rate limit, and checks the rest on the next run", async () => {
    const { job, gecko, lines } = setup([
      { mint: "made-up-a", primaryPoolAddress: null },
      { mint: "made-up-b", primaryPoolAddress: null },
    ]);
    gecko.failWith(new RateLimitedError("GeckoTerminal answered 429"));
    await job.run();
    expect(lines).toContainEqual(expect.objectContaining({ level: "warn" }));

    gecko.failWith(null);
    await job.run();
    expect(gecko.poolCalls).toEqual(["made-up-a", "made-up-a", "made-up-b"]);
  });

  test("lets any other failure reach the scheduler's log", async () => {
    const { job, gecko } = setup([{ mint: "made-up-a", primaryPoolAddress: null }]);
    gecko.failWith(new Error("GeckoTerminal answered 500"));
    await expect(job.run()).rejects.toThrow("GeckoTerminal answered 500");
  });
});
