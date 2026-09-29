import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, tokenPrices, tokens } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { createPriceBook } from "../price-book";
import { createFakeJupiter } from "../providers/jupiter/fake";
import { capturedLogger } from "../testing";
import { refreshPricesJob } from "./refresh-prices";

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb("indexer");
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(tokenPrices);
  await handle.db.delete(tokens);
  // Made-up tokens: the addresses name nothing real.
  await handle.db.insert(tokens).values([
    {
      mint: "made-up-a",
      symbol: "AAA",
      name: "A",
      decimals: 6,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 1,
    },
    {
      mint: "made-up-b",
      symbol: "BBB",
      name: "B",
      decimals: 6,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 2,
    },
  ]);
});

function setup(prices: Record<string, { priceUsd: string; change24hPct: string | null }>) {
  const jupiter = createFakeJupiter(prices);
  const { logger, lines } = capturedLogger();
  const job = refreshPricesJob({ priceBook: createPriceBook(handle.db), jupiter, logger });
  return { job, jupiter, lines };
}

const warnings = (lines: Record<string, unknown>[]) =>
  lines.filter((line) => line.level === "warn");

describe("refreshPricesJob", () => {
  test("prices every listed token in one call and saves them", async () => {
    const { job, jupiter } = setup({
      "made-up-a": { priceUsd: "1.5", change24hPct: "3" },
      "made-up-b": { priceUsd: "2", change24hPct: null },
    });

    await job.run();

    expect(jupiter.calls).toEqual([["made-up-a", "made-up-b"]]);
    expect(await handle.db.$count(tokenPrices)).toBe(2);
  });

  test("warns once about a token Jupiter skips, and again only when that changes", async () => {
    const { job, jupiter, lines } = setup({ "made-up-a": { priceUsd: "1", change24hPct: null } });

    await job.run();
    await job.run();
    expect(warnings(lines)).toEqual([expect.objectContaining({ missing: ["made-up-b"] })]);

    jupiter.prices.set("made-up-b", { priceUsd: "2", change24hPct: null });
    await job.run();
    jupiter.prices.delete("made-up-b");
    await job.run();
    expect(warnings(lines)).toHaveLength(2);
  });

  test("asks nothing when no token is listed", async () => {
    await handle.db.delete(tokens);
    const { job, jupiter } = setup({});
    await job.run();
    expect(jupiter.calls).toEqual([]);
  });

  test("saves nothing when Jupiter fails, so the scheduler can log it and try again", async () => {
    const { job, jupiter } = setup({ "made-up-a": { priceUsd: "1", change24hPct: null } });
    jupiter.failWith(new Error("Jupiter prices answered 503"));

    await expect(job.run()).rejects.toThrow("Jupiter prices answered 503");
    expect(await handle.db.$count(tokenPrices)).toBe(0);
  });
});
