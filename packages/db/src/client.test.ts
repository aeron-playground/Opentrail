import { describe, expect, test } from "bun:test";
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
