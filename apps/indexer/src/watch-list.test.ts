import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { eq, sql } from "drizzle-orm";
import { insertUser } from "./testing";
import { createWatchList, type WatchList } from "./watch-list";

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

// A user whose account is `ageSeconds` old. The wallet is made up.
async function userAged(ageSeconds: number, wallet: string): Promise<string> {
  const id = await insertUser(handle.db, wallet);
  await handle.db
    .update(users)
    .set({ createdAt: sql`now() - make_interval(secs => ${ageSeconds})` })
    .where(eq(users.id, id));
  return id;
}

describe("watch list", () => {
  test("lists unwatched wallets oldest first, up to the limit", async () => {
    const newer = await userAged(10, "MadeUpWalletNewer");
    const oldest = await userAged(30, "MadeUpWalletOldest");
    await userAged(5, "MadeUpWalletNewest");

    expect(await watchList.unwatched(2)).toEqual([
      { userId: oldest, walletAddress: "MadeUpWalletOldest" },
      { userId: newer, walletAddress: "MadeUpWalletNewer" },
    ]);
  });

  test("stops listing a wallet once it's marked watched", async () => {
    const watched = await userAged(30, "MadeUpWalletA");
    const other = await userAged(10, "MadeUpWalletB");

    await watchList.markWatched([watched]);

    expect((await watchList.unwatched(10)).map(({ userId }) => userId)).toEqual([other]);
    const [row] = await handle.db.select().from(users).where(eq(users.id, watched));
    expect(row?.webhookRegisteredAt).toBeInstanceOf(Date);
  });

  test("marks nothing for an empty list", async () => {
    await userAged(10, "MadeUpWalletA");
    await watchList.markWatched([]);
    expect(await watchList.unwatched(10)).toHaveLength(1);
  });
});
