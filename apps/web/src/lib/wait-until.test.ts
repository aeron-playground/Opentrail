import { describe, expect, test } from "bun:test";
import { waitUntil } from "./wait-until";

describe("waitUntil", () => {
  test("resolves at once when already ready", async () => {
    let checks = 0;
    await waitUntil(() => ++checks > 0, { timeoutMs: 100 });
    expect(checks).toBe(1);
  });

  test("waits until ready", async () => {
    let checks = 0;
    await waitUntil(() => ++checks >= 3, { timeoutMs: 1000, intervalMs: 5 });
    expect(checks).toBe(3);
  });

  test("gives up after the timeout", async () => {
    await expect(waitUntil(() => false, { timeoutMs: 30, intervalMs: 5 })).rejects.toThrow(
      "Not ready after 30 ms.",
    );
  });
});
