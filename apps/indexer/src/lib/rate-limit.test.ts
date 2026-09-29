import { describe, expect, test } from "bun:test";
import { createRateLimit } from "./rate-limit";

// A clock that only moves when the test sleeps.
function fakeClock() {
  let time = 1_000;
  const sleeps: number[] = [];
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
    advance: (ms: number) => {
      time += ms;
    },
    sleeps,
  };
}

describe("createRateLimit", () => {
  test("runs the first task at once, and spaces the next ones by the gap", async () => {
    const clock = fakeClock();
    const limit = createRateLimit(1_000, clock);
    const starts: number[] = [];
    const task = async () => {
      starts.push(clock.now());
    };

    await Promise.all([limit(task), limit(task), limit(task)]);

    expect(starts).toEqual([1_000, 2_000, 3_000]);
    expect(clock.sleeps).toEqual([1_000, 1_000]);
  });

  test("doesn't wait when the gap has already passed", async () => {
    const clock = fakeClock();
    const limit = createRateLimit(1_000, clock);
    await limit(async () => {});
    clock.advance(5_000);

    await limit(async () => {});

    expect(clock.sleeps).toEqual([]);
  });

  test("passes each task's answer and error back to its own caller", async () => {
    const limit = createRateLimit(0, fakeClock());
    const failing = limit(async () => {
      throw new Error("Jupiter answered 429");
    });
    const working = limit(async () => "prices");

    await expect(failing).rejects.toThrow("Jupiter answered 429");
    expect(await working).toBe("prices");
  });
});
