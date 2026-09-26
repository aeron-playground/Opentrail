import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { createFakeHelius } from "../providers/helius/fake";
import { capturedLogger, insertUser } from "../testing";
import { createWatchList, type WatchList } from "../watch-list";
import { syncWebhookAddressesJob } from "./sync-webhook-addresses";

let handle: DbHandle;
let watchList: WatchList;

beforeAll(async () => {
  handle = await createTestDb("indexer");
  watchList = createWatchList(handle.db);
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(users);
});

describe("syncWebhookAddressesJob", () => {
  test("adds new users' wallets to the webhook and marks them watched", async () => {
    await insertUser(handle.db, "MadeUpWalletA");
    await insertUser(handle.db, "MadeUpWalletB");
    const helius = createFakeHelius();
    const { logger, lines } = capturedLogger();

    await syncWebhookAddressesJob({ watchList, helius, logger }).run();

    expect([...helius.addresses].sort()).toEqual(["MadeUpWalletA", "MadeUpWalletB"]);
    expect(await watchList.unwatched(10)).toEqual([]);
    expect(lines).toContainEqual(
      expect.objectContaining({
        msg: "wallets added to the Helius webhook",
        added: 2,
        watching: 2,
      }),
    );
  });

  test("marks nobody when Helius fails, so the next run tries again", async () => {
    await insertUser(handle.db, "MadeUpWalletA");
    const helius = createFakeHelius();
    const job = syncWebhookAddressesJob({ watchList, helius, logger: capturedLogger().logger });

    helius.failWith(new Error("Helius is down"));
    await expect(job.run()).rejects.toThrow("Helius is down");
    expect(await watchList.unwatched(10)).toHaveLength(1);

    helius.failWith(null);
    await job.run();
    expect([...helius.addresses]).toEqual(["MadeUpWalletA"]);
    expect(await watchList.unwatched(10)).toEqual([]);
  });

  test("calls Helius only when there's someone to add", async () => {
    const helius = createFakeHelius();
    helius.failWith(new Error("Helius was called"));
    const { logger, lines } = capturedLogger();

    await syncWebhookAddressesJob({ watchList, helius, logger }).run();

    expect(lines).toEqual([]);
  });
});
