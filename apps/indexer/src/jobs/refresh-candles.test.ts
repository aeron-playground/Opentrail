import { describe, expect, test } from "bun:test";
import type { CandleTimeframe } from "@repo/db";
import type { ChartToken } from "../chart-book";
import { createFakeGeckoTerminal } from "../providers/geckoterminal/fake";
import { type CandleQuote, RateLimitedError } from "../providers/geckoterminal/types";
import { capturedLogger } from "../testing";
import { CANDLE_REFRESH_MS, RATE_LIMIT_PAUSE_MS, refreshCandlesJob } from "./refresh-candles";

// Made-up tokens and pools; the clock only moves when a test moves it.
function setup(tokens: ChartToken[], newest: Record<string, Date> = {}) {
  const gecko = createFakeGeckoTerminal();
  const saved: { mint: string; timeframe: CandleTimeframe; count: number }[] = [];
  let time = Date.UTC(2026, 8, 29, 12);
  const { logger, lines } = capturedLogger();
  const job = refreshCandlesJob({
    chartBook: {
      listedTokens: async () => tokens,
      newestBucket: async (mint, timeframe) => newest[`${mint}/${timeframe}`] ?? null,
      saveCandles: async (mint, timeframe, quotes: readonly CandleQuote[]) => {
        saved.push({ mint, timeframe, count: quotes.length });
        return quotes.length;
      },
    },
    gecko,
    logger,
    now: () => time,
  });
  const calls = () =>
    gecko.candleCalls.map((call) => `${call.mint}/${call.timeframe}/${call.limit}`);
  return {
    job,
    gecko,
    saved,
    lines,
    calls,
    now: () => time,
    advance: (ms: number) => (time += ms),
  };
}

describe("refreshCandlesJob", () => {
  test("fetches one chart per run, 1,000 candles the first time", async () => {
    const { job, calls } = setup([{ mint: "made-up-a", primaryPoolAddress: "made-up-pool" }]);
    await job.run();
    expect(calls()).toEqual(["made-up-a/15m/1000"]);
    await job.run();
    expect(calls()).toEqual(["made-up-a/15m/1000", "made-up-a/1h/1000"]);
  });

  test("skips a token without a main pool", async () => {
    const { job, gecko } = setup([{ mint: "made-up-a", primaryPoolAddress: null }]);
    await job.run();
    expect(gecko.candleCalls).toEqual([]);
  });

  test("does nothing while no chart is due, then refreshes the most overdue", async () => {
    const { job, calls, advance } = setup([
      { mint: "made-up-a", primaryPoolAddress: "made-up-pool" },
    ]);
    for (let run = 0; run < 4; run += 1) await job.run();
    await job.run();
    expect(calls()).toHaveLength(4);

    advance(CANDLE_REFRESH_MS["1h"]);
    await job.run();
    // Both 15m and 1h are due now; 15m has been waiting longer past its target.
    expect(calls().at(-1)).toBe("made-up-a/15m/1000");
  });

  test("asks only for the candles since the newest one stored", async () => {
    const newest = { "made-up-a/15m": new Date(Date.UTC(2026, 8, 29, 11)) };
    const { job, calls } = setup(
      [{ mint: "made-up-a", primaryPoolAddress: "made-up-pool" }],
      newest,
    );
    await job.run();
    // 60 minutes behind: four 15-minute candles, plus the newest stored one, still open.
    expect(calls()).toEqual(["made-up-a/15m/5"]);
  });

  test("saves what GeckoTerminal sends", async () => {
    const { job, gecko, saved } = setup([
      { mint: "made-up-a", primaryPoolAddress: "made-up-pool" },
    ]);
    gecko.candlesBySeries.set("made-up-pool/15m", [
      { bucketStart: new Date(0), open: "1", high: "1", low: "1", close: "1", volumeUsd: "0" },
    ]);
    await job.run();
    expect(saved).toEqual([{ mint: "made-up-a", timeframe: "15m", count: 1 }]);
  });

  test("pauses for a minute at a rate limit, then retries that chart first", async () => {
    const { job, gecko, calls, lines, advance } = setup([
      { mint: "made-up-a", primaryPoolAddress: "made-up-pool" },
    ]);
    gecko.failWith(new RateLimitedError("GeckoTerminal answered 429"));
    await job.run();
    expect(lines).toContainEqual(expect.objectContaining({ level: "warn" }));

    gecko.failWith(null);
    advance(RATE_LIMIT_PAUSE_MS - 1);
    await job.run();
    expect(calls()).toHaveLength(1);

    advance(1);
    await job.run();
    expect(calls()).toEqual(["made-up-a/15m/1000", "made-up-a/15m/1000"]);
  });

  test("lets a chart that fails wait its turn, and reports the failure", async () => {
    const { job, gecko, calls } = setup([
      { mint: "made-up-a", primaryPoolAddress: "made-up-pool" },
    ]);
    gecko.failWith(new Error("GeckoTerminal answered 404"));
    await expect(job.run()).rejects.toThrow("GeckoTerminal answered 404");

    gecko.failWith(null);
    await job.run();
    expect(calls()).toEqual(["made-up-a/15m/1000", "made-up-a/1h/1000"]);
  });

  test("goes through every token's charts", async () => {
    const { job, calls } = setup([
      { mint: "made-up-a", primaryPoolAddress: "made-up-pool-a" },
      { mint: "made-up-b", primaryPoolAddress: "made-up-pool-b" },
    ]);
    for (let run = 0; run < 8; run += 1) await job.run();
    expect(new Set(calls()).size).toBe(8);
    expect(calls().filter((call) => call.startsWith("made-up-b/"))).toHaveLength(4);
  });
});
