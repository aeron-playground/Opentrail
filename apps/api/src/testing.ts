// Helpers for this app's tests. Never import this from app code.
import { createLogger, type Logger } from "@repo/server";
import type { AppDeps } from "./app";
import { createFakePrivy } from "./providers/privy/fake";

// An app that works without a database or Privy: health is up, and nobody is signed in.
// Tests override the parts they exercise.
export function testAppDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    logger: createLogger("silent"),
    corsOrigins: [],
    checkDatabase: async () => {},
    privy: createFakePrivy(),
    users: { getOrCreate: () => Promise.reject(new Error("This test has no user service")) },
    usernames: {
      availability: () => Promise.reject(new Error("This test has no username service")),
      suggest: () => Promise.reject(new Error("This test has no username service")),
      change: () => Promise.reject(new Error("This test has no username service")),
      changeableAt: () => null,
    },
    ...overrides,
  };
}

// A logger that keeps its lines in memory, so tests can check what was logged.
export function capturedLogger(): { logger: Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger("debug", {
    write: (line) => {
      lines.push(JSON.parse(line));
    },
  });
  return { logger, lines };
}

// Hands out the given names in order, for tests that need usernames to clash.
export function namesInOrder(...names: string[]): () => string {
  let next = 0;
  return () => {
    const name = names[next];
    next += 1;
    if (name === undefined) {
      throw new Error("The test ran out of usernames");
    }
    return name;
  };
}
