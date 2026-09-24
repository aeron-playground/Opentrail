import { expect, test } from "bun:test";
import { withTimeout } from "./timeout";

test("passes on the value of a promise that settles in time", async () => {
  await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
});

test("passes on the error of a promise that fails in time", async () => {
  await expect(withTimeout(Promise.reject(new Error("refused")), 50)).rejects.toThrow("refused");
});

test("rejects when the promise takes too long", async () => {
  await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow("No answer within 10 ms");
});
