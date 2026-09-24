import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, webhookEvents } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { type App, createApp } from "../app";
import { createInbox } from "../inbox";
import { capturedLogger, fakeRawTransaction, fakeSignature, TEST_WEBHOOK_SECRET } from "../testing";
import { MAX_DELIVERY_BYTES } from "./helius";

let handle: DbHandle;
let app: App;
let lines: Record<string, unknown>[];

beforeAll(async () => {
  handle = await createTestDb("indexer");
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(webhookEvents);
  const captured = capturedLogger();
  lines = captured.lines;
  app = createApp({
    logger: captured.logger,
    inbox: createInbox(handle.db),
    webhookSecret: TEST_WEBHOOK_SECRET,
  });
});

function deliver(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/webhooks/helius", {
    method: "POST",
    headers: { authorization: TEST_WEBHOOK_SECRET, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function stored() {
  return handle.db
    .select({ signature: webhookEvents.signature, payload: webhookEvents.payload })
    .from(webhookEvents);
}

async function errorCodeOf(response: Response) {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

describe("POST /webhooks/helius", () => {
  test("saves each transaction of a delivery with its full payload", async () => {
    const delivery = [fakeRawTransaction(), fakeRawTransaction()];
    const response = await deliver(delivery);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 2, saved: 2 });
    const rows = await stored();
    expect(rows).toHaveLength(2);
    for (const transaction of delivery) {
      const row = rows.find((r) => r.signature === transaction.transaction.signatures[0]);
      expect(row?.payload).toEqual(transaction);
    }
  });

  test("adds nothing when the same delivery arrives again", async () => {
    const delivery = [fakeRawTransaction(), fakeRawTransaction()];
    await deliver(delivery);
    const response = await deliver(delivery);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 2, saved: 0 });
    expect(await stored()).toHaveLength(2);
  });

  test("saves a transaction repeated inside one delivery once", async () => {
    const transaction = fakeRawTransaction();
    const response = await deliver([transaction, transaction]);
    expect(await response.json()).toEqual({ received: 2, saved: 1 });
  });

  test("accepts an empty delivery", async () => {
    const response = await deliver([]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 0, saved: 0 });
  });

  const badSecrets: { name: string; headers: Record<string, string> }[] = [
    { name: "a wrong secret", headers: { authorization: "wrong-secret-of-some-length-000000000" } },
    {
      name: "the secret with a Bearer prefix",
      headers: { authorization: `Bearer ${TEST_WEBHOOK_SECRET}` },
    },
    { name: "an empty secret", headers: { authorization: "" } },
  ];

  for (const { name, headers } of badSecrets) {
    test(`answers ${name} with UNAUTHORIZED and saves nothing`, async () => {
      const response = await deliver([fakeRawTransaction()], headers);
      expect(response.status).toBe(401);
      expect(await errorCodeOf(response)).toBe("UNAUTHORIZED");
      expect(await stored()).toHaveLength(0);
    });
  }

  test("answers a missing secret with UNAUTHORIZED", async () => {
    const response = await app.request("/webhooks/helius", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([fakeRawTransaction()]),
    });
    expect(response.status).toBe(401);
  });

  test("checks the secret before the size, so strangers can't make it read a body", async () => {
    const response = await deliver("[]", {
      authorization: "wrong-secret-of-some-length-000000000",
      "content-length": String(MAX_DELIVERY_BYTES + 1),
    });
    expect(response.status).toBe(401);
  });

  test("refuses a delivery over the size limit and logs it as an error", async () => {
    const response = await deliver("[]", { "content-length": String(MAX_DELIVERY_BYTES + 1) });

    expect(response.status).toBe(413);
    expect(await errorCodeOf(response)).toBe("PAYLOAD_TOO_LARGE");
    expect(lines.find((line) => line.level === "error")?.msg).toContain("size limit");
  });

  const badBodies: { name: string; body: unknown }[] = [
    { name: "malformed JSON", body: "[{not json" },
    { name: "an object instead of a list", body: { transaction: {} } },
    { name: "an enhanced-webhook item", body: [{ signature: fakeSignature(), type: "SWAP" }] },
    {
      name: "a signature in the wrong format",
      body: [{ transaction: { signatures: ["not-base58-0OIl"] } }],
    },
    { name: "a transaction without signatures", body: [{ transaction: { signatures: [] } }] },
  ];

  for (const { name, body } of badBodies) {
    test(`answers ${name} with VALIDATION_FAILED and saves nothing`, async () => {
      const response = await deliver(body);
      expect(response.status).toBe(400);
      expect(await errorCodeOf(response)).toBe("VALIDATION_FAILED");
      expect(await stored()).toHaveLength(0);
    });
  }

  test("logs a warning when a delivery has an unexpected shape", async () => {
    await deliver([{ signature: fakeSignature(), type: "SWAP" }]);
    expect(lines.find((line) => line.level === "warn")?.msg).toBe(
      "Helius delivery has an unexpected shape",
    );
  });
});
