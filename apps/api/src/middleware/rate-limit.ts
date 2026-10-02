import { AppError } from "@repo/server";
import type { MiddlewareHandler } from "hono";
import type { AuthEnv } from "./auth";

export type PerUserLimit = {
  // Requests allowed per person in each window.
  limit: number;
  windowMs: number;
  now?: () => number;
  // At most this many people are counted at once; the oldest is forgotten past it.
  maxPeople?: number;
};

/**
 * A per-person limit for a costly route, counted in fixed windows. It lives in memory, so it
 * holds for one API instance, which is all v1 runs. A fixed window can let up to twice the limit
 * through around its edge; for these limits that's fine, and it costs one counter per person.
 * Goes after requireAuth, which sets the person.
 */
export function limitPerUser({
  limit,
  windowMs,
  now = Date.now,
  maxPeople = 100_000,
}: PerUserLimit): MiddlewareHandler<AuthEnv> {
  // In the order windows started, so the first entry is the oldest.
  const windows = new Map<string, { start: number; count: number }>();

  return async (c, next) => {
    const person = c.var.privyDid;
    const time = now();
    let window = windows.get(person);
    if (!window || time - window.start >= windowMs) {
      window = { start: time, count: 0 };
      windows.delete(person);
      windows.set(person, window);
      if (windows.size > maxPeople) {
        const oldest = windows.keys().next().value;
        if (oldest !== undefined) {
          windows.delete(oldest);
        }
      }
    }
    if (window.count >= limit) {
      throw new AppError("RATE_LIMITED", {
        retryAfterSeconds: Math.ceil((window.start + windowMs - time) / 1000),
      });
    }
    window.count += 1;
    await next();
  };
}
