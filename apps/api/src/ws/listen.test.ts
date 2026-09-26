import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
  const forwarding = forwardBalanceChanges({
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
  await forwarding.listening;

  const notify = (payload: string) =>
    handle.db.execute(sql`select pg_notify(${BALANCE_CHANGED_CHANNEL}, ${payload})`);
  await notify("not-a-user-id");
  await notify(USER_ID);
  // Notifications arrive in order, so the bad one has been handled by now.
  await arrived.promise;
  await forwarding.stop();

  expect(sent).toEqual([[USER_ID, { v: 1, type: "balance.changed" }]]);
  expect(lines).toContainEqual(
    expect.objectContaining({
      level: "warn",
      msg: "balance_changed notification without a user id",
    }),
  );
  expect(JSON.stringify(lines)).not.toContain("not-a-user-id");
});

describe("while Postgres doesn't answer", () => {
  const noHub = { sendToUser: () => 0 };

  test("tries again until it can listen", async () => {
    let tries = 0;
    const { logger, lines } = capturedLogger();
    const forwarding = forwardBalanceChanges({
      listen: async () => {
        tries += 1;
        if (tries < 3) {
          throw new Error("connection refused");
        }
        return async () => {};
      },
      hub: noHub,
      logger,
      retryMs: 5,
    });

    await forwarding.listening;

    expect(tries).toBe(3);
    expect(lines.filter((line) => line.level === "warn")).toHaveLength(2);
    await forwarding.stop();
  });

  test("stops trying once stopped", async () => {
    let tries = 0;
    const forwarding = forwardBalanceChanges({
      listen: async () => {
        tries += 1;
        throw new Error("connection refused");
      },
      hub: noHub,
      logger: capturedLogger().logger,
      retryMs: 5,
    });

    await Bun.sleep(1);
    await forwarding.stop();
    const triesWhenStopped = tries;
    await Bun.sleep(30);

    expect(tries).toBe(triesWhenStopped);
  });

  test("stays quiet about a listen that fails after it was stopped", async () => {
    const answer = Promise.withResolvers<() => Promise<void>>();
    let tries = 0;
    const { logger, lines } = capturedLogger();
    const forwarding = forwardBalanceChanges({
      listen: () => {
        tries += 1;
        return answer.promise;
      },
      hub: noHub,
      logger,
      retryMs: 5,
    });

    await forwarding.stop();
    answer.reject(new Error("connection refused"));
    await Bun.sleep(30);

    expect(tries).toBe(1);
    expect(lines).toEqual([]);
  });

  test("lets go of a listen that succeeds after it was stopped", async () => {
    const answer = Promise.withResolvers<() => Promise<void>>();
    let unlistened = false;
    const forwarding = forwardBalanceChanges({
      listen: () => answer.promise,
      hub: noHub,
      logger: capturedLogger().logger,
    });

    await forwarding.stop();
    answer.resolve(async () => {
      unlistened = true;
    });
    await Bun.sleep(1);

    expect(unlistened).toBe(true);
  });
});
