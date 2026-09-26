import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, webhookEvents } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { eq, sql } from "drizzle-orm";
import { createInbox, type Inbox, MAX_ATTEMPTS } from "./inbox";
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

async function insertEvent(
  receivedSecondsAgo: number,
  processed: boolean,
  attempts = 0,
): Promise<{ id: string; signature: string }> {
  const id = Bun.randomUUIDv7();
  const signature = fakeSignature();
  await handle.db.execute(sql`
    insert into webhook_events (id, provider, signature, payload, received_at, processed_at, attempts)
    values (
      ${id}, 'helius', ${signature}, ${JSON.stringify(fakeRawTransaction(signature))}::jsonb,
      now() - make_interval(secs => ${receivedSecondsAgo}),
      ${processed ? sql`now()` : sql`null`},
      ${attempts}
    )
  `);
  return { id, signature };
}

async function eventRow(id: string) {
  const [row] = await handle.db.select().from(webhookEvents).where(eq(webhookEvents.id, id));
  return row;
}

describe("save", () => {
  test("saves new events and returns how many were new", async () => {
    const events = [fakeSignature(), fakeSignature()].map((signature) => ({
      signature,
      payload: fakeRawTransaction(signature),
    }));
    expect(await inbox.save("helius", events)).toBe(2);
    expect(await inbox.save("helius", events)).toBe(0);
  });

  test("saves nothing for an empty list", async () => {
    expect(await inbox.save("helius", [])).toBe(0);
  });
});

describe("stats", () => {
  test("reports an empty inbox", async () => {
    expect(await inbox.stats()).toEqual({ pending: 0, oldestPendingSeconds: null, setAside: 0 });
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

  test("counts events set aside apart, and leaves them out of the oldest age", async () => {
    await insertEvent(3600, false, MAX_ATTEMPTS);
    await insertEvent(5, false, MAX_ATTEMPTS - 1);

    const stats = await inbox.stats();
    expect(stats).toMatchObject({ pending: 1, setAside: 1 });
    expect(stats.oldestPendingSeconds).toBeLessThan(60);
  });
});

describe("nextPending", () => {
  test("returns waiting events oldest first, up to the limit", async () => {
    await insertEvent(10, false);
    const oldest = await insertEvent(30, false);
    const middle = await insertEvent(20, false);
    await insertEvent(60, true);
    await insertEvent(90, false, MAX_ATTEMPTS);

    const events = await inbox.nextPending(2);
    expect(events.map((event) => event.id)).toEqual([oldest.id, middle.id]);
    expect(events[0]).toEqual({
      id: oldest.id,
      signature: oldest.signature,
      payload: fakeRawTransaction(oldest.signature),
    });
  });

  test("still returns an event that failed fewer times than the limit", async () => {
    const event = await insertEvent(10, false, MAX_ATTEMPTS - 1);
    expect((await inbox.nextPending(10)).map(({ id }) => id)).toEqual([event.id]);
  });
});

describe("complete", () => {
  test("runs the work and marks the event processed", async () => {
    const event = await insertEvent(10, false);
    let ran = false;

    expect(
      await inbox.complete(event.id, async () => {
        ran = true;
      }),
    ).toBe(true);
    expect(ran).toBe(true);
    expect((await eventRow(event.id))?.processedAt).toBeInstanceOf(Date);
  });

  test("undoes the work and leaves the event waiting when the work fails", async () => {
    const event = await insertEvent(10, false);
    const other = await insertEvent(20, true);

    const work = inbox.complete(event.id, async (tx) => {
      // Something the work wrote, which the failure must undo.
      await tx.delete(webhookEvents).where(eq(webhookEvents.id, other.id));
      throw new Error("the work broke");
    });

    await expect(work).rejects.toThrow("the work broke");
    expect((await eventRow(event.id))?.processedAt).toBeNull();
    expect(await eventRow(other.id)).toBeDefined();
  });

  test("skips the work when the event was already processed", async () => {
    const event = await insertEvent(10, true);
    let ran = false;

    expect(
      await inbox.complete(event.id, async () => {
        ran = true;
      }),
    ).toBe(false);
    expect(ran).toBe(false);
  });
});

describe("fail", () => {
  test("counts each try and keeps the latest error", async () => {
    const event = await insertEvent(10, false);

    expect(await inbox.fail(event.id, "first problem")).toBe(1);
    expect(await inbox.fail(event.id, "second problem")).toBe(2);
    expect(await eventRow(event.id)).toMatchObject({ attempts: 2, lastError: "second problem" });
  });

  test("refuses an event that doesn't exist", async () => {
    await expect(inbox.fail(Bun.randomUUIDv7(), "problem")).rejects.toThrow("No webhook event");
  });
});
