import type { Logger } from "@repo/server";

export type Job = {
  name: string;
  // The pause between the end of one run and the start of the next, so a job never overlaps
  // with itself, however long a run takes.
  everyMs: number;
  run: () => Promise<void>;
};

export type Scheduler = {
  start(): void;
  // Stops scheduling new runs and waits for the running ones to finish.
  stop(): Promise<void>;
};

export function createScheduler(jobs: Job[], logger: Logger): Scheduler {
  const names = new Set(jobs.map((job) => job.name));
  if (names.size !== jobs.length) {
    throw new Error("Every job needs a unique name.");
  }

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const running = new Set<Promise<void>>();
  let stopped = true;

  async function runOnce(job: Job): Promise<void> {
    const startedAt = performance.now();
    try {
      await job.run();
      logger.debug(
        { job: job.name, durationMs: Math.round(performance.now() - startedAt) },
        "job finished",
      );
    } catch (error) {
      // A failed run is logged and tried again next time. It never stops the other jobs.
      logger.error({ err: error, job: job.name }, "job failed");
    }
  }

  function loop(job: Job): void {
    if (stopped) {
      return;
    }
    const run = runOnce(job);
    running.add(run);
    run.finally(() => {
      running.delete(run);
      if (!stopped) {
        timers.set(
          job.name,
          setTimeout(() => loop(job), job.everyMs),
        );
      }
    });
  }

  return {
    start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      for (const job of jobs) {
        loop(job);
      }
    },
    async stop() {
      stopped = true;
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      await Promise.all(running);
    },
  };
}
