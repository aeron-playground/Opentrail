// Runs tasks one after another, each starting at least `gapMs` after the previous one started.
// Jupiter's free plan allows one request a second across all of our calls, so every Jupiter
// request in the indexer goes through one of these.
export type RateLimit = <T>(task: () => Promise<T>) => Promise<T>;

export function createRateLimit(
  gapMs: number,
  {
    now = Date.now,
    sleep = Bun.sleep,
  }: { now?: () => number; sleep?: (ms: number) => Promise<unknown> } = {},
): RateLimit {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;
  return (task) => {
    const run = queue.then(async () => {
      const wait = lastStart + gapMs - now();
      if (wait > 0) {
        await sleep(wait);
      }
      lastStart = now();
      return task();
    });
    // A failed task still frees the queue for the next one.
    queue = run.catch(() => {});
    return run;
  };
}
