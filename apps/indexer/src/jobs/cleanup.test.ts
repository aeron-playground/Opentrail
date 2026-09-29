import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { candles, type DbHandle, tokens, webhookEvents } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { sql } from "drizzle-orm";
import { createChartBook } from "../chart-book";
import { createInbox } from "../inbox";
import { capturedLogger, fakeRawTransaction, fakeSignature } from "../testing";
import { CANDLE_RETENTION_DAYS, cleanupJob, RETENTION_DAYS } from "./cleanup";

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb("indexer");
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(webhookEvents);
  await handle.db.delete(candles);
  await handle.db.delete(tokens);
});

const deps = () => ({
  inbox: createInbox(handle.db),
  chartBook: createChartBook(handle.db),
});

// Inserts an event received long ago; processedDaysAgo null means "not processed yet".
async function insertEvent(label: string, processedDaysAgo: number | null): Promise<void> {
  const signature = `${label}-${fakeSignature()}`;
  await handle.db.execute(sql`
    insert into webhook_events (id, provider, signature, payload, received_at, processed_at)
    values (
      ${Bun.randomUUIDv7()}, 'helius', ${signature}, ${JSON.stringify(fakeRawTransaction(signature))}::jsonb,
      now() - interval '60 days',
      ${processedDaysAgo === null ? sql`null` : sql`now() - make_interval(days => ${processedDaysAgo})`}
    )
  `);
}

test(`deletes events processed more than ${RETENTION_DAYS} days ago, and nothing else`, async () => {
  await insertEvent("old", RETENTION_DAYS + 1);
  await insertEvent("recent", RETENTION_DAYS - 1);
  await insertEvent("pending", null);
  const { logger, lines } = capturedLogger();

  await cleanupJob({ ...deps(), logger }).run();

  const left = await handle.db.select({ signature: webhookEvents.signature }).from(webhookEvents);
  expect(left.map((row) => row.signature.split("-")[0]).sort()).toEqual(["pending", "recent"]);
  expect(lines.find((line) => line.msg === "old webhook events deleted")).toMatchObject({
    deleted: 1,
  });
});

test("logs nothing when there is nothing to delete", async () => {
  const { logger, lines } = capturedLogger();
  await cleanupJob({ ...deps(), logger }).run();
  expect(lines).toHaveLength(0);
});

test("uses the clock it's given for the cutoff", async () => {
  const cutoffs: Date[] = [];
  const now = new Date("2026-09-24T12:00:00Z");
  const job = cleanupJob({
    inbox: {
      deleteProcessedBefore: async (cutoff) => {
        cutoffs.push(cutoff);
        return 0;
      },
    },
    chartBook: {
      deleteCandlesBefore: async (_timeframe, cutoff) => {
        cutoffs.push(cutoff);
        return 0;
      },
    },
    logger: capturedLogger().logger,
    now: () => now,
  });

  await job.run();
  expect(cutoffs).toEqual([
    new Date("2026-08-25T12:00:00Z"),
    new Date("2026-08-25T12:00:00Z"),
    new Date("2025-09-24T12:00:00Z"),
  ]);
  expect(job).toMatchObject({ name: "cleanup", everyMs: 24 * 60 * 60 * 1000 });
});

test("deletes 15m and 1h candles past their retention, and keeps 4h and 1d", async () => {
  // A made-up token: the address names nothing real.
  await handle.db.insert(tokens).values({
    mint: "made-up-mint",
    symbol: "M",
    name: "M",
    decimals: 6,
    tokenProgram: "spl-token",
  });
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const candle = (timeframe: "15m" | "1h" | "4h" | "1d", days: number) => ({
    mint: "made-up-mint",
    timeframe,
    bucketStart: daysAgo(days),
    open: "1",
    high: "1",
    low: "1",
    close: "1",
    volumeUsd: "0",
  });
  const limit15m = CANDLE_RETENTION_DAYS["15m"] ?? 0;
  const limit1h = CANDLE_RETENTION_DAYS["1h"] ?? 0;
  await handle.db
    .insert(candles)
    .values([
      candle("15m", limit15m + 1),
      candle("15m", limit15m - 1),
      candle("1h", limit1h + 1),
      candle("1h", limit1h - 1),
      candle("4h", 5_000),
      candle("1d", 5_000),
    ]);
  const { logger, lines } = capturedLogger();

  await cleanupJob({ ...deps(), logger }).run();

  const left = await handle.db.select({ timeframe: candles.timeframe }).from(candles);
  expect(left.map((row) => row.timeframe).sort()).toEqual(["15m", "1d", "1h", "4h"]);
  expect(lines.filter((line) => line.msg === "old candles deleted")).toHaveLength(2);
});
