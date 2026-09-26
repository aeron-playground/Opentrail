import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, transfers, users, webhookEvents } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { createInbox, type Inbox, MAX_ATTEMPTS } from "../inbox";
import { capturedLogger, fakeSignature, insertUser, loadFixture } from "../testing";
import { processInboxJob } from "./process-inbox";

// A real mainnet account from the fixture (public data). The user owning it is made up.
const USDC_RECEIVER = "7uTT8Xi5RWXzy7h9XL244GRgEycDYDhLjr3ZyNdXi8pZ";
const USDC_SIGNATURE =
  "3AeyuLVPMr53xVWnf1jLsnFCCAtRTUBCtF9yQMAK5iTTxBXZAXeg345HnGutQs6asRs7d1d9BaQrjnsH71ZAUrs4";

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
  await handle.db.delete(transfers);
  await handle.db.delete(users);
});

async function eventBySignature(signature: string) {
  const [row] = await handle.db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.signature, signature));
  return row;
}

describe("processInboxJob", () => {
  test("turns a saved delivery into a transfer and marks it processed", async () => {
    await insertUser(handle.db, USDC_RECEIVER);
    await inbox.save("helius", [
      { signature: USDC_SIGNATURE, payload: await loadFixture("transfer-usdc") },
    ]);
    const { logger, lines } = capturedLogger();

    await processInboxJob({ inbox, logger }).run();

    expect(await handle.db.$count(transfers)).toBe(1);
    expect((await eventBySignature(USDC_SIGNATURE))?.processedAt).toBeInstanceOf(Date);
    expect(lines).toContainEqual(
      expect.objectContaining({ msg: "deposits recorded", signature: USDC_SIGNATURE, deposits: 1 }),
    );
  });

  test("tries a broken delivery on each run, then sets it aside, never blocking the next", async () => {
    await insertUser(handle.db, USDC_RECEIVER);
    const broken = fakeSignature();
    await inbox.save("helius", [{ signature: broken, payload: { not: "a transaction" } }]);
    await inbox.save("helius", [
      { signature: USDC_SIGNATURE, payload: await loadFixture("transfer-usdc") },
    ]);
    const { logger, lines } = capturedLogger();
    const job = processInboxJob({ inbox, logger });

    await job.run();
    // The good delivery behind the broken one went through on the first run.
    expect(await handle.db.$count(transfers)).toBe(1);

    for (let run = 2; run <= MAX_ATTEMPTS + 1; run += 1) {
      await job.run();
    }

    expect(await eventBySignature(broken)).toMatchObject({
      processedAt: null,
      attempts: MAX_ATTEMPTS,
      lastError: expect.stringContaining("Not a transaction in the RPC shape"),
    });
    const failures = lines.filter((line) => line.signature === broken);
    expect(failures.map((line) => line.msg)).toEqual([
      ...Array(MAX_ATTEMPTS - 1).fill("webhook event failed; it will be tried again"),
      "webhook event set aside after failing too often",
    ]);
    expect(failures.at(-1)).toMatchObject({ level: "error", attempts: MAX_ATTEMPTS });
  });

  test("keeps the transaction itself out of the logs", async () => {
    const payload = await loadFixture("transfer-usdc");
    // Broken on purpose: its block time is gone, so processing fails and logs.
    await inbox.save("helius", [
      { signature: USDC_SIGNATURE, payload: { ...payload, blockTime: null } },
    ]);
    const { logger, lines } = capturedLogger();

    await processInboxJob({ inbox, logger }).run();

    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain("accountKeys");
  });

  test("does nothing when the inbox is empty", async () => {
    const { logger, lines } = capturedLogger();
    await processInboxJob({ inbox, logger }).run();
    expect(lines).toEqual([]);
  });
});
