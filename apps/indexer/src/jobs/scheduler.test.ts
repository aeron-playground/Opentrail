import { describe, expect, test } from "bun:test";
import { createLogger } from "@repo/server";
import { capturedLogger } from "../testing";
import { createScheduler, type Job } from "./scheduler";

const silent = createLogger("silent");

// Polls until the condition holds, so the tests don't depend on exact timings.
async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("condition not met in time");
    }
    await Bun.sleep(5);
  }
}

describe("createScheduler", () => {
  test("runs each job at start, then again after its interval", async () => {
    let runs = 0;
    const scheduler = createScheduler(
      [{ name: "count", everyMs: 10, run: async () => void runs++ }],
      silent,
    );
    scheduler.start();
    await waitFor(() => runs >= 3);
    await scheduler.stop();
    expect(runs).toBeGreaterThanOrEqual(3);
  });

  test("never runs a job twice at the same time", async () => {
    let active = 0;
    let mostAtOnce = 0;
    let runs = 0;
    const slow: Job = {
      name: "slow",
      everyMs: 0,
      run: async () => {
        active++;
        mostAtOnce = Math.max(mostAtOnce, active);
        await Bun.sleep(20);
        active--;
        runs++;
      },
    };
    const scheduler = createScheduler([slow], silent);
    scheduler.start();
    await waitFor(() => runs >= 3);
    await scheduler.stop();
    expect(mostAtOnce).toBe(1);
  });

  test("logs a failed run and keeps going", async () => {
    const { logger, lines } = capturedLogger();
    let runs = 0;
    const flaky: Job = {
      name: "flaky",
      everyMs: 5,
      run: async () => {
        runs++;
        if (runs === 1) {
          throw new Error("first run fails");
        }
      },
    };
    const scheduler = createScheduler([flaky], logger);
    scheduler.start();
    await waitFor(() => runs >= 3);
    await scheduler.stop();

    const failures = lines.filter((line) => line.msg === "job failed");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      level: "error",
      job: "flaky",
      err: { message: "first run fails" },
    });
  });

  test("stop waits for a running job, then runs nothing more", async () => {
    let release = () => {};
    let runs = 0;
    let finished = false;
    const blocking: Job = {
      name: "blocking",
      everyMs: 5,
      run: async () => {
        runs++;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        finished = true;
      },
    };
    const scheduler = createScheduler([blocking], silent);
    scheduler.start();
    await waitFor(() => runs === 1);

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await Bun.sleep(20);
    expect(stopped).toBe(false);

    release();
    await stopping;
    expect(finished).toBe(true);
    await Bun.sleep(30);
    expect(runs).toBe(1);
  });

  test("refuses two jobs with the same name", () => {
    const job: Job = { name: "twice", everyMs: 10, run: async () => {} };
    expect(() => createScheduler([job, job], silent)).toThrow("unique name");
  });
});
