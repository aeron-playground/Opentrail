import { afterAll, beforeAll, expect, test } from "bun:test";
import { BALANCE_CHANGED_CHANNEL, type DbHandle } from "@repo/db";
import { connectTestDb } from "@repo/db/testing";
import type { WsServerMessage } from "@repo/shared/ws";
import { sql } from "drizzle-orm";
import { capturedLogger } from "../testing";
import { forwardBalanceChanges } from "./listen";

const USER_ID = "0192b6f0-7c1e-7a3b-9d7e-3f5c1a2b4d6e";

let handle: DbHandle;

beforeAll(() => {
  handle = connectTestDb();
});

afterAll(async () => {
  await handle.close();
});

test("passes each user id from the indexer to the hub, and skips anything else", async () => {
  const sent: [string, WsServerMessage][] = [];
  const arrived = Promise.withResolvers<void>();
  const { logger, lines } = capturedLogger();
  const stop = await forwardBalanceChanges({
    listen: handle.listen,
    hub: {
      sendToUser: (userId, message) => {
        sent.push([userId, message]);
        arrived.resolve();
        return 1;
      },
    },
    logger,
  });

  const notify = (payload: string) =>
    handle.db.execute(sql`select pg_notify(${BALANCE_CHANGED_CHANNEL}, ${payload})`);
  await notify("not-a-user-id");
  await notify(USER_ID);
  // Notifications arrive in order, so the bad one has been handled by now.
  await arrived.promise;
  await stop();

  expect(sent).toEqual([[USER_ID, { v: 1, type: "balance.changed" }]]);
  expect(lines).toContainEqual(
    expect.objectContaining({
      level: "warn",
      msg: "balance_changed notification without a user id",
    }),
  );
  expect(JSON.stringify(lines)).not.toContain("not-a-user-id");
});
