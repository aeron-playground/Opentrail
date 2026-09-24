// Helpers for this app's tests. Never import this from app code.
import { createLogger, type Logger } from "@repo/server";
import type { Inbox } from "./inbox";

// Long enough for the settings check. Used only by tests.
export const TEST_WEBHOOK_SECRET = "test-webhook-secret-that-is-long-enough";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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

// A made-up signature in the right format (88 base58 characters). It names no real transaction.
export function fakeSignature(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(88)), (byte) =>
    BASE58.charAt(byte % BASE58.length),
  ).join("");
}

// The shape of one transaction in a Helius raw webhook delivery, with made-up content.
export function fakeRawTransaction(signature = fakeSignature()) {
  return {
    slot: 1,
    blockTime: 1_700_000_000,
    transaction: { signatures: [signature], message: { accountKeys: [], instructions: [] } },
    meta: { err: null, fee: 5000, preBalances: [], postBalances: [] },
  };
}

// An inbox without a database, for tests that don't need one.
export function fakeInbox(overrides: Partial<Inbox> = {}): Inbox {
  return {
    save: async (_provider, events) => events.length,
    stats: async () => ({ pending: 0, oldestPendingSeconds: null }),
    deleteProcessedBefore: async () => 0,
    ...overrides,
  };
}
