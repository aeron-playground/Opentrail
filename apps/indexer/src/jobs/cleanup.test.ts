import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { type DbHandle, webhookEvents } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { sql } from "drizzle-orm";
import { createInbox } from "../inbox";
import { capturedLogger, fakeRawTransaction, fakeSignature } from "../testing";
import { cleanupJob, RETENTION_DAYS } from "./cleanup";

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb("indexer");
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(webhookEvents);
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

  await cleanupJob({ inbox: createInbox(handle.db), logger }).run();

  const left = await handle.db.select({ signature: webhookEvents.signature }).from(webhookEvents);
  expect(left.map((row) => row.signature.split("-")[0]).sort()).toEqual(["pending", "recent"]);
  expect(lines.find((line) => line.msg === "old webhook events deleted")).toMatchObject({
    deleted: 1,
  });
});

test("logs nothing when there is nothing to delete", async () => {
  const { logger, lines } = capturedLogger();
  await cleanupJob({ inbox: createInbox(handle.db), logger }).run();
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
    logger: capturedLogger().logger,
    now: () => now,
  });

  await job.run();
  expect(cutoffs).toEqual([new Date("2026-08-25T12:00:00Z")]);
  expect(job).toMatchObject({ name: "cleanup", everyMs: 24 * 60 * 60 * 1000 });
});
