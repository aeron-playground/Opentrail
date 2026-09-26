import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "./client";
import { connectTestDb } from "./testing";

describe("ping", () => {
  test("resolves when the database answers", async () => {
    const { ping, close } = connectTestDb();
    try {
      await expect(ping()).resolves.toBeUndefined();
    } finally {
      await close();
    }
  });

  test("rejects when nothing listens at the address", async () => {
    // Port 1 on the loopback interface refuses connections at once, so this never waits.
    const { ping, close } = createDb("postgres://app:app@127.0.0.1:1/app_test");
    try {
      await expect(ping()).rejects.toThrow();
    } finally {
      await close();
    }
  });
});

describe("listen", () => {
  test("hands over each notification's payload until it stops", async () => {
    const { db, listen, close } = connectTestDb();
    const notify = (payload: string) =>
      db.execute(sql`select pg_notify('client_test', ${payload})`);
    try {
      const first: string[] = [];
      const firstArrived = Promise.withResolvers<void>();
      const stop = await listen("client_test", (payload) => {
        first.push(payload);
        firstArrived.resolve();
      });
      await notify("one");
      await firstArrived.promise;
      await stop();

      await notify("two");
      // Notifications arrive in order, so once "three" reaches a new listener, "two" would
      // already have reached the first one if it were still listening.
      const second = Promise.withResolvers<string>();
      await listen("client_test", second.resolve);
      await notify("three");

      expect(await second.promise).toBe("three");
      expect(first).toEqual(["one"]);
    } finally {
      await close();
    }
  });
});
