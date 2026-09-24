import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, webhookEvents } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { sql } from "drizzle-orm";
import { createInbox, type Inbox } from "./inbox";
import { fakeRawTransaction, fakeSignature } from "./testing";

let handle: DbHandle;
let inbox: Inbox;

beforeAll(async () => {
  handle = await createTestDb("indexer");
  inbox = createInbox(handle.db);
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(webhookEvents);
});

async function insertEvent(receivedSecondsAgo: number, processed: boolean): Promise<void> {
  const signature = fakeSignature();
  await handle.db.execute(sql`
    insert into webhook_events (id, provider, signature, payload, received_at, processed_at)
    values (
      ${Bun.randomUUIDv7()}, 'helius', ${signature}, ${JSON.stringify(fakeRawTransaction(signature))}::jsonb,
      now() - make_interval(secs => ${receivedSecondsAgo}),
      ${processed ? sql`now()` : sql`null`}
    )
  `);
}

describe("stats", () => {
  test("reports an empty inbox", async () => {
    expect(await inbox.stats()).toEqual({ pending: 0, oldestPendingSeconds: null });
  });

  test("counts only pending events and measures the oldest one", async () => {
    await insertEvent(90, false);
    await insertEvent(5, false);
    await insertEvent(600, true);

    const stats = await inbox.stats();
    expect(stats.pending).toBe(2);
    expect(stats.oldestPendingSeconds).toBeGreaterThanOrEqual(90);
    expect(stats.oldestPendingSeconds).toBeLessThan(120);
  });
});
