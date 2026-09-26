import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { DbHandle } from "../client";
import { postgresErrorCode } from "../errors";
import { createTestDb } from "../testing";
import { type NewWebhookEvent, webhookEvents } from "./webhook-events";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(webhookEvents);
});

function newEvent(overrides: Partial<NewWebhookEvent> = {}): NewWebhookEvent {
  return {
    provider: "helius",
    signature: `sig-${crypto.randomUUID()}`,
    payload: { transaction: { signatures: ["placeholder"] } },
    ...overrides,
  };
}

async function rawInsertError(provider: string, attempts: number): Promise<string | undefined> {
  try {
    await handle.db.execute(sql`
      insert into webhook_events (id, provider, signature, payload, attempts)
      values (${Bun.randomUUIDv7()}, ${provider}, ${crypto.randomUUID()}, '{}'::jsonb, ${attempts})
    `);
    return undefined;
  } catch (error) {
    return postgresErrorCode(error);
  }
}

describe("webhook_events", () => {
  test("new events get a UUIDv7 id, a receive time and no attempts", async () => {
    const [event] = await handle.db.insert(webhookEvents).values(newEvent()).returning();

    expect(event?.id).toMatch(UUID_V7);
    expect(event?.receivedAt).toBeInstanceOf(Date);
    expect(event?.processedAt).toBeNull();
    expect(event?.attempts).toBe(0);
    expect(event?.lastError).toBeNull();
  });

  test("keeps the payload exactly as sent", async () => {
    const payload = { transaction: { signatures: ["abc"] }, meta: { fee: 5000, err: null } };
    const [event] = await handle.db.insert(webhookEvents).values(newEvent({ payload })).returning();
    expect(event?.payload).toEqual(payload);
  });

  test("stores one row per provider and signature", async () => {
    const event = newEvent({ signature: "same-signature" });
    await handle.db.insert(webhookEvents).values(event);

    let code: string | undefined;
    try {
      await handle.db.insert(webhookEvents).values(event);
    } catch (error) {
      code = postgresErrorCode(error);
    }
    expect(code).toBe(UNIQUE_VIOLATION);

    const repeated = await handle.db
      .insert(webhookEvents)
      .values(event)
      .onConflictDoNothing()
      .returning();
    expect(repeated).toHaveLength(0);
  });

  const checks: { name: string; provider: string; attempts: number; code?: string }[] = [
    { name: "a known provider", provider: "helius", attempts: 0 },
    { name: "an unknown provider", provider: "other", attempts: 0, code: CHECK_VIOLATION },
    { name: "negative attempts", provider: "helius", attempts: -1, code: CHECK_VIOLATION },
  ];

  for (const { name, provider, attempts, code } of checks) {
    test(`${code ? "refuses" : "accepts"} ${name}`, async () => {
      expect(await rawInsertError(provider, attempts)).toBe(code);
    });
  }

  test("indexes only the events that are still pending", async () => {
    const [index] = await handle.db.execute<{ indexdef: string }>(sql`
      select indexdef from pg_indexes where indexname = 'webhook_events_pending_idx'
    `);
    expect(index?.indexdef).toContain("(received_at)");
    expect(index?.indexdef).toContain("WHERE (processed_at IS NULL)");
  });
});
