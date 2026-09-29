import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createRateLimit } from "../lib/rate-limit";
import { createGeckoTerminal } from "../providers/geckoterminal/geckoterminal";
import type { Pool } from "../providers/geckoterminal/types";
import { choosePrimaryPool } from "./primary-pool";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// SOL's real top pools from GeckoTerminal (2026-09-29), read through the real provider.
async function solPools(): Promise<Pool[]> {
  const answer = await Bun.file(
    join(import.meta.dir, "..", "..", "test", "fixtures", "geckoterminal-pools-sol.json"),
  ).text();
  const gecko = createGeckoTerminal({
    rateLimit: createRateLimit(0),
    fetch: async () => new Response(answer),
  });
  return gecko.pools(SOL);
}

const pool = (
  address: string,
  baseMint: string,
  quoteMint: string,
  liquidityUsd: string,
): Pool => ({
  address,
  baseMint,
  quoteMint,
  liquidityUsd,
});

describe("choosePrimaryPool", () => {
  test("picks SOL's most liquid USDC pool, not the bigger pool paired with an obscure token", async () => {
    const pools = await solPools();
    const biggest = [...pools].sort((a, b) => Number(b.liquidityUsd) - Number(a.liquidityUsd))[0];
    expect(biggest?.address).toBe("ASHmT6FChGugh96VC5s3Z6PB7edTZWYrPrjKjm1rrzPe");

    expect(choosePrimaryPool(SOL, pools)).toBe("58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2");
  });

  test("takes a SOL pair for another token, whichever side the token is on", () => {
    const pools = [
      pool("made-up-quote-side", SOL, "made-up-token", "5000000"),
      pool("made-up-base-side", "made-up-token", USDC, "4000000"),
    ];
    expect(choosePrimaryPool("made-up-token", pools)).toBe("made-up-quote-side");
  });

  test("compares liquidity exactly, beyond what a float can tell apart", () => {
    const pools = [
      pool("made-up-a", "made-up-token", USDC, "9007199254740993.01"),
      pool("made-up-b", "made-up-token", USDC, "9007199254740993.02"),
    ];
    expect(choosePrimaryPool("made-up-token", pools)).toBe("made-up-b");
  });

  test.each([
    ["no pools", []],
    [
      "only pools paired with other tokens",
      [pool("made-up", "made-up-token", "made-up-other", "9")],
    ],
    ["only pools of other tokens", [pool("made-up", SOL, "made-up-other", "9")]],
    ["a pool pairing the token with itself", [pool("made-up", USDC, USDC, "9")]],
  ])("finds none among %s", (_, pools) => {
    expect(choosePrimaryPool(USDC, pools as Pool[])).toBeNull();
  });
});
